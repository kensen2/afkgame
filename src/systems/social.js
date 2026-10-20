// =====================================================================
//  SOSYAL: nick, sıralama, clan
//  Oyunun geri kalanı sadece bu modülle konuşur; arkadaki backend değiştirilebilir:
//    - bugün: LocalBackend (bot dünya, localStorage)
//    - yarın: SupabaseBackend (aynı metotlar, gerçek oyuncular)
//  Clan bonusu: ilk 5 clanın üyeleri üretim hızına bonus alır (%10/5/3/2/1),
//  clana girildiği an başlar. Bonus yeni token basmaz, havuzdaki payı kaydırır.
// =====================================================================
import { CONFIG } from '../config.js';
import { Economy } from './economy.js';
import { LocalBackend } from '../net/local-backend.js';
import { SupabaseBackend } from '../net/supabase-backend.js';

const listeners = new Set();

export const Social = {
  backend: null,
  me: { nick: null, clanId: null, role: null },
  clan: null,          // kendi clanının özeti (rank, bonus, üyeler, istekler)
  bonus: 0,

  online: false,       // true: gerçek sunucu (Supabase), false: yerel bot dünyası

  async init() {
    const S = CONFIG.server, local = new URLSearchParams(location.search).has('local');
    if (S?.enabled && !local) {
      try { this.backend = await new SupabaseBackend(S).connect(); this.online = true; }
      catch (e) { console.warn('[social] server unreachable, using the local demo world:', e.message); }
    }
    if (!this.backend) this.backend = new LocalBackend();
    await this.refresh();
    // istek onayları, gelen istekler ve sıralama değişimi için düzenli kontrol
    setInterval(() => this.tick(), 2000);
    setInterval(() => this.refresh(), 30000);
    // ekipten: ban, duyuru, ödüller (admin paneli). Sadece gerçek sunucuda.
    if (this.online && this.backend.status) {
      Economy.on((d, e) => this._noteEvent(e));
      this.checkStatus(); setInterval(() => this.checkStatus(), 60000);
    }
    return this;
  },

  banned: null,        // { until, reason } ya da null
  notice: null,
  // Panelde görünen işlem geçmişi: önemli ekonomi olayları kuyruğa, dakikada bir sunucuya
  _events: [],
  _noteEvent(e) {
    const KEEP = new Set(['claim', 'deposit', 'vault', 'withdraw', 'tokenSpend', 'keyUsed', 'forge', 'gemItem', 'keys', 'season', 'tomes',
      'xp', 'upgrade', 'skill', 'revive', 'bestWave']);
    if (!e?.type || !KEEP.has(e.type) || (e.type === 'xp' && !e.leveled)) return;
    const d = Economy.data, data = {};
    for (const k of ['amount', 'id', 'wave']) if (e[k] != null) data[k] = typeof e[k] === 'number' ? Math.round(e[k]) : e[k];
    if (e.usd != null) data.usd = Math.round(e.usd * 100) / 100;          // v8: çekim/yatırım USD değeri
    if (e.fee != null) { data.fee = Math.round(e.fee); data.rate = e.rate; }
    if (e.type === 'keys' && e.id) data.have = Economy.keyCount(e.id);
    if (e.type === 'forge') data.level = d.forge;
    if (e.type === 'xp') data.level = d.level;
    if (e.type === 'upgrade') Object.assign(data, { hero: e.heroId, slot: e.key, level: Economy.upgradeLevel(e.heroId, e.key) });
    if (e.type === 'skill') Object.assign(data, { hero: e.heroId, skill: e.i, level: Economy.skillLevel(e.heroId, e.i) });
    // art arda aynı ekipmanı/yeteneği yükseltmek tek satır olsun (seviye güncellenir, kaç kez basıldığı sayılır)
    const last = this._events[this._events.length - 1];
    if (last && last.kind === e.type && (e.type === 'upgrade' || e.type === 'skill') && last.data.hero === data.hero
      && last.data.slot === data.slot && last.data.skill === data.skill) {
      last.data.level = data.level; last.data.times = (last.data.times || 1) + 1; last.at = Date.now();
      return;
    }
    this._events.push({ kind: e.type, data, at: Date.now() });
    if (this._events.length > 200) this._events.splice(0, this._events.length - 200);
  },
  async checkStatus() {
    if (this.hasNick() && this.backend.report) {
      const ev = this._events.splice(0, 50);
      const rr = await this.backend.report(Economy.snapshot(), ev);
      if (!rr?.ok) this._events.unshift(...ev);
    }
    const r = await this.backend.status();
    if (!r?.ok) return;
    Economy.setNerf(r.nerf ?? 1);
    const msgs = [], notes = new Set();
    for (const g of r.grants || []) {
      const msg = Economy.applyGrant(g);
      this._events.push({ kind: 'teamGift', data: { kind: g.kind, amount: g.amount }, at: Date.now() });
      if (msg === 'wipe') { this.emit({ type: 'wipe' }); return; }
      if (msg) { msgs.push(msg); if (g.note) notes.add(g.note); }
    }
    if (msgs.length) this.emit({ type: 'grant', msg: msgs.join(', '), note: [...notes].join(' · ') });
    const ban = r.banned ? { until: r.banUntil, reason: r.banReason || '' } : null;
    if (JSON.stringify(ban) !== JSON.stringify(this.banned)) { this.banned = ban; this.emit({ type: 'ban' }); }
    if ((r.notice || null) !== this.notice) { this.notice = r.notice || null; this.emit({ type: 'notice' }); }
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(evt = {}) { for (const fn of listeners) fn(this, evt); },

  hasNick() { return !!this.me.nick; },

  async _pushStats() {
    await this.backend.setMyStats({ rate: Economy.baseRatePerHour(), wave: Economy.data.seasonBest || 0 });
  },
  async refresh(evt) {
    await this._pushStats();
    this.me = (await this.backend.getMe()).me;
    this.clan = this.me.clanId ? (await this.backend.getMyClan()).clan : null;
    this.bonus = this.clan?.bonus || 0;
    Economy.setRateBonus(this.bonus);
    this.emit(evt || { type: 'refresh' });
  },
  async tick() {
    const events = await this.backend.tick(Date.now());
    if (events.length) for (const e of events) await this.refresh(e);
  },

  // ---- nick ----
  async setNick(nick) {
    const r = await this.backend.setNick(nick);
    if (r.ok) await this.refresh({ type: 'nick' });
    return r;
  },

  // ---- sıralama ----
  async players(opts) { await this._pushStats(); return this.backend.leaderboardPlayers(opts); },
  async clans(opts) { await this._pushStats(); return this.backend.leaderboardClans(opts); },
  async listClans(opts) { await this._pushStats(); return this.backend.listClans(opts); },
  async getClan(id) { await this._pushStats(); return this.backend.getClan(id); },

  // ---- clan işlemleri ----
  // Kurma ücreti: önce kurallar kontrol edilir, sonra 25.000 DGN harcanır, sonra clan kurulur.
  // (Supabase'de bu tek bir sunucu fonksiyonunda, bakiye düşümüyle birlikte yapılacak.)
  async createClan(name, tag) {
    const cost = CONFIG.social.clan.createCost;
    const chk = await this.backend.checkCreate({ name, tag });
    if (!chk.ok) return chk;
    if (!Economy.canAffordTokens(cost)) return { ok: false, error: 'no_funds' };
    const before = { balance: Economy.data.balance, depositBal: Economy.data.depositBal, spentDungeon: Economy.data.spentDungeon };
    Economy.spendTokens(cost);
    const r = await this.backend.createClan({ name: chk.name, tag: chk.tag });
    if (!r.ok) { Object.assign(Economy.data, before); Economy.save(); Economy.emit(); return r; }
    await this.refresh({ type: 'created' });
    return r;
  },
  async _do(fn, evt) {
    const r = await fn();
    if (r.ok) await this.refresh(evt);
    return r;
  },
  requestJoin(id) { return this._do(() => this.backend.requestJoin(id), { type: 'requested' }); },
  cancelRequest(id) { return this._do(() => this.backend.cancelRequest(id), { type: 'cancelled' }); },
  leave() { return this._do(() => this.backend.leaveClan(), { type: 'left' }); },
  approve(pid) { return this._do(() => this.backend.approve(pid), { type: 'approved' }); },
  reject(pid) { return this._do(() => this.backend.reject(pid), { type: 'rejected' }); },
  setOfficer(pid, on) { return this._do(() => this.backend.setOfficer(pid, on), { type: 'officer' }); },
  kick(pid) { return this._do(() => this.backend.kick(pid), { type: 'kicked' }); },
  transferLeader(pid) { return this._do(() => this.backend.transferLeader(pid), { type: 'transfer' }); },
  disband() { return this._do(() => this.backend.disband(), { type: 'disbanded' }); },
  devSetMyRole(role) { return this._do(() => this.backend.devSetMyRole(role), { type: 'dev' }); },
};
