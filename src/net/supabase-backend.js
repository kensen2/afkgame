// =====================================================================
//  SupabaseBackend: nick, clan ve sıralama gerçek sunucudan.
//  LocalBackend ile aynı metotlar (Social sadece bunları çağırır).
//  Kütüphane yok: Supabase'in REST uçları fetch ile çağrılır.
//    - Giriş: anonim hesap (e-posta/şifre yok). Oturum localStorage'da saklanır.
//    - Her değişiklik sunucudaki security definer fonksiyonlarla (supabase/schema.sql) yapılır.
//  Anahtar: "publishable" anahtar herkese açık olacak şekilde tasarlanmıştır; gizli anahtar ASLA burada olmaz.
// =====================================================================
import { CONFIG } from '../config.js';
import { validateNick, validateClan } from '../systems/clan-rules.js';

const SESSION_KEY = 'afk_sb_session_v1';
const KNOWN = new Set(['need_nick', 'already_in_clan', 'not_in_clan', 'clan_full', 'too_many_requests', 'already_requested',
  'no_permission', 'officers_full', 'leader_must_transfer', 'not_found', 'nick_taken', 'nick_reserved', 'clan_name_taken', 'clan_tag_taken']);

export class SupabaseBackend {
  constructor({ url, key, timeoutMs = 8000 } = CONFIG.server) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.me = { id: null, nick: null, clanId: null, role: null, outgoing: [] };
    this._lastWave = -1;
    this._nextTick = 0;
    this._reqCount = null;
  }

  // ---------- düşük seviye ----------
  async _fetch(path, { method = 'POST', body, auth = true } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const headers = { apikey: this.key, 'Content-Type': 'application/json' };
      if (auth && this.session?.access_token) headers.Authorization = `Bearer ${this.session.access_token}`;
      const r = await fetch(this.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      const text = await r.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: r.ok, status: r.status, data };
    } finally { clearTimeout(timer); }
  }
  _saveSession() { try { localStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch (e) { /* depolama yok */ } }
  _takeSession(d) {
    this.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user_id: d.user?.id };
    this._saveSession();
  }
  async _ensureSession() {
    if (this.session && Date.now() < this.session.expires_at - 60000) return;
    if (this.session?.refresh_token) {
      const r = await this._fetch('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: this.session.refresh_token }, auth: false });
      if (r.ok && r.data?.access_token) { this._takeSession(r.data); return; }
    }
    // yeni anonim hesap (oturum kaybolduysa nick de yeniden alınır)
    const r = await this._fetch('/auth/v1/signup', { body: {}, auth: false });
    if (!r.ok || !r.data?.access_token) throw new Error('auth_failed:' + (r.data?.msg || r.data?.message || r.status));
    this._takeSession(r.data);
  }
  async _rpc(fn, args = {}) {
    try {
      await this._ensureSession();
      let r = await this._fetch(`/rest/v1/rpc/${fn}`, { body: args });
      if (r.status === 401) { this.session.expires_at = 0; await this._ensureSession(); r = await this._fetch(`/rest/v1/rpc/${fn}`, { body: args }); }
      if (r.ok) return { ok: true, data: r.data };
      const msg = r.data?.message || '';
      return { ok: false, error: KNOWN.has(msg) ? msg : 'server_error', detail: msg };
    } catch (e) {
      return { ok: false, error: 'offline', detail: String(e?.message || e) };
    }
  }

  // Bağlantıyı dene (Social.init çağırır). Başarısızsa oyun yerel botlarla devam eder.
  async connect() {
    try { const raw = localStorage.getItem(SESSION_KEY); if (raw) this.session = JSON.parse(raw); } catch (e) { /* yok */ }
    const r = await this._rpc('get_me');
    if (!r.ok) throw new Error(r.detail || r.error);
    this._setMe(r.data);
    return this;
  }
  _setMe(d) {
    this.me = { id: d?.id || null, nick: d?.nick || null, clanId: d?.clanId || null, role: d?.role || null, outgoing: d?.outgoing || [] };
  }

  // ---------- oyuncu ----------
  async setMyStats({ wave }) {
    // üretimi sunucu dalgadan hesaplar; sadece değişince gönder
    if (!this.me.nick || wave === this._lastWave) return { ok: true };
    const r = await this._rpc('set_my_stats', { p_wave: wave || 0 });
    if (r.ok) this._lastWave = wave;
    return r.ok ? { ok: true } : r;
  }
  async getMe() {
    const r = await this._rpc('get_me');
    if (r.ok) this._setMe(r.data);
    const { id, nick, clanId, role } = this.me;
    return { ok: true, me: { id, nick, clanId, role } };
  }
  async setNick(nick) {
    const v = validateNick(nick);
    if (!v.ok) return v;
    const r = await this._rpc('set_nick', { p_nick: v.nick });
    if (!r.ok) return r;
    this.me.nick = v.nick; this._lastWave = -1;
    return { ok: true, nick: v.nick };
  }

  // ---------- sıralama ----------
  async leaderboardPlayers({ limit = 100 } = {}) {
    const r = await this._rpc('leaderboard_players', { lim: limit });
    if (!r.ok) return r;
    const d = r.data;
    return { ok: true, rows: d.rows, total: d.total, me: d.me || { rank: d.total + 1, nick: this.me.nick || '—', wave: 0, rate: 0, tag: null, isMe: true } };
  }
  async leaderboardClans({ limit = 50 } = {}) {
    const r = await this._rpc('list_clans', { q: '', lim: limit });
    return r.ok ? { ok: true, rows: r.data.rows, mine: r.data.mine, total: r.data.total } : r;
  }
  async listClans({ query = '' } = {}) {
    const r = await this._rpc('list_clans', { q: query.trim(), lim: 100 });
    return r.ok ? { ok: true, rows: r.data.rows } : r;
  }
  async getClan(id) {
    const r = await this._rpc('get_clan', { c: id });
    if (!r.ok) return r;
    const d = r.data;
    return { ok: true, clan: { ...d.summary, members: d.members, myRole: d.myRole, requests: d.requests || undefined, bot: false, createdAt: d.createdAt } };
  }
  async getMyClan() {
    if (!this.me.clanId) return { ok: true, clan: null };
    return this.getClan(this.me.clanId);
  }

  // ---------- clan ----------
  async checkCreate({ name, tag }) {
    if (!this.me.nick) return { ok: false, error: 'need_nick' };
    const v = validateClan(name, tag);
    if (!v.ok) return v;
    const r = await this._rpc('check_clan', { p_name: v.name, p_tag: v.tag });
    return r.ok ? v : r;
  }
  async createClan({ name, tag }) {
    const r = await this._rpc('create_clan', { p_name: name, p_tag: tag });
    if (!r.ok) return r;
    await this.getMe();
    return { ok: true, clanId: r.data };
  }
  _act(fn, args) { return this._rpc(fn, args).then(async (r) => { if (r.ok) await this.getMe(); return r.ok ? { ok: true } : r; }); }
  requestJoin(clanId) { return this._act('request_join', { c: clanId }); }
  cancelRequest(clanId) { return this._act('cancel_request', { c: clanId }); }
  leaveClan() { return this._act('leave_clan', {}); }
  approve(pid) { return this._act('review_request', { c: this.me.clanId, p: pid, accept: true }); }
  reject(pid) { return this._act('review_request', { c: this.me.clanId, p: pid, accept: false }); }
  setOfficer(pid, on) { return this._act('set_officer', { c: this.me.clanId, p: pid, on_: !!on }); }
  kick(pid) { return this._act('kick_member', { c: this.me.clanId, p: pid }); }
  transferLeader(pid) { return this._act('transfer_leader', { c: this.me.clanId, p: pid }); }
  disband() { return this._act('disband_clan', { c: this.me.clanId }); }
  devSetMyRole() { return Promise.resolve({ ok: false, error: 'not_found' }); }

  // ---------- düzenli kontrol: katılma onayı, atılma, yeni istekler ----------
  async tick(now = Date.now()) {
    if (now < this._nextTick || !this.me.nick) return [];
    this._nextTick = now + 10000;
    const before = { clanId: this.me.clanId, role: this.me.role };
    const r = await this._rpc('get_me');
    if (!r.ok) return [];
    this._setMe(r.data);
    const events = [];
    if (!before.clanId && this.me.clanId) {
      const c = await this.getClan(this.me.clanId);
      events.push({ type: 'joined', clanId: this.me.clanId, name: c.clan?.name, tag: c.clan?.tag });
    } else if (before.clanId && !this.me.clanId) {
      events.push({ type: 'removed' });
    } else if (before.role !== this.me.role) {
      events.push({ type: 'role', role: this.me.role });
    }
    // lider/officer: bekleyen istek sayısı arttı mı
    if (this.me.clanId && (this.me.role === 'leader' || this.me.role === 'officer')) {
      const c = await this.getClan(this.me.clanId);
      const n = c.clan?.requests?.length ?? 0;
      if (this._reqCount !== null && n > this._reqCount) events.push({ type: 'requests', count: n - this._reqCount });
      this._reqCount = n;
    } else this._reqCount = null;
    return events;
  }
}
