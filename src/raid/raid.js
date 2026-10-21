// =====================================================================
//  Founding Raiders sayfası (raid.html). Sunucu: supabase/07_raid.sql + Edge Function "raid".
//  Oturum: Supabase anonim hesap (oyundan ayrı anahtar). Cüzdan: tarayıcıdaki EVM cüzdanları (EIP-6963 listesi; yoksa window.ethereum).
// =====================================================================
import { CONFIG } from '../config.js';
import { drawCard, rarityColor } from './card.js';

const S = CONFIG.server, URL_ = S.url.replace(/\/$/, ''), KEY = S.key, SESSION = 'afk_raid_session_v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = `${location.origin}${location.pathname}`;
const SITE = `${location.host}${location.pathname}`.replace(/\/$/, '');

// imzalanan metin: Edge Function'daki walletMessage ile birebir aynı olmalı
const walletMessage = (address, nonce) =>
  `AFK Dungeon · Founding Raiders\n\nSign to link this wallet to the raid. This is free and sends no transaction.\n\nWallet: ${address}\nNonce: ${nonce}`;

const ERR = {
  bad_signature: 'The signature did not match this wallet. Try again.', wallet_already_set: 'This raid already has a different wallet.',
  wallet_taken: 'This wallet is linked to another raider.', need_wallet: 'Connect your wallet first.', need_x: 'Link your X account first.',
  x_already_set: 'Your X account is already linked.', bad_tweet_url: 'Paste the link of the tweet (x.com/…/status/…).',
  tweet_not_found: 'That tweet was not found. Is your account public and the tweet still up?', tweet_check_failed: 'Could not read that tweet right now. Try again in a minute.',
  code_missing: 'Your raid code is not in that tweet.', x_taken: 'That X account is linked to another raider.', tweet_used: 'That tweet was already used.',
  not_your_tweet: 'That tweet is from a different X account.', reply_text: 'Your reply needs #AFKDungeon in it.', post_text: 'Your post needs #AFKDungeon in it.',
  raid_ended: 'The raid has ended.', not_started: 'Reload the page and try again.', server_error: 'Something went wrong. Try again.',
  offline: 'Could not reach the server. Check your connection.', no_wallet: 'No wallet found in this browser.',
};
const errText = (e) => ERR[e] || ERR.server_error;

// ---------------- oturum ve sunucu ----------------
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch (e) { session = null; }
const keep = (d) => {
  session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
  try { localStorage.setItem(SESSION, JSON.stringify(session)); } catch (e) { /* yok */ }
};
async function call(path, body, auth = true) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (auth && session) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetch(URL_ + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
  return { ok: r.ok, status: r.status, data: d };
}
async function ensureSession() {
  if (session && Date.now() < session.expires_at - 60000) return;
  if (session?.refresh_token) {
    const r = await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }, false);
    if (r.ok && r.data?.access_token) { keep(r.data); return; }
  }
  const r = await call('/auth/v1/signup', {}, false);
  if (!r.ok || !r.data?.access_token) throw new Error('offline');
  keep(r.data);
}
async function rpc(fn, args = {}) {
  try {
    await ensureSession();
    const r = await call(`/rest/v1/rpc/${fn}`, args);
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, error: r.data?.message || 'server_error' };
  } catch (e) { return { ok: false, error: 'offline' }; }
}
async function edge(action, args = {}) {
  try {
    await ensureSession();
    const r = await call('/functions/v1/raid', { action, ...args });
    return r.data && typeof r.data === 'object' ? r.data : { ok: false, error: 'server_error' };
  } catch (e) { return { ok: false, error: 'offline' }; }
}

// ---------------- durum ----------------
let me = null, board = null, busy = false;

