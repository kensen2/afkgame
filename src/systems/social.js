// =====================================================================
//  SOSYAL: nick, sıralama, clan
//  Oyunun geri kalanı sadece bu modülle konuşur; arkadaki backend değiştirilebilir:
//    - bugün: LocalBackend (bot dünya, localStorage)
//    - yarın: SupabaseBackend (aynı metotlar, gerçek oyuncular)
//  Clan bonusu: ilk 5 clanın üyeleri üretim hızına bonus alır (%10/5/3/2/1),
//  clana girildiği an başlar. Havuzlar sabit 10M olduğu için bonus havuzdaki paydan gelir.
// =====================================================================
import { CONFIG } from '../config.js';
import { Economy } from './economy.js';
import { LocalBackend } from '../net/local-backend.js';

const listeners = new Set();

export const Social = {
  backend: null,
  me: { nick: null, clanId: null, role: null },
  clan: null,          // kendi clanının özeti (rank, bonus, üyeler, istekler)
  bonus: 0,

  async init() {
    this.backend = new LocalBackend();
    await this.refresh();
    // istek onayları, gelen istekler ve sıralama değişimi için düzenli kontrol
    setInterval(() => this.tick(), 2000);
    setInterval(() => this.refresh(), 30000);
    return this;
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
