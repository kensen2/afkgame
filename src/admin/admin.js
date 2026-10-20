// =====================================================================
//  Admin paneli (admin.html). Oyundan ayrı sayfa, oyunda link yok.
//  Giriş: Supabase e-posta/şifre hesabı. Yetki SUNUCUDA kontrol edilir (admins tablosu, is_admin()):
//  bu sayfayı herkes açabilir ama admin olmayan biri hiçbir işlem yapamaz.
//  Sadece herkese açık "publishable" anahtar kullanılır; gizli anahtar asla burada olmaz.
//  Tüm metinler textContent ile yazılır (oyuncu nick'i / notu HTML olarak çalışmasın).
// =====================================================================
import { CONFIG } from '../config.js';

const S = CONFIG.server, URL_ = S.url.replace(/\/$/, ''), KEY = S.key, SESSION = 'afk_admin_session_v1';
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const when = (ms) => (ms ? new Date(Number(ms)).toLocaleString() : '—');

const KINDS = [['gold', 'Gold'], ['dgn', 'DGN (in-game)'], ['tomes', 'Skill Tomes'],
  ...CONFIG.v5.keys.map((k) => ['key_' + k.id, k.name])];
const kindName = (k) => (k === 'wipe' ? 'Save wipe' : (KINDS.find((x) => x[0] === k) || [k, k])[1]);
const ERR = { not_admin: 'This account is not an admin.', not_found: 'Player not found.', cannot_ban_admin: 'Admins cannot be banned.',
  already_claimed: 'The player already received it; it cannot be taken back.', not_allowed: 'Not allowed.', nick_taken: 'That nickname is taken.' };

let session = null, current = null;

// ---------- sunucu ----------
async function call(path, body, auth = true) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (auth && session) headers.Authorization = `Bearer ${session.access_token}`;
  const r = await fetch(URL_ + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
  return { ok: r.ok, status: r.status, data: d };
}
function keep(d) {
  session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
  try { sessionStorage.setItem(SESSION, JSON.stringify(session)); } catch (e) { /* yok */ }
}
async function fresh() {
  if (session && Date.now() < session.expires_at - 60000) return true;
  if (!session?.refresh_token) return false;
  const r = await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }, false);
  if (r.ok && r.data?.access_token) { keep(r.data); return true; }
  return false;
}
async function rpc(fn, args) {
  if (!(await fresh())) { logout(); throw new Error('Session expired, sign in again.'); }
  const r = await call(`/rest/v1/rpc/${fn}`, args);
  if (r.ok) return r.data;
  const m = r.data?.message || r.data?.msg || `Error ${r.status}`;
  if (m === 'not_admin') logout(ERR.not_admin);
  throw new Error(ERR[m] || m);
}

// ---------- giriş ----------
$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('l-msg').textContent = '';
  const r = await call('/auth/v1/token?grant_type=password', { email: $('l-email').value.trim(), password: $('l-pass').value }, false);
  $('l-pass').value = '';
  if (!r.ok || !r.data?.access_token) { $('l-msg').textContent = r.data?.error_description || r.data?.msg || 'Sign-in failed.'; return; }
  keep(r.data);
  start();
});
function logout(msg) {
  session = null; try { sessionStorage.removeItem(SESSION); } catch (e) { /* yok */ }
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  $('l-msg').textContent = msg || '';
}
$('btn-logout').onclick = () => logout();

async function start() {
  try {
    const me = await rpc('admin_whoami');
    $('who').textContent = me.email || me.id;
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    await Promise.all([overview(), search(''), log()]);
  } catch (e) { logout(e.message); }
}

// ---------- genel ----------
async function overview() {
  const o = await rpc('admin_overview');
  const box = $('stats'); box.replaceChildren();
  for (const [k, v] of [['Players', o.players], ['Active 24h', o.active24h], ['Banned', o.banned], ['Clans', o.clans], ['Rewards waiting', o.pendingGrants]])
    box.append(el('div', { className: 'card' }, el('span', { className: 'muted', textContent: k }), el('b', { textContent: fmt(v) })));
  $('notice').value = o.notice || '';
}
$('btn-refresh').onclick = () => Promise.all([overview(), search($('q').value), log(), current && openPlayer(current.id)]).catch(alert);

