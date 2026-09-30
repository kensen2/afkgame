// =====================================================================
//  YEREL BACKEND (Faz 1, sunucusuz)
//  Supabase bağlanana kadar nick, clan ve sıralama bu dosyada simüle edilir.
//  - Bot oyuncular ve bot clanlar sabit bir tohumdan her açılışta aynı şekilde üretilir.
//  - Sadece değişen kısım (senin nickin, üyeliğin, kurduğun clan, istekler) localStorage'a yazılır.
//  - Bot clanlara attığın istek birkaç saniye içinde "bir officer" tarafından onaylanır.
//  - Kendi clanına bot oyuncular zaman zaman katılma isteği gönderir (lider/officer ekranını denemek için).
//  Yarın: aynı metotlara sahip SupabaseBackend yazılacak; oyunun geri kalanı değişmeyecek.
//  Bütün metotlar Promise döner (sunucu çağrısı gibi).
// =====================================================================
import { CONFIG, F } from '../config.js';
import { can, validateNick, validateClan } from '../systems/clan-rules.js';

const KEY = 'afk_social_v1';
const C = CONFIG.social.clan;

// ---- tohumlu rastgele ----
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRE = ['Shadow', 'Iron', 'Grim', 'Dark', 'Frost', 'Blood', 'Storm', 'Night', 'Rune', 'Ash', 'Bone', 'Ember', 'Void', 'Silver', 'Wolf', 'Raven', 'Doom', 'Stone', 'Thorn', 'Hex', 'Crypt', 'Gloom', 'Rust', 'Moon'];
const SUF = ['Blade', 'Fang', 'Reaper', 'Knight', 'Hunter', 'Lord', 'Warden', 'Slayer', 'Walker', 'Born', 'Heart', 'Claw', 'Mage', 'Rider', 'Smith', 'Seeker', 'Bane', 'Guard', 'Wing', 'Skull'];
const BOT_CLANS = [
  ['Iron Wolves', 'IRW', 248], ['Crimson Oath', 'CRO', 236], ['Ashen Crown', 'ASH', 214], ['Night Wardens', 'NW', 197],
  ['Frostbound', 'FRB', 181], ['Bone Legion', 'BONE', 158], ['Ember Guard', 'EMB', 131], ['Raven Court', 'RVN', 104],
  ['Stone Fang', 'STF', 86], ['Void Walkers', 'VOID', 67], ['Golden Hand', 'GLD', 49], ['Thorn Keepers', 'THK', 33],
  ['Deepdelvers', 'DEEP', 19], ['Last Light', 'LL', 8],
];
const LONERS = 620;

function genWorld() {
  const r = rng(20260930);
  const used = new Set();
  const nick = () => {
    for (;;) {
      const p = PRE[Math.floor(r() * PRE.length)], s = SUF[Math.floor(r() * SUF.length)];
      const k = r();
      const n = k < 0.35 ? p + s : k < 0.6 ? `${p}_${s}` : k < 0.85 ? `${p}${s}${Math.floor(r() * 99) + 1}` : `${p.toLowerCase()}${s.toLowerCase()}`;
      if (n.length <= 16 && !used.has(n.toLowerCase())) { used.add(n.toLowerCase()); return n; }
    }
  };
  // yatıran olasılığı: güçlü clanlarda daha yüksek
  const wave = (depP) => {
    if (r() < depP) { const x = r(); return x < 0.5 ? 21 + Math.floor(r() * 10) : x < 0.78 ? 31 + Math.floor(r() * 10) : x < 0.93 ? 41 + Math.floor(r() * 10) : 51 + Math.floor(r() * 10); }
    return Math.max(3, 20 - Math.floor(Math.pow(r(), 1.8) * 17));
  };
  const players = new Map(), clans = new Map();
  const t0 = CONFIG.v5.seasonEpoch - 20 * 86400000;
  BOT_CLANS.forEach(([name, tag, size], i) => {
    const id = 'c' + (i + 1);
    const members = [];
    for (let j = 0; j < size; j++) {
      const w = wave(0.45 - i * 0.027);
      const p = { id: `b${players.size + 1}`, nick: nick(), wave: w, rate: F.rateAt(w), clanId: id, role: 'member', joinedAt: t0 + j * 3600000 };
      players.set(p.id, p); members.push(p.id);
    }
    // en güçlü üye lider, sonraki iki güçlü üye officer
    const sorted = [...members].sort((a, b) => players.get(b).rate - players.get(a).rate);
    players.get(sorted[0]).role = 'leader';
    if (sorted[1]) players.get(sorted[1]).role = 'officer';
    if (sorted[2]) players.get(sorted[2]).role = 'officer';
    clans.set(id, { id, name, tag, bot: true, createdAt: t0 + i * 86400000, members });
  });
  for (let j = 0; j < LONERS; j++) {
    const w = wave(0.12);
    const p = { id: `b${players.size + 1}`, nick: nick(), wave: w, rate: F.rateAt(w), clanId: null, role: null, joinedAt: 0 };
    players.set(p.id, p);
  }
  return { players, clans };
}