// ---------------- cüzdanlar (EIP-6963) ----------------
// Tarayıcıdaki her EVM cüzdanı kendini duyurur (MetaMask, Phantom, OKX, Rabby, Coinbase …). Oyuncu listeden seçer;
// window.ethereum'u hangi eklenti ele geçirdiyse ona mahkum kalmayız.
const wallets = new Map();
window.addEventListener('eip6963:announceProvider', (e) => {
  const d = e.detail;
  if (!d?.info?.uuid || !d.provider) return;
  wallets.set(d.info.uuid, d);
  if (me && !me.wallet) render();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
const hasWallet = () => wallets.size > 0 || !!window.ethereum;
function pickWallet() {
  const list = [...wallets.values()].sort((a, b) => a.info.name.localeCompare(b.info.name));
  if (!list.length) return Promise.resolve(window.ethereum ? { info: { name: 'Browser wallet' }, provider: window.ethereum } : null);
  if (list.length === 1) return Promise.resolve(list[0]);
  return new Promise((resolve) => {
    const box = $('wallet-pick'), ul = $('wallet-list');
    ul.innerHTML = '';
    for (const w of list) {
      const b = document.createElement('button'); b.className = 'wp-item'; b.type = 'button';
      const icon = String(w.info.icon || '');
      if (/^data:image\/(png|svg\+xml|webp|jpeg|gif);/i.test(icon)) { const im = document.createElement('img'); im.src = icon; im.alt = ''; b.append(im); }
      else b.append(Object.assign(document.createElement('span'), { className: 'wp-ph', textContent: '◈' }));
      b.append(Object.assign(document.createElement('span'), { textContent: w.info.name }));
      b.addEventListener('click', () => { close(); resolve(w); });
      ul.append(b);
    }
    const close = () => { box.classList.add('hidden'); $('wp-cancel').onclick = null; };
    $('wp-cancel').onclick = () => { close(); resolve(null); };
    box.classList.remove('hidden');
  });
}

const ref = (() => { try { const r = new URLSearchParams(location.search).get('ref'); return r && /^[A-Za-z0-9]{4,12}$/.test(r) ? r : null; } catch (e) { return null; } })();

async function load() {
  const r = await rpc('raid_me', { p_ref: ref });
  if (!r.ok) { $('s1-msg').innerHTML = `<span class="bad">${esc(errText(r.error))}</span>`; return; }
  me = r.data;
  me._skew = Number(me.config.now) - Date.now();
  render();
  loadBoard();
}
async function loadBoard() {
  const r = await rpc('raid_board', { lim: 100 });
  if (r.ok) { board = r.data; renderBoard(); }
}
const toast = (t) => { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 3200); };
const msg = (id, html, cls = '') => { $(id).innerHTML = html ? `<span class="${cls}">${html}</span>` : ''; };
const intent = (path, params) => `https://x.com/intent/${path}?${new URLSearchParams(params)}`;
const openX = (url) => window.open(url, '_blank', 'noopener,width=600,height=640');
const ended = () => me && Date.now() + (me._skew || 0) > Number(me.config.endsAt);

// ---------------- çizim ----------------
function stepState(id, done, locked) {
  const el = $(id); el.classList.toggle('done', !!done); el.classList.toggle('locked', !!locked && !done);
}
function render() {
  const t = me.tasks, cfg = me.config, hasW = !!me.wallet, hasX = !!me.x;
  // 1 cüzdan
  stepState('s1', hasW, false);
  if (hasW) $('s1-body').innerHTML = `<div class="row"><span class="ok">✓ Connected</span><span class="code" style="font-size:14px">${esc(me.wallet.slice(0, 6))}…${esc(me.wallet.slice(-4))}</span></div>`;
  else if (hasWallet()) $('s1-body').innerHTML = `<div class="row"><button id="b-wallet">🔗 Connect wallet</button>${wallets.size > 1 ? `<span class="muted">${wallets.size} wallets found</span>` : ''}</div>`;
  else {
    const dapp = `${location.host}${location.pathname}${location.search}`;
    $('s1-body').innerHTML = `<div class="row muted">No wallet in this browser. On a phone, open this page inside your wallet app:</div>
      <div class="row"><a class="btn dark" href="https://metamask.app.link/dapp/${esc(dapp)}">MetaMask</a>
      <a class="btn dark" href="https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(location.href)}">Coinbase Wallet</a>
      <a class="btn dark" href="https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(location.href)}">Trust Wallet</a></div>
      <div class="muted" style="margin-top:6px">On a computer, install MetaMask or Rabby and reload this page.</div>`;
  }
  // 2 X
  stepState('s2', hasX, !hasW);
  if (hasX) $('s2-body').innerHTML = `<div class="row"><span class="ok">✓ Linked</span><b>@${esc(me.x)}</b>${me.invitedBy ? `<span class="muted">· invited by @${esc(me.invitedBy)}</span>` : ''}</div>`;
  else {
    const text = `I'm joining the AFK Dungeon Founding Raiders ⚔️ #AFKDungeon\n\nRaid code: ${me.code}\n\n${PAGE}?ref=${me.code}`;
    $('s2-body').innerHTML = `<div class="row">Your raid code: <span class="code">${esc(me.code)}</span></div>
      <div class="row"><button class="dark" id="b-xpost" ${hasW ? '' : 'disabled'}>𝕏 Post the tweet</button></div>
      <div class="row"><input class="grow" id="i-x" placeholder="https://x.com/you/status/…" ${hasW ? '' : 'disabled'}><button id="b-xverify" ${hasW ? '' : 'disabled'}>Verify</button></div>`;
    $('b-xpost')?.addEventListener('click', () => openX(intent('tweet', { text })));
  }
  // 3 raid
  stepState('s3', t.follow && t.like && t.repost && t.reply, !hasX);
  const tid = cfg.tweetId;
  $('s3-sub').innerHTML = tid ? `Raid <a href="${esc(cfg.postUrl)}" target="_blank" rel="noopener">our post</a> on X: follow, like, repost and reply.` : `Follow @${esc(cfg.xHandle)} now. The raid post is announced soon: like, repost and reply will open then.`;
  const task = (key, ico, title, sub, pts, url, extra = '') => `<div class="task ${t[key] ? 'done' : ''}"><div class="ico">${ico}</div>
    <div class="t"><b>${title} <span class="pts">+${pts}</span></b><small>${sub}</small>${extra}</div>
    ${t[key] ? '<span class="ok">✓ Done</span>' : `<button data-task="${key}" data-url="${esc(url || '')}" ${hasX && url && !ended() ? '' : 'disabled'}>Go</button>`}</div>`;
  $('s3-body').innerHTML =
    task('follow', '👤', `Follow @${esc(cfg.xHandle)}`, 'Opens X, then counts', 25, intent('follow', { screen_name: cfg.xHandle })) +
    task('like', '♥', 'Like the post', 'Opens X, then counts', 25, tid && intent('like', { tweet_id: tid })) +
    task('repost', '⟲', 'Repost it', 'Spread it to your followers', 25, tid && intent('retweet', { tweet_id: tid })) +
    `<div class="task ${t.reply ? 'done' : ''}"><div class="ico">💬</div><div class="t"><b>Reply to it <span class="pts">+50</span></b><small>Your reply needs #AFKDungeon. Paste your reply link to verify.</small>
      ${t.reply ? '' : `<div class="row"><button class="dark" id="b-reply" ${hasX && tid && !ended() ? '' : 'disabled'}>𝕏 Reply</button><input class="grow" id="i-reply" placeholder="https://x.com/you/status/…" ${hasX && tid ? '' : 'disabled'}><button id="b-replyv" ${hasX && tid ? '' : 'disabled'}>Verify</button></div>`}</div>
      ${t.reply ? '<span class="ok">✓ Done</span>' : ''}</div>`;
  $('b-reply')?.addEventListener('click', () => openX(intent('tweet', { in_reply_to: tid, text: `⚔️ Raiding the dungeon! #AFKDungeon` })));
  // 4 kart
  stepState('s4', t.card, !hasX);
  if (t.card && me.card) {
    $('s4-body').innerHTML = `<canvas id="card"></canvas><div class="row"><button class="dark" id="b-share">𝕏 Share on X</button><button class="plain" id="b-copy">Copy image</button><button class="plain" id="b-dl">Download</button></div>`;
    drawCard($('card'), me.card, me.x, `${SITE}?ref=${me.code}`).catch(() => {});
    $('b-share').addEventListener('click', () => openX(intent('tweet', { text: shareText() })));
    $('b-copy').addEventListener('click', copyCard);
    $('b-dl').addEventListener('click', () => { const a = document.createElement('a'); a.download = `afk-dungeon-raider-${me.card.no}.png`; a.href = $('card').toDataURL('image/png'); a.click(); });
  } else $('s4-body').innerHTML = `<div class="row"><button id="b-card" ${hasX && !ended() ? '' : 'disabled'}>🃏 Claim my card</button></div>`;
  // 5 paylaşım
  stepState('s5', t.post, !hasX);
  $('s5-body').innerHTML = t.post ? `<div class="row"><span class="ok">✓ Verified</span></div>`
    : `<div class="row"><button class="dark" id="b-post" ${hasX && !ended() ? '' : 'disabled'}>𝕏 Write the post</button><span class="muted">Tip: attach your card image (Download or Copy image above).</span></div>
       <div class="row"><input class="grow" id="i-post" placeholder="https://x.com/you/status/…" ${hasX ? '' : 'disabled'}><button id="b-postv" ${hasX ? '' : 'disabled'}>Verify</button></div>`;
  $('b-post')?.addEventListener('click', () => openX(intent('tweet', { text: shareText() })));
  // 6 davet
  stepState('s6', me.invites > 0, !hasX);
  const link = `${PAGE}?ref=${me.code}`;
  $('s6-body').innerHTML = `<div class="row"><input class="grow" id="i-ref" readonly value="${esc(link)}"><button id="b-ref">Copy invite link</button></div>
    <div class="row muted">${me.invites ? `<b>${me.invites}</b> friend${me.invites > 1 ? 's' : ''} joined through you (+${Math.min(me.invites, 50) * 50} points).` : 'Nobody yet. Friends count once they link their X.'}</div>`;
  // yan panel
  $('me-pts').textContent = me.points.toLocaleString('en-US');
  $('me-rank').textContent = me.rank ? `#${me.rank}` : '—';
  $('me-sub').innerHTML = me.status === 'rejected' ? '<span class="bad">This raid was disqualified by the team.</span>'
    : me.x ? `@${esc(me.x)}${me.card ? ` · <span style="color:${rarityColor(me.card.rarity)};font-weight:800">${esc(me.card.rarity)}</span> #${me.card.no}` : ''}` : 'Link your X to get on the leaderboard.';
  wire();
}
const shareText = () => `I just claimed my AFK Dungeon Founding Raider card ⚔️\n\n${me.card ? `#${me.card.no} · ${me.card.rarity}\n\n` : ''}Your hero fights while you sleep. Join the raid 👇 #AFKDungeon\n${PAGE}?ref=${me.code}`;

function renderBoard() {
  const el = $('board');
  $('board-total').textContent = `${(board.total || 0).toLocaleString('en-US')} raiders so far`;
  el.innerHTML = (board.rows || []).map((r, i) => `<div class="r${me?.x && r.x === me.x ? ' me' : ''}"><span class="n">${i + 1}</span>
    <span class="h"><span class="dot" style="background:${r.card ? rarityColor(r.rarity) : '#b8a888'}"></span>@${esc(r.x)}</span><b>${r.points.toLocaleString('en-US')}</b></div>`).join('')
    || '<div class="muted" style="margin-top:8px">Be the first raider!</div>';
}

async function copyCard() {
  try {
    const blob = await new Promise((res) => $('card').toBlob(res, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Card copied. Paste it into your post.');
  } catch (e) { toast('Copy is not supported here. Use Download.'); }
}

// ---------------- işlemler ----------------
const run = async (btn, fn) => {
  if (busy) return; busy = true; if (btn) btn.disabled = true;
  try { await fn(); } finally { busy = false; if (btn) btn.disabled = false; }
};
function hex(str) { return '0x' + Array.from(new TextEncoder().encode(str), (b) => b.toString(16).padStart(2, '0')).join(''); }

function wire() {
  $('b-wallet')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    msg('s1-msg', '');
    try {
      const w = await pickWallet();
      if (!w) return;
      msg('s1-msg', `Check ${esc(w.info.name)}: connect, then sign the message.`);
      const [acc] = await w.provider.request({ method: 'eth_requestAccounts' });
      if (!acc) throw new Error('no_wallet');
      const address = acc.toLowerCase();
      const signature = await w.provider.request({ method: 'personal_sign', params: [hex(walletMessage(address, me.nonce)), acc] });
      const r = await edge('wallet', { address, signature });
      if (!r.ok) return msg('s1-msg', esc(errText(r.error)), 'bad');
      toast(r.moved ? 'Welcome back! Your raid was loaded from this wallet.' : 'Wallet connected. +50');
      await load();
    } catch (er) { msg('s1-msg', er?.code === 4001 ? 'You cancelled the signature.' : esc(errText(er?.message === 'no_wallet' ? 'no_wallet' : 'server_error')), 'bad'); }
  }));
  $('b-xverify')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    msg('s2-msg', 'Checking your tweet…');
    const r = await edge('x', { url: $('i-x').value.trim() });
    if (!r.ok) return msg('s2-msg', esc(errText(r.error)), 'bad');
    msg('s2-msg', ''); toast(`@${r.x} linked. +100`); await load();
  }));
  document.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', () => run(b, async () => {
    openX(b.dataset.url);
    // X'te işlemi yapması için kısa bir süre tanı, sonra işaretle
    await new Promise((res) => setTimeout(res, 2500));
    const r = await rpc('raid_task', { p_task: b.dataset.task });
    if (!r.ok) return msg('s3-msg', esc(errText(r.error)), 'bad');
    me = { ...r.data, _skew: me._skew }; render(); loadBoard(); toast('+25');
  })));
  $('b-replyv')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    msg('s3-msg', 'Checking your reply…');
    const r = await edge('reply', { url: $('i-reply').value.trim() });
    if (!r.ok) return msg('s3-msg', esc(errText(r.error)), 'bad');
    msg('s3-msg', ''); toast('Reply verified. +50'); await load();
  }));
  $('b-card')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    const r = await rpc('raid_claim_card');
    if (!r.ok) return msg('s4-msg', esc(errText(r.error)), 'bad');
    me = { ...r.data, _skew: me._skew }; render(); loadBoard(); toast(`Card #${me.card.no} claimed: ${me.card.rarity}! +50`);
  }));
  $('b-postv')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    msg('s5-msg', 'Checking your post…');
    const r = await edge('post', { url: $('i-post').value.trim() });
    if (!r.ok) return msg('s5-msg', esc(errText(r.error)), 'bad');
    msg('s5-msg', ''); toast('Post verified. +100'); await load();
  }));
  $('b-ref')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('i-ref').value); toast('Invite link copied'); } catch (e) { $('i-ref').select(); }
  });
}

// geri sayım
setInterval(() => {
  if (!me) return;
  const left = Number(me.config.endsAt) - (Date.now() + (me._skew || 0));
  if (left <= 0) { $('ends').textContent = 'The raid has ended'; return; }
  const d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24, m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
  $('ends').textContent = `Raid ends in ${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}, 1000);
setInterval(() => { if (!document.hidden) loadBoard(); }, 30000);
setTimeout(() => { if (me && !me.wallet) render(); }, 600);   // geç duyuran cüzdanlar için
load();