for (const sel of ['g-kind', 'all-kind']) for (const [v, t] of KINDS) $(sel).append(el('option', { value: v, textContent: t }));

function busy(btn, fn, msgEl) {
  return async () => {
    btn.disabled = true; if (msgEl) { msgEl.textContent = ''; msgEl.className = 'msg'; }
    try { const m = await fn(); if (msgEl && m) { msgEl.textContent = m; msgEl.className = 'msg ok'; } }
    catch (e) { if (msgEl) { msgEl.textContent = e.message; msgEl.className = 'msg bad'; } else alert(e.message); }
    finally { btn.disabled = false; }
  };
}
const amountOf = (id) => { const n = Math.floor(Number($(id).value)); if (!(n > 0)) throw new Error('Enter an amount above 0.'); return n; };

$('btn-notice').onclick = busy($('btn-notice'), async () => {
  await rpc('admin_set_notice', { p_text: $('notice').value.trim() }); await log();
  return $('notice').value.trim() ? 'Saved. Players see it within a minute.' : 'Notice removed.';
}, $('notice-msg'));

$('btn-all').onclick = busy($('btn-all'), async () => {
  const kind = $('all-kind').value, n = amountOf('all-amount'), note = $('all-note').value.trim();
  if (!confirm(`Send ${fmt(n)} × ${kindName(kind)} to EVERY player?`)) return '';
  const c = await rpc('admin_grant_all', { p_kind: kind, p_amount: n, p_note: note });
  await Promise.all([overview(), log()]);
  return `Sent to ${fmt(c)} players.`;
}, $('all-msg'));

// ---------- oyuncular ----------
$('search').addEventListener('submit', (e) => { e.preventDefault(); search($('q').value).catch((er) => alert(er.message)); });
async function search(q) {
  const rows = await rpc('admin_find_players', { q: q.trim(), lim: 100 });
  const tb = $('players'); tb.replaceChildren();
  if (!rows.length) tb.append(el('tr', {}, el('td', { colSpan: 6, className: 'muted', textContent: 'No players found.' })));
  for (const p of rows) {
    const st = el('td');
    if (p.banned) st.append(el('span', { className: 'tag ban', textContent: 'banned' }), ' ');
    if (p.pending) st.append(el('span', { className: 'tag gift', textContent: `${p.pending} gift` }));
    const tr = el('tr', { className: 'pick' + (current?.id === p.id ? ' sel' : '') },
      el('td', { textContent: p.nick }), el('td', { textContent: p.wave }), el('td', { textContent: fmt(p.rate) }),
      el('td', { textContent: p.tag ? `[${p.tag}] ${p.clan}` : '—' }), st, el('td', { textContent: when(p.updated) }));
    tr.onclick = () => openPlayer(p.id).catch((er) => alert(er.message));
    tb.append(tr);
  }
}