function freshState() {
  return {
    v: 1,
    me: { id: 'me', nick: null, createdAt: 0 },
    stats: { rate: 0, wave: 0 },
    membership: null,        // { clanId, role, joinedAt } (bot clan ya da kendi clanın)
    outgoing: [],            // [{ clanId, at, approveAt }]
    own: null,               // kurduğun clan: { id, name, tag, createdAt, members:[{id, role, joinedAt}], requests:[{id, at}], nextReqAt }
  };
}

export class LocalBackend {
  constructor() {
    this.world = genWorld();
    this.s = freshState();
    try { const raw = localStorage.getItem(KEY); if (raw) this.s = { ...freshState(), ...JSON.parse(raw) }; } catch (e) { /* depolama yok */ }
    this._apply();
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) { /* depolama yok */ } }
  _ok(v = {}) { return Promise.resolve({ ok: true, ...v }); }
  _err(error) { return Promise.resolve({ ok: false, error }); }

  // Kayıttaki kendi clanını dünyaya uygula (botların clan bilgisini düzelt)
  _apply() {
    const W = this.world;
    for (const c of [...W.clans.values()]) if (!c.bot) W.clans.delete(c.id);
    for (const p of W.players.values()) if (p._own) { p.clanId = null; p.role = null; p._own = false; }
    const o = this.s.own;
    if (o) {
      const members = [];
      for (const m of o.members) {
        if (m.id === 'me') { members.push('me'); continue; }
        const p = W.players.get(m.id);
        if (!p) continue;
        p.clanId = o.id; p.role = m.role; p.joinedAt = m.joinedAt; p._own = true;
        members.push(p.id);
      }
      W.clans.set(o.id, { id: o.id, name: o.name, tag: o.tag, bot: false, createdAt: o.createdAt, members });
    }
  }

  // ---------- yardımcılar ----------
  _meRow() {
    const m = this.s.membership;
    return { id: 'me', nick: this.s.me.nick || '—', wave: this.s.stats.wave, rate: this.s.stats.rate, clanId: m?.clanId || null, role: m?.role || null, joinedAt: m?.joinedAt || 0, isMe: true };
  }
  _player(id) { return id === 'me' ? this._meRow() : this.world.players.get(id); }
  _members(c) {
    const ids = [...c.members];
    if (this.s.membership?.clanId === c.id && !ids.includes('me')) ids.push('me');
    return ids.map((id) => this._player(id)).filter(Boolean);
  }
  _myRole(c) {
    const m = this.s.membership;
    if (!m || m.clanId !== c.id) return null;
    if (!c.bot) return this.s.own.members.find((x) => x.id === 'me')?.role || null;
    return m.role;
  }
  _ranked() {
    const rows = [...this.world.clans.values()].map((c) => {
      const mem = this._members(c);
      return { c, count: mem.length, total: mem.reduce((s, p) => s + p.rate, 0) };
    });
    rows.sort((a, b) => b.total - a.total || a.c.createdAt - b.c.createdAt);
    rows.forEach((x, i) => { x.rank = i + 1; x.bonus = F.clanBonus(i + 1); });
    return rows;
  }
  _summary(x) {
    const leader = this._members(x.c).find((p) => p.role === 'leader');
    return {
      id: x.c.id, name: x.c.name, tag: x.c.tag, rank: x.rank, bonus: x.bonus, memberCount: x.count, maxMembers: C.maxMembers,
      totalRate: x.total, leader: leader?.nick || '—', full: x.count >= C.maxMembers,
      requested: this.s.outgoing.some((o) => o.clanId === x.c.id), mine: this.s.membership?.clanId === x.c.id,
    };
  }
  _unaffiliated() { return [...this.world.players.values()].filter((p) => !p.clanId); }

  // ---------- oyuncu ----------
  setMyStats({ rate, wave }) {
    this.s.stats = { rate: Math.round(rate || 0), wave: wave || 0 };
    this._save();
    return this._ok();
  }
  getMe() {
    const m = this.s.membership;
    return this._ok({ me: { id: 'me', nick: this.s.me.nick, clanId: m?.clanId || null, role: m ? this._myRole(this.world.clans.get(m.clanId)) : null } });
  }
  isNickTaken(nick) {
    const n = String(nick).toLowerCase();
    for (const p of this.world.players.values()) if (p.nick.toLowerCase() === n) return Promise.resolve(true);
    return Promise.resolve(false);
  }
  async setNick(nick) {
    const v = validateNick(nick);
    if (!v.ok) return v;
    if (await this.isNickTaken(v.nick)) return { ok: false, error: 'nick_taken' };
    this.s.me.nick = v.nick;
    if (!this.s.me.createdAt) this.s.me.createdAt = Date.now();
    this._save();
    return { ok: true, nick: v.nick };
  }

  // ---------- sıralama ----------
  leaderboardPlayers({ limit = 100 } = {}) {
    const clans = this.world.clans;
    const all = [...this.world.players.values(), this._meRow()];
    all.sort((a, b) => b.rate - a.rate || b.wave - a.wave || (a.isMe ? -1 : 1));
    const row = (p, i) => ({ rank: i + 1, nick: p.nick, wave: p.wave, rate: p.rate, tag: p.clanId ? clans.get(p.clanId)?.tag : null, isMe: !!p.isMe });
    const meIdx = all.findIndex((p) => p.isMe);
    return this._ok({ rows: all.slice(0, limit).map(row), me: row(all[meIdx], meIdx), total: all.length });
  }
  leaderboardClans({ limit = 50 } = {}) {
    const r = this._ranked();
    const mine = r.find((x) => x.c.id === this.s.membership?.clanId);
    return this._ok({ rows: r.slice(0, limit).map((x) => this._summary(x)), mine: mine ? this._summary(mine) : null, total: r.length });
  }

  // ---------- clan ----------
  listClans({ query = '' } = {}) {
    const q = query.trim().toLowerCase();
    const rows = this._ranked().filter((x) => !q || x.c.name.toLowerCase().includes(q) || x.c.tag.toLowerCase().includes(q));
    return this._ok({ rows: rows.map((x) => this._summary(x)) });
  }
  getClan(id) {
    const x = this._ranked().find((y) => y.c.id === id);
    if (!x) return this._err('not_found');
    const role = this._myRole(x.c);
    const order = { leader: 0, officer: 1, member: 2 };
    const members = this._members(x.c).map((p) => ({ id: p.id, nick: p.nick, wave: p.wave, rate: p.rate, role: p.role, joinedAt: p.joinedAt, isMe: !!p.isMe }))
      .sort((a, b) => order[a.role] - order[b.role] || b.rate - a.rate);
    const clan = { ...this._summary(x), members, myRole: role, bot: x.c.bot, createdAt: x.c.createdAt };
    // katılma istekleri sadece lider ve officer'a görünür (bot clanlarda istek listesi yok)
    if (!x.c.bot && (can(role, 'approve'))) {
      clan.requests = this.s.own.requests.map((q) => { const p = this.world.players.get(q.id); return p && { id: p.id, nick: p.nick, wave: p.wave, rate: p.rate, at: q.at }; }).filter(Boolean);
    }
    return this._ok({ clan });
  }
  getMyClan() {
    const m = this.s.membership;
    return m ? this.getClan(m.clanId) : this._ok({ clan: null });
  }
  // Kurma kontrolü (ödeme alınmadan önce)
  checkCreate({ name, tag }) {
    if (!this.s.me.nick) return this._err('need_nick');
    if (this.s.membership) return this._err('already_in_clan');
    const v = validateClan(name, tag);
    if (!v.ok) return Promise.resolve(v);
    for (const c of this.world.clans.values()) {
      if (c.name.toLowerCase() === v.name.toLowerCase()) return this._err('clan_name_taken');
      if (c.tag === v.tag) return this._err('clan_tag_taken');
    }
    return this._ok(v);
  }
  async createClan({ name, tag }, now = Date.now()) {
    const v = await this.checkCreate({ name, tag });
    if (!v.ok) return v;
    const id = 'own' + now.toString(36);
    this.s.own = { id, name: v.name, tag: v.tag, createdAt: now, members: [{ id: 'me', role: 'leader', joinedAt: now }], requests: [], nextReqAt: now + 90000 };
    this.s.membership = { clanId: id, role: 'leader', joinedAt: now };
    this.s.outgoing = [];
    // demo: birkaç oyuncu hemen katılmak istesin
    const pool = this._unaffiliated();
    const r = rng(now & 0xffffffff);
    for (let i = 0; i < 4 && pool.length; i++) this.s.own.requests.push({ id: pool.splice(Math.floor(r() * pool.length), 1)[0].id, at: now - i * 60000 });
    this._apply(); this._save();
    return { ok: true, clanId: id };
  }
  requestJoin(clanId, now = Date.now()) {
    if (!this.s.me.nick) return this._err('need_nick');
    if (this.s.membership) return this._err('already_in_clan');
    const x = this._ranked().find((y) => y.c.id === clanId);
    if (!x) return this._err('not_found');
    if (x.count >= C.maxMembers) return this._err('clan_full');
    if (this.s.outgoing.some((o) => o.clanId === clanId)) return this._err('already_requested');
    if (this.s.outgoing.length >= C.maxPendingRequests) return this._err('too_many_requests');
    this.s.outgoing.push({ clanId, at: now, approveAt: now + 4000 + Math.random() * 6000 });
    this._save();
    return this._ok();
  }
  cancelRequest(clanId) {
    this.s.outgoing = this.s.outgoing.filter((o) => o.clanId !== clanId);
    this._save();
    return this._ok();
  }
  leaveClan() {
    const m = this.s.membership;
    if (!m) return this._err('not_in_clan');
    const c = this.world.clans.get(m.clanId);
    if (c && !c.bot) {
      const role = this._myRole(c);
      if (role === 'leader') {
        if (this.s.own.members.length > 1) return this._err('leader_must_transfer');
        this.s.own = null;                 // tek başına: ayrılmak = clanı kapatmak
      } else {
        // kendi kurduğun ama liderliğini devrettiğin clandan çıkış: clan botlarla devam eder (yerel demo: silinir)
        this.s.own = null;
      }
    }
    this.s.membership = null;
    this._apply(); this._save();
    return this._ok();
  }
  _ownAction(action) {
    const o = this.s.own;
    if (!o || this.s.membership?.clanId !== o.id) return { error: 'no_permission' };
    const role = o.members.find((x) => x.id === 'me')?.role;
    if (!can(role, action)) return { error: 'no_permission' };
    return { o, role };
  }
  approve(playerId, now = Date.now()) {
    const { o, error } = this._ownAction('approve');
    if (error) return this._err(error);
    const q = o.requests.find((x) => x.id === playerId);
    if (!q) return this._err('not_found');
    if (o.members.length >= C.maxMembers) return this._err('clan_full');
    const p = this.world.players.get(playerId);
    o.requests = o.requests.filter((x) => x.id !== playerId);
    if (!p || p.clanId) { this._save(); return this._err('not_found'); }   // bu arada başka clana girmiş
    o.members.push({ id: playerId, role: 'member', joinedAt: now });
    this._apply(); this._save();
    return this._ok();
  }
  reject(playerId) {
    const { o, error } = this._ownAction('reject');
    if (error) return this._err(error);
    o.requests = o.requests.filter((x) => x.id !== playerId);
    this._save();
    return this._ok();
  }
  setOfficer(playerId, on) {
    const { o, error } = this._ownAction('officer');
    if (error) return this._err(error);
    const m = o.members.find((x) => x.id === playerId);
    if (!m || m.role === 'leader') return this._err('not_found');
    if (on && m.role !== 'officer' && o.members.filter((x) => x.role === 'officer').length >= C.maxOfficers) return this._err('officers_full');
    m.role = on ? 'officer' : 'member';
    this._apply(); this._save();
    return this._ok();
  }
  kick(playerId) {
    const { o, error } = this._ownAction('kick');
    if (error) return this._err(error);
    const m = o.members.find((x) => x.id === playerId);
    if (!m || m.role === 'leader' || playerId === 'me') return this._err('not_found');
    o.members = o.members.filter((x) => x.id !== playerId);
    this._apply(); this._save();
    return this._ok();
  }
  transferLeader(playerId) {
    const { o, error } = this._ownAction('transfer');
    if (error) return this._err(error);
    const m = o.members.find((x) => x.id === playerId);
    if (!m || playerId === 'me') return this._err('not_found');
    m.role = 'leader';
    o.members.find((x) => x.id === 'me').role = 'member';
    this.s.membership.role = 'member';
    this._apply(); this._save();
    return this._ok();
  }
  disband() {
    const { error } = this._ownAction('disband');
    if (error) return this._err(error);
    this.s.own = null; this.s.membership = null;
    this._apply(); this._save();
    return this._ok();
  }

  // ---------- zaman: istek onayları ve gelen istekler ----------
  tick(now = Date.now()) {
    const events = [];
    // bot clanlara attığın istek: bir officer onaylar
    if (!this.s.membership && this.s.outgoing.length) {
      const due = this.s.outgoing.find((o) => now >= o.approveAt);
      if (due) {
        const x = this._ranked().find((y) => y.c.id === due.clanId);
        if (x && x.count < C.maxMembers) {
          this.s.membership = { clanId: due.clanId, role: 'member', joinedAt: now };
          this.s.outgoing = [];
          events.push({ type: 'joined', clanId: due.clanId, name: x.c.name, tag: x.c.tag });
        } else {
          this.s.outgoing = this.s.outgoing.filter((o) => o !== due);
          events.push({ type: 'request_failed', clanId: due.clanId });
        }
        this._save();
      }
    }
    // kendi clanına bot istekleri (ortalama 90 sn'de bir, en fazla 12 bekleyen)
    const o = this.s.own;
    if (o && this.s.membership?.clanId === o.id) {
      let added = 0;
      while (now >= (o.nextReqAt || 0) && added < 5) {
        o.nextReqAt = (o.nextReqAt || now) + 60000 + Math.random() * 60000;
        if (o.requests.length >= 12 || o.members.length >= C.maxMembers) continue;
        const pool = this._unaffiliated().filter((p) => !o.requests.some((q) => q.id === p.id));
        if (!pool.length) break;
        o.requests.push({ id: pool[Math.floor(Math.random() * pool.length)].id, at: now });
        added++;
      }
      if (now > o.nextReqAt) o.nextReqAt = now + 60000;
      if (added) { events.push({ type: 'requests', count: added }); this._save(); }
    }
    return Promise.resolve(events);
  }

  // ---------- test (?dev=1) ----------
  // Kendi clanında rolünü değiştir: officer görünümünü denemek için lider bir bota geçer
  devSetMyRole(role) {
    const o = this.s.own;
    if (!o || this.s.membership?.clanId !== o.id) return this._err('not_in_clan');
    const me = o.members.find((x) => x.id === 'me');
    if (role === 'leader') {
      for (const m of o.members) if (m.role === 'leader') m.role = 'member';
      me.role = 'leader';
    } else {
      if (!o.members.some((x) => x.id !== 'me')) return this._err('not_found');
      if (me.role === 'leader') {
        const heir = o.members.find((x) => x.id !== 'me' && x.role !== 'officer') || o.members.find((x) => x.id !== 'me');
        heir.role = 'leader';
      }
      if (role === 'officer') {
        const offs = o.members.filter((x) => x.role === 'officer' && x.id !== 'me');
        if (offs.length >= C.maxOfficers) offs[0].role = 'member';
      }
      me.role = role;
    }
    this.s.membership.role = me.role;
    this._apply(); this._save();
    return this._ok();
  }
  devReset() { this.s = freshState(); this._apply(); this._save(); return this._ok(); }
}
