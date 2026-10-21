// =====================================================================
//  AFK Dungeon · Founding Raiders doğrulama fonksiyonu (Supabase Edge Function "raid").
//  raid.html bunu oyuncunun anonim oturum anahtarıyla çağırır. Yaptıkları:
//   - wallet: cüzdan imzasını doğrular (gas yok) ve cüzdanı bağlar. Cüzdan başka bir tarayıcıda zaten bağlıysa
//             o kayıt bu tarayıcıya taşınır (imza sahipliği kanıtlar).
//   - x:      oyuncunun kodunu içeren tweet'i X'in herkese açık oEmbed servisiyle doğrular, X hesabını bağlar.
//   - reply / post: tweet'in o X hesabına ait olduğunu ve #AFKDungeon içerdiğini doğrular.
//  X API anahtarı gerekmez. Takip/beğeni/repost ücretsiz API ile doğrulanamaz (raid_task, sayfa işaretler).
//  Veritabanına service role ile yazar; kurallar supabase/07_raid.sql ile aynıdır.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { verifyMessage } from 'npm:viem@2.21.32';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

// raid.html aynı metni imzalatır (src/raid/raid.js → walletMessage)
export const walletMessage = (address: string, nonce: string) =>
  `AFK Dungeon · Founding Raiders\n\nSign to link this wallet to the raid. This is free and sends no transaction.\n\nWallet: ${address}\nNonce: ${nonce}`;

const TWEET_RE = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i;

async function oembed(url: string) {
  const m = TWEET_RE.exec(url.trim());
  if (!m) return { error: 'bad_tweet_url' };
  const canon = `https://twitter.com/${m[1]}/status/${m[2]}`;
  const r = await fetch(`https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(canon)}`);
  if (!r.ok) return { error: r.status === 404 ? 'tweet_not_found' : 'tweet_check_failed' };
  const d = await r.json();
  const author = /(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})/i.exec(String(d.author_url || ''))?.[1];
  if (!author) return { error: 'tweet_check_failed' };
  // tweet metni (HTML etiketleri ve imza satırı olmadan)
  const html = String(d.html || '');
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? html;
  const text = p.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  return { id: m[2], author, authorDisplay: String(d.author_name || author), text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('method', 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: u } = await sb.auth.getUser(token);
  const uid = u?.user?.id;
  if (!uid) return fail('not_signed_in', 401);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return fail('bad_request'); }
  const action = String(body.action || '');

  const { data: me } = await sb.from('raiders').select('*').eq('user_id', uid).maybeSingle();
  if (!me) return fail('not_started');
  const { data: cfg } = await sb.from('raid_config').select('*').eq('id', 1).single();
  const ended = Date.now() > Date.parse(cfg.ends_at);
  const newNonce = () => crypto.randomUUID().replace(/-/g, '');

  try {
    // ---------- cüzdan ----------
    if (action === 'wallet') {
      const address = String(body.address || '').toLowerCase();
      const signature = String(body.signature || '');
      if (!/^0x[0-9a-f]{40}$/.test(address) || !/^0x[0-9a-fA-F]+$/.test(signature)) return fail('bad_wallet');
      const ok = await verifyMessage({ address: address as `0x${string}`, message: walletMessage(address, me.nonce), signature: signature as `0x${string}` })
        .catch(() => false);
      if (!ok) return fail('bad_signature');
      if (me.wallet && me.wallet !== address) return fail('wallet_already_set');
      const { data: other } = await sb.from('raiders').select('id').eq('wallet', address).neq('id', me.id).maybeSingle();
      if (other) {
        // aynı cüzdan başka tarayıcıda bağlı: o kaydı bu tarayıcıya taşı (bu tarayıcının boş kaydı silinir)
        if (me.x_handle) return fail('wallet_taken');
        await sb.from('raiders').delete().eq('id', me.id);
        await sb.from('raiders').update({ user_id: uid, nonce: newNonce(), updated_at: new Date().toISOString() }).eq('id', other.id);
        return json({ ok: true, moved: true });
      }
      await sb.from('raiders').update({ wallet: address, nonce: newNonce(), updated_at: new Date().toISOString() }).eq('id', me.id);
      return json({ ok: true });
    }

    // ---------- X hesabı ----------
    if (action === 'x') {
      if (!me.wallet) return fail('need_wallet');
      if (me.x_handle) return fail('x_already_set');
      const t = await oembed(String(body.url || ''));
      if ('error' in t) return fail(t.error!);
      if (!t.text.toUpperCase().includes(String(me.code).toUpperCase())) return fail('code_missing');
      const handle = t.author.toLowerCase();
      const { data: taken } = await sb.from('raiders').select('id').eq('x_handle', handle).neq('id', me.id).maybeSingle();
      if (taken) return fail('x_taken');
      const { error: dup } = await sb.from('raid_tweets').insert({ tweet_id: t.id, raider_id: me.id, kind: 'x' });
      if (dup) return fail('tweet_used');
      const upd: Record<string, unknown> = { x_handle: handle, x_display: t.author, x_tweet: t.id, x_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      // davet: linkle geldiyse, X doğrulanınca bağlanır (kendini ve karşılıklı daveti saymaz)
      if (me.ref_pending && !me.invited_by) {
        const { data: inv } = await sb.from('raiders').select('id, invited_by').eq('code', me.ref_pending).maybeSingle();
        if (inv && inv.id !== me.id && inv.invited_by !== me.id) upd.invited_by = inv.id;
      }
      await sb.from('raiders').update(upd).eq('id', me.id);
      return json({ ok: true, x: t.author });
    }

    // ---------- yanıt / paylaşım ----------
    if (action === 'reply' || action === 'post') {
      if (!me.x_handle) return fail('need_x');
      if (ended) return fail('raid_ended');
      if (action === 'reply' && me.reply_tweet) return json({ ok: true });
      if (action === 'post' && me.post_tweet) return json({ ok: true });
      const t = await oembed(String(body.url || ''));
      if ('error' in t) return fail(t.error!);
      if (t.author.toLowerCase() !== me.x_handle) return fail('not_your_tweet');
      const low = t.text.toLowerCase();
      const okText = low.includes('afkdungeon') || low.includes('afk dungeon') || low.includes('afkgame') || low.includes('@' + String(cfg.x_handle).toLowerCase());
      if (!okText) return fail(action === 'reply' ? 'reply_text' : 'post_text');
      const { error: dup } = await sb.from('raid_tweets').insert({ tweet_id: t.id, raider_id: me.id, kind: action });
      if (dup) return fail('tweet_used');
      await sb.from('raiders').update({ [action === 'reply' ? 'reply_tweet' : 'post_tweet']: t.id, updated_at: new Date().toISOString() }).eq('id', me.id);
      return json({ ok: true });
    }
    return fail('bad_action');
  } catch (e) {
    console.error(e);
    return fail('server_error', 500);
  }
});