async function openPlayer(id) {
  const [p] = await rpc('admin_find_players', { q: id, lim: 1 });
  if (!p) throw new Error(ERR.not_found);
  current = p;
  $('player').classList.remove('hidden');
  $('p-title').textContent = `${p.nick} · wave ${p.wave} · ${fmt(p.rate)} DGN/h${p.tag ? ` · [${p.tag}] ${p.clan} (${p.role})` : ''}`;
  $('p-id').textContent = `id: ${p.id} · joined ${when(p.created)} · last seen ${when(p.updated)}`;
  $('p-ban-line').textContent = p.banned ? `Banned ${p.ban_until === 'forever' ? 'permanently' : `until ${p.ban_until} UTC`}${p.ban_reason ? ` · ${p.ban_reason}` : ''}` : '';
  $('n-nick').value = '';
  $('nf-mult').value = String(Number(p.nerf ?? 1));
  $('nf-now').textContent = Number(p.nerf ?? 1) < 1 ? `Now ${Math.round(p.nerf * 100)}%${p.nerf_reason ? ` · ${p.nerf_reason}` : ''}` : 'Now normal';
  await detail(id);
  const gs = await rpc('admin_player_grants', { p: id });
  const tb = $('p-grants'); tb.replaceChildren();
  if (!gs.length) tb.append(el('tr', {}, el('td', { colSpan: 6, className: 'muted', textContent: 'Nothing sent yet.' })));
  for (const g of gs) {
    const status = g.revoked ? 'cancelled' : g.claimed ? `received ${when(g.claimed)}` : 'waiting';
    const act = el('td');
    if (!g.revoked && !g.claimed) {
      const b = el('button', { className: 'plain', textContent: 'Cancel' });
      b.onclick = busy(b, async () => { await rpc('admin_revoke_grant', { gid: g.id }); await openPlayer(id); await log(); });
      act.append(b);
    }
    tb.append(el('tr', {}, el('td', { textContent: g.id }), el('td', { textContent: g.kind === 'wipe' ? 'Save wipe' : `${g.amount < 0 ? 'Take ' : ''}${fmt(Math.abs(g.amount))} × ${kindName(g.kind)}` }),
      el('td', { textContent: g.note || '' }), el('td', { textContent: when(g.created) }), el('td', { textContent: status }), act));
  }
  document.querySelectorAll('#players tr').forEach((tr) => tr.classList.remove('sel'));
  $('player').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Oyuncunun bildirdiği durum ve işlem geçmişi
const EV = { claim: 'Claimed production', deposit: 'Deposited', vault: 'Moved to vault', withdraw: 'Sent to wallet', tokenSpend: 'Spent DGN',
  keyUsed: 'Opened wave with a key', forge: 'Forge upgrade', gemItem: 'Bought store item', keys: 'Keys changed', season: 'New season',
  tomes: 'Got Skill Tomes', xp: 'Level up', teamGift: 'Team gift / take', upgrade: 'Gear upgrade (gold)', skill: 'Skill upgrade',
  revive: 'Revived with DGN', bestWave: 'New best wave', referral: 'Invite reward' };
async function detail(id) {
  const d = await rpc('admin_player_detail', { p: id, lim: 300 });
  const s = d.snapshot, box = $('p-snap'); box.replaceChildren();
  econ(s?.econ);
  refs(id);
  $('p-snap-at').textContent = d.snapshotAt ? `· ${when(d.snapshotAt)}` : '· no report yet';
  if (s) {
    const keys = Object.entries(s.keys || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
    const heroes = Object.entries(s.heroes || {}).map(([h, v]) => `${h}: gear ${v.up}, skills ${v.sk}`).join(' · ');
    for (const [k, v] of [['Gold', fmt(s.gold)], ['DGN in game', fmt(s.dgn)], ['Unclaimed', fmt(s.uncollected)], ['In vault', fmt(s.vault)],
      ['Deposited (all)', fmt(s.deposited)], ['Deposited (season)', fmt(s.seasonDeposited)], ['Withdrawn', fmt(s.withdrawn)], ['Spent in dungeon', fmt(s.spent)],
      ['Fees', fmt(s.fees)], ['DGN / hour', fmt(s.rate)], ['Level', s.level], ['Best wave', `${s.seasonBest} (ever ${s.bestWave})`], ['Opened up to', s.opened],
      ['Forge', s.forge], ['Tomes', s.tomes], ['Season', s.season], ['Keys', keys]])
      box.append(el('div', { className: 'card' }, el('span', { className: 'muted', textContent: k }), el('b', { textContent: String(v ?? '—'), style: 'font-size:17px' })));
    box.append(el('div', { className: 'card', style: 'grid-column:1/-1' }, el('span', { className: 'muted', textContent: `Heroes (selected: ${s.hero})` }), el('div', { textContent: heroes })));
  }
  const tb = $('p-events'); tb.replaceChildren();
  if (!d.events.length) tb.append(el('tr', {}, el('td', { colSpan: 3, className: 'muted', textContent: 'No activity reported yet.' })));
  for (const e of d.events) {
    const x = e.data || {};
    const det = e.kind === 'teamGift' ? `${x.amount < 0 ? 'took' : 'gave'} ${fmt(Math.abs(x.amount))} × ${kindName(x.kind)}`
      : e.kind === 'keys' ? `${x.id}: now ${x.have}` : e.kind === 'keyUsed' ? `wave ${x.wave}` : e.kind === 'xp' ? `level ${x.level}`
      : e.kind === 'forge' ? `level ${x.level}` : e.kind === 'gemItem' ? x.id
      : e.kind === 'upgrade' ? `${x.hero} · ${x.slot} → Lv ${x.level}${x.times > 1 ? ` (${x.times} times)` : ''}`
      : e.kind === 'skill' ? `${x.hero} · skill ${Number(x.skill) + 1} → Lv ${x.level}${x.times > 1 ? ` (${x.times} times)` : ''}`
      : e.kind === 'revive' || e.kind === 'bestWave' ? `wave ${x.wave}`
      : e.kind === 'vault' && x.usd != null ? `${fmt(x.amount)} DGN (${usd(x.usd)}) · fee ${Math.round((x.rate || 0) * 100)}% = ${fmt(x.fee)}`
      : e.kind === 'referral' && x.usd != null ? `+${usd(x.usd)} invite reward`
      : e.kind === 'deposit' && x.usd != null ? `${fmt(x.amount)} DGN (${usd(x.usd)})`
      : x.amount != null ? fmt(x.amount) : '';
    tb.append(el('tr', {}, el('td', { textContent: when(e.at) }), el('td', { textContent: EV[e.kind] || e.kind }), el('td', { textContent: det })));
  }
}
// v8 kazanç özeti: yatırdığı, çektiği, şu an çekebileceği ve sezon sonuna kadar en fazla ne alabileceği
const usd = (x) => (x == null ? '—' : '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function econ(e) {
  const box = $('p-econ'); box.replaceChildren();
  if (!e) { box.append(el('div', { className: 'muted', textContent: 'No report from this player with the new economy yet (they need to open the updated game).' })); return; }
  const card = (k, v, sub) => el('div', { className: 'card' }, el('span', { className: 'muted', textContent: k }), el('b', { textContent: v, style: 'font-size:17px' }),
    sub ? el('div', { className: 'muted', textContent: sub }) : '');
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  if (!e.depositor) {
    const g = el('div', { className: 'stats' });
    g.append(card('Type', 'Free player', 'has not deposited this season'), card('Can take out now', `${fmt(e.freePoolDgn)} DGN`, 'daily free pool share'),
      card('Deposit carried over', usd(e.creditUsd)), card('Fees back to the pool', `${fmt(e.feesToPool)} DGN`));
    box.append(g); return;
  }
  const x = e.returnX || 0, barW = Math.min(100, x / e.lifeCap * 100);
  const status = e.atCap ? `Reached the ${e.lifeCap}× limit. Now only ${usd(e.perDayUsd)} a day opens up.`
    : !e.paidBack ? `Production is still counting toward the deposit: ${usd(e.roiLeftUsd)} to go (${usd(e.usdPerHour)}/h).`
    : `Day ${e.shareDay} after payback: ${pct(e.shareToday)} of production opens up, about ${usd(e.perDayUsd)} a day.`;
  const next = e.atCap ? 'Season limit reached.'
    : `At this pace the most they can take out by season end is about ${usd(e.projMaxUsd)} (${e.projMaxX}×)` +
      (e.projCapInDays != null ? `, reaching the ${e.lifeCap}× limit in about ${e.projCapInDays} day${e.projCapInDays === 1 ? '' : 's'}.` : `; they would not reach the ${e.lifeCap}× limit.`);
  box.append(el('div', { className: 'card', style: 'margin-bottom:8px' },
    el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap' },
      el('b', { textContent: `Put in ${usd(e.depositedUsd)} · took out ${usd(e.withdrawnUsd)}`, style: 'font-size:17px' }),
      el('b', { textContent: `${x.toFixed(2)}× / ${e.lifeCap}×`, style: `font-size:17px;color:${e.atCap ? '#e0703a' : x >= 1 ? '#4caf50' : 'inherit'}` })),
    el('div', { style: 'height:8px;background:rgba(127,127,127,.25);border-radius:4px;overflow:hidden;margin:8px 0' },
      el('div', { style: `height:100%;width:${barW}%;background:${e.atCap ? '#e0703a' : '#c9973a'}` })),
    el('div', { textContent: status }), el('div', { className: 'muted', textContent: next, style: 'margin-top:4px' })));
  const g = el('div', { className: 'stats' });
  g.append(card('Can take out now', usd(e.availableUsd), `≈ ${fmt(e.availableDgn)} DGN at ${'$' + e.price}`),
    card('From their own deposit', usd(e.creditUsd), 'no daily limit'),
    card('Opened from production', usd(e.poolUsd)),
    card(`Room to ${e.lifeCap}×`, usd(e.capRoomUsd), `limit ${usd(e.capUsd)}`),
    card('Production', `${usd(e.usdPerHour)} / h`),
    card('Next withdraw fee', pct(e.nextFee), `${fmt(e.feesToPool)} DGN returned to the pool`),
    card('Season ends in', `${e.daysLeft} days`));
  box.append(g);
}
// Davet: kim davet etti, kimleri davet etti, ne kazandı; aynı ağdan gelenler işaretli (olası sahte hesap)
async function refs(id) {
  const box = $('p-refs'); box.replaceChildren();
  let r;
  try { r = await rpc('admin_player_refs', { p: id }); } catch (e) { box.append(el('div', { className: 'muted', textContent: 'Invite data is not available (supabase/04_referral.sql not applied yet?).' })); return; }
  const g = el('div', { className: 'stats' });
  g.append(el('div', { className: 'card' }, el('span', { className: 'muted', textContent: 'Invite code' }), el('b', { textContent: r.code || '—', style: 'font-size:17px' })),
    el('div', { className: 'card' }, el('span', { className: 'muted', textContent: 'Invited by' }), el('b', { textContent: r.invitedBy?.nick || 'nobody', style: 'font-size:17px' })),
    el('div', { className: 'card' }, el('span', { className: 'muted', textContent: 'Friends invited' }), el('b', { textContent: String((r.invitees || []).length), style: 'font-size:17px' })),
    el('div', { className: 'card' }, el('span', { className: 'muted', textContent: 'Earned from invites' }), el('b', { textContent: usd(r.earnedUsd), style: 'font-size:17px' })));
  box.append(g);
  if ((r.invitees || []).length) {
    const tb = el('tbody');
    for (const x of r.invitees) tb.append(el('tr', {}, el('td', { textContent: x.nick }), el('td', { textContent: String(x.wave) }), el('td', { textContent: when(x.at) }),
      el('td', { textContent: usd(x.earnedUsd) }), el('td', { textContent: x.sameNetwork ? '⚠ same network' : '', style: x.sameNetwork ? 'color:#e0703a' : '' })));
    box.append(el('div', { className: 'tablewrap', style: 'margin-top:8px' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Friend', 'Wave', 'Joined', 'Earned for inviter', ''].map((t) => el('th', { textContent: t })))), tb)));
  }
}
$('p-close').onclick = () => { current = null; $('player').classList.add('hidden'); };

const after = async () => { await Promise.all([openPlayer(current.id), search($('q').value), overview(), log()]); };
$('btn-grant').onclick = busy($('btn-grant'), async () => {
  const kind = $('g-kind').value, n = amountOf('g-amount');
  await rpc('admin_grant', { p: current.id, p_kind: kind, p_amount: n, p_note: $('g-note').value.trim() });
  $('g-amount').value = ''; $('g-note').value = ''; await after();
  return `${fmt(n)} × ${kindName(kind)} sent. ${current.nick} gets it the next time the game is open.`;
}, $('p-msg'));
$('btn-take').onclick = busy($('btn-take'), async () => {
  const kind = $('g-kind').value, n = amountOf('g-amount');
  if (!confirm(`Take ${fmt(n)} × ${kindName(kind)} away from ${current.nick}?`)) return '';
  await rpc('admin_grant', { p: current.id, p_kind: kind, p_amount: -n, p_note: $('g-note').value.trim() || 'Removed by the team' });
  $('g-amount').value = ''; $('g-note').value = ''; await after();
  return `${fmt(n)} × ${kindName(kind)} will be removed the next time the game is open.`;
}, $('p-msg'));
$('btn-nerf').onclick = busy($('btn-nerf'), async () => {
  const m = Number($('nf-mult').value);
  await rpc('admin_set_nerf', { p: current.id, mult: m, reason: $('nf-reason').value.trim() });
  $('nf-reason').value = ''; await after();
  return m < 1 ? `Production set to ${Math.round(m * 100)}%.` : 'Production back to normal.';
}, $('p-msg'));
$('btn-ban').onclick = busy($('btn-ban'), async () => {
  const h = Number($('b-hours').value);
  if (!confirm(`Ban ${current.nick} ${h ? `for ${h} hours` : 'permanently'}?`)) return '';
  await rpc('admin_ban', { p: current.id, hours: h, reason: $('b-reason').value.trim() });
  $('b-reason').value = ''; await after();
  return `${current.nick} is banned.`;
}, $('p-msg'));
$('btn-unban').onclick = busy($('btn-unban'), async () => { await rpc('admin_unban', { p: current.id }); await after(); return 'Ban lifted.'; }, $('p-msg'));
$('btn-nick').onclick = busy($('btn-nick'), async () => {
  const n = $('n-nick').value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) throw new Error('3–16 letters, numbers or _.');
  await rpc('admin_set_nick', { p: current.id, p_nick: n }); await after(); return `Renamed to ${n}.`;
}, $('p-msg'));
$('btn-reset').onclick = busy($('btn-reset'), async () => {
  if (!confirm(`Reset ${current.nick}'s ranking (wave and DGN/h) to 0?`)) return '';
  await rpc('admin_reset_stats', { p: current.id }); await after(); return 'Ranking stats reset.';
}, $('p-msg'));
$('btn-wipe').onclick = busy($('btn-wipe'), async () => {
  const typed = prompt(`This erases ALL of ${current.nick}'s progress next time they play.\nType the nickname to confirm:`);
  if (typed !== current.nick) return typed === null ? '' : 'Nickname did not match; nothing was done.';
  await rpc('admin_grant', { p: current.id, p_kind: 'wipe', p_amount: 0, p_note: 'Save reset by the team' });
  await rpc('admin_reset_stats', { p: current.id });
  await after(); return 'Wipe queued. It runs the next time the player opens the game.';
}, $('p-msg'));

// ---------- kayıt ----------
const ACT = { ban: 'Ban', unban: 'Unban', grant: 'Reward', grant_all: 'Reward everyone', revoke_grant: 'Cancel reward', set_nick: 'Rename',
  reset_stats: 'Reset stats', notice: 'Notice', nerf: 'Nerf' };
async function log() {
  const rows = await rpc('admin_log_list', { lim: 100 });
  const tb = $('log'); tb.replaceChildren();
  if (!rows.length) tb.append(el('tr', {}, el('td', { colSpan: 5, className: 'muted', textContent: 'No admin actions yet.' })));
  for (const r of rows) {
    const d = r.detail || {};
    const det = r.action === 'grant' || r.action === 'grant_all'
      ? `${d.kind === 'wipe' ? 'Save wipe' : `${d.amount < 0 ? 'take ' : ''}${fmt(Math.abs(d.amount))} × ${kindName(d.kind)}`}${d.count != null ? ` → ${fmt(d.count)} players` : ''}${d.note ? ` · ${d.note}` : ''}`
      : r.action === 'ban' ? `${d.hours ? `${d.hours} h` : 'permanent'}${d.reason ? ` · ${d.reason}` : ''}`
      : r.action === 'nerf' ? `${Math.round((d.mult ?? 1) * 100)}%${d.reason ? ` · ${d.reason}` : ''}`
      : r.action === 'set_nick' ? `→ ${d.nick}` : r.action === 'notice' ? (d.text || '(removed)') : r.action === 'revoke_grant' ? `#${d.id}` : '';
    tb.append(el('tr', {}, el('td', { textContent: when(r.at) }), el('td', { textContent: r.admin || '' }),
      el('td', { textContent: ACT[r.action] || r.action }), el('td', { textContent: r.nick || '' }), el('td', { textContent: det })));
  }
}

// ---------- açılış ----------
try { const raw = sessionStorage.getItem(SESSION); if (raw) session = JSON.parse(raw); } catch (e) { /* yok */ }
if (session) start(); else logout();
