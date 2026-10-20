// =====================================================================
//  EKONOMİ + KAYIT
//  Gold, XP, hesap seviyesi, geliştirmeler ve karakter sahipliği burada.
//  Ekonomi v5: saatlik DGN üretimi, anahtarlar, iki havuz, çekim kuralları, 10 günlük sezon.
//  Faz 1: her şey tarayıcıda (demo). Faz 2'de bakiye/havuz sunucuya, Faz 3'te kasa kontratına taşınır.
// =====================================================================
import { CONFIG, F } from '../config.js';

const KEY = 'zindan_dalgalari_save_v1';

function freshHero() {
  const upgrades = {};
  for (const k of Object.keys(CONFIG.upgrades)) upgrades[k] = 0;
  return { upgrades, skills: [1, 1, 1], owned: true };
}

function freshSave() {
  return {
    version: 1,
    econVer: 5,          // ekonomi sürümü (değişince eski ilerleme sıfırlanır)
    gold: 0,
    tomes: 0,            // Skill Tome envanteri (yetenek Lv4+ için)
    bossesBeaten: [],    // ilk kez yenilen boss dalgaları (ilk yeniliş ödülü için)
    goldRushUntil: 0,    // Gold Rush bitiş zamanı (ms)
    idlePass: false,     // sezonluk Idle Pass
    // ---- DGN (Ekonomi v5) ----
    season: null,        // sezon numarası (F.seasonIndex)
    balance: 0,          // oyun içi DGN bakiyesi (üretim + yatırılan)
    uncollected: 0,      // üretilmiş ama henüz Claim edilmemiş
    depositBal: 0,       // bakiyenin yatırılan tokenden gelen, henüz harcanmamış kısmı (paketler bununla alınır)
    credit: 0,           // (eski, DGN) anapara hakkı; v8'de creditUsd kullanılır
    creditUsd: 0,        // anapara hakkı (USD): yatırdığın kadar, günlük sınıra takılmadan çekilebilir
    poolAvail: 0,        // bedava oyuncu: bugün havuzdan çekilebilir DGN (gün dönünce sıfırlanır)
    poolUsd: 0,          // yatıran: üretiminden açılan çekim hakkı (USD), sezon sonuna kadar birikir
    seasonDepositedUsd: 0, prodUsdSinceDeposit: 0, withdrawnUsdSeason: 0,
    feesToPool: 0,       // çekim kesintilerinden ödül havuzuna dönen DGN
    refUsd: 0,           // davet kazancı: çekilebilir (USD), 2.2x tavanına sayılmaz
    refSeasonUsd: 0, refTotalUsd: 0,
    poolDay: -1,
    vault: 0,            // kasada bekleyen (cüzdana gönderilecek)
    deposited: 0, withdrawn: 0, spentDungeon: 0, feesBurned: 0,
    seasonDeposited: 0, firstDepositAt: 0,
    keys: {},            // { bronze: 10, silver: 3, ... } kullanılmamış anahtarlar (sezonlar arası taşınır)
    opened: 20,          // bu sezon açılmış en yüksek dalga (20'ye kadar herkese açık)
    forge: 0,            // Forge seviyesi (sezonluk)
    seasonBest: 0,       // bu sezonun en iyi dalgası (üretim bunu kullanır)
    lastAccrue: 0,
    activeRate: 0,       // son aktif oyundaki ortalama gold/sn (Gold Rush hariç); AFK ve Time Skip bunu kullanır
    level: 1,
    xp: 0,
    skillPoints: 0,
    bestWave: 0,
    resumeWave: 1,       // bir sonraki koşunun başlayacağı dalga
    wins: 0,
    totalKills: 0,
    selectedHero: 'warrior',
    heroes: { warrior: freshHero(), lion: freshHero(), mage: freshHero() },
    settings: { auto: true, speed: 1, sound: true, music: true, musicVol: 0.1, sfxVol: 0.1, audioVer: 2, offline: true, story: true },
    storySeen: [],       // görülmüş hikaye sahneleri (her sahne bir kez)
    lastSeen: 0,         // son görülme zamanı (çevrimdışı kazanç için)
    offlineTotal: 0,
  };
}

const listeners = new Set();

export const Economy = {
  data: freshSave(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const base = freshSave();
        this.data = { ...base, ...d, heroes: { ...base.heroes, ...d.heroes }, settings: { ...base.settings, ...d.settings } };
        // eski kayıtlarda ses %10'dan başlasın (bir kerelik)
        if ((this.data.settings.audioVer || 0) < 2) { this.data.settings.musicVol = 0.1; this.data.settings.sfxVol = 0.1; this.data.settings.audioVer = 2; }
        // eski kayıttaki 3x hız artık yok
        if (![1, 1.25, 1.5, 2, 2.5].includes(this.data.settings.speed)) this.data.settings.speed = 1;
        // eski kayıt: checkpoint'ten devam dalgasına geçiş
        if (d.resumeWave === undefined && d.checkpointWave) this.data.resumeWave = d.checkpointWave;
        for (const h of Object.keys(CONFIG.heroes)) {
          const fh = freshHero();
          this.data.heroes[h] = { ...fh, ...this.data.heroes[h], upgrades: { ...fh.upgrades, ...(this.data.heroes[h]?.upgrades || {}) } };
        }
        // Ekonomi sürümü değişince eski ilerleme
        // yeni dengeyle uyumsuz; bir kereliğine sıfırlanır (ayarlar korunur)
        if ((d.econVer || 1) < 5) {
          const settings = this.data.settings;
          this.data = freshSave();
          this.data.settings = settings;
          this.economyReset = true;
        }
        // v8: yatıranın hakları USD'ye taşındı (eski DGN değerleri tasarım kuruyla çevrilir, bir kerelik)
        if (d.creditUsd === undefined) {
          const D = this.data, k = CONFIG.token.designUsdPerToken;
          D.creditUsd = (D.credit || 0) * k; D.credit = 0;
          D.seasonDepositedUsd = (D.seasonDeposited || 0) * k;
          D.prodUsdSinceDeposit = (D.prodSinceDeposit || 0) * k;
          if ((D.seasonDeposited || 0) > 0) { D.poolUsd = (D.poolAvail || 0) * k; D.poolAvail = 0; }
        }
      }
    } catch (e) { console.warn('Could not read save', e); }
    this.rateBonus = Math.max(0, Math.min(0.10, +this.data.clanBonus || 0));
    this._awaySince = this.data.lastSeen || 0;
    return this.data;
  },

  save() {
    this.data.lastSeen = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* tarayıcı depolamaya izin vermiyor */ }
  },

  // Çevrimdışı kazancı hesapla ve hesaba ekle. Rapor döner (yoksa null).
  claimOffline(now = Date.now()) {
    // açılışta okunan son görülme zamanı öncelikli (yükleme sırasında kayıt güncellense bile kaybolmasın)
    const last = this._awaySince || this.data.lastSeen;
    this._awaySince = null;
    if (!last || !this.data.settings.offline) return null;
    const away = Math.max(0, (now - last) / 1000);
    if (away < CONFIG.offline.minSeconds) return null;
    const secs = Math.min(away, F.offlineMaxHours(this.data) * 3600);
    // Gold Rush çevrimdışı sürenin yalnızca çakışan kısmında geçerli
    const rushSecs = Math.max(0, Math.min(secs, (Math.min(now, this.data.goldRushUntil || 0) - last) / 1000));
    const gold = Math.floor(F.offlineGoldPerSec(this.data) * (secs + rushSecs * (CONFIG.tokenShop.goldRush.mult - 1)));
    if (gold <= 0) return null;
    this.addGold(gold);
    this.data.offlineTotal = (this.data.offlineTotal || 0) + gold;
    this.save();
    return { away, secs, gold, capped: away > secs, maxHours: F.offlineMaxHours(this.data), wave: Math.max(1, this.data.resumeWave || 1), hero: this.data.selectedHero };
  },

  // İlerlemeyi sıfırla; ses/hız gibi ayarlar korunur
  // DGN tarafına dokunulmaz: bakiye, anapara hakkı, kasa, anahtarlar, sezon ve sayaçlar kalır.
  // (Üretimi belirleyen seasonBest ve açılmış dalga da kalır; yoksa sıfırlama oyuncunun kazancını düşürürdü.)
  reset() {
    const d = this.data, keep = {};
    for (const k of ['settings', 'season', 'balance', 'uncollected', 'depositBal', 'credit', 'poolAvail', 'poolDay', 'vault',
      'deposited', 'withdrawn', 'spentDungeon', 'feesBurned', 'feesToPool', 'creditUsd', 'poolUsd', 'seasonDepositedUsd', 'prodUsdSinceDeposit', 'withdrawnUsdSeason', 'refUsd', 'refSeasonUsd', 'refTotalUsd', 'vaultMoves', 'prodSinceDeposit', 'roiAt', 'walletBal', 'walletHist', 'seasonDeposited', 'firstDepositAt', 'keys', 'opened',
      'seasonBest', 'lastAccrue', 'idlePass', 'clanBonus',
      // DGN ile alınanlar da kalır: Forge, Gold Rush, Skill Tome. Tome ile birlikte "yenilmiş boss" listesi de
      // kalır; yoksa sıfırlayıp boss'ları tekrar yenerek bedava Tome toplanabilirdi.
      'forge', 'goldRushUntil', 'tomes', 'bossesBeaten', 'chestsTaken', 'storySeen']) keep[k] = d[k];
    this.data = freshSave();
    Object.assign(this.data, keep);
    this.save(); this.emit();
  },

  // Ekipten gelen ödül ya da emir (admin paneli → sunucu → my_status). Oyuncuya gösterilecek kısa metni döner.
  // wipe: hile/hata ile bozulmuş kaydı tamamen sıfırlar (sadece ayarlar kalır).
  applyGrant(g) {
    // eksi miktar = ekip geri aldı (hile ile basılan anahtar vb.); hiçbir değer 0'ın altına inmez
    const d = this.data, n = Math.trunc(Number(g?.amount) || 0), fmt = (x) => Math.abs(x).toLocaleString('en-US');
    const sign = n < 0 ? '−' : '+', add = (v) => Math.max(0, (v || 0) + n), plural = (w) => (Math.abs(n) === 1 ? w : w + 's');
    switch (g?.kind) {
      case 'gold': d.gold = add(d.gold); this.save(); this.emit({ type: 'grant' }); return `${sign}${fmt(n)} gold`;
      case 'dgn': d.balance = add(d.balance); if (n < 0) d.depositBal = Math.min(d.depositBal || 0, d.balance); this.save(); this.emit({ type: 'grant' }); return `${sign}${fmt(n)} DGN`;
      case 'tomes': d.tomes = add(d.tomes); this.save(); this.emit({ type: 'grant' }); return `${sign}${fmt(n)} ${plural('Skill Tome')}`;
      case 'wipe': { const settings = d.settings; this.data = freshSave(); this.data.settings = settings; this.save(); this.emit({ type: 'wipe' }); return 'wipe'; }
      default: {
        const k = String(g?.kind || '').startsWith('key_') && CONFIG.v5.keys.find((x) => x.id === g.kind.slice(4));
        if (!k) return null;
        d.keys = d.keys || {}; d.keys[k.id] = add(this.keyCount(k.id));
        this.save(); this.emit({ type: 'keys', id: k.id });
        return `${sign}${fmt(n)} ${plural(k.name)}`;
      }
    }
  },
  // Ekibin kişiye özel üretim çarpanı (admin paneli "nerf"). 1 = normal.
  nerf: 1,
  setNerf(m) {
    m = Math.min(1, Math.max(0, Number(m)));
    if (!Number.isFinite(m) || m === this.nerf) return;
    this.accrue(); this.nerf = m; this.emit({ type: 'rateBonus', bonus: this.rateBonus });
  },
  // Sunucuya giden özet (admin panelinde görünür)
  snapshot() {
    const d = this.data, lv = {};
    for (const [h, v] of Object.entries(d.heroes || {})) lv[h] = { up: Object.values(v.upgrades || {}).reduce((a, b) => a + b, 0), sk: (v.skills || []).join('/') };
    return { gold: Math.floor(d.gold), dgn: Math.floor(d.balance || 0), uncollected: Math.floor(d.uncollected || 0), vault: Math.floor(d.vault || 0),
      deposited: d.deposited || 0, seasonDeposited: d.seasonDeposited || 0, withdrawn: Math.floor(d.withdrawn || 0), spent: Math.floor(d.spentDungeon || 0),
      depositedUsd: +(d.seasonDepositedUsd || 0).toFixed(2), withdrawnUsd: +(d.withdrawnUsdSeason || 0).toFixed(2), returnX: +this.returnX().toFixed(3),
      fees: Math.floor((d.feesToPool || 0) + (d.feesBurned || 0)), keys: d.keys || {}, opened: d.opened, seasonBest: d.seasonBest || 0, bestWave: d.bestWave || 0,
      level: d.level, forge: d.forge || 0, tomes: d.tomes || 0, season: d.season, rate: Math.round(this.ratePerHour()), heroes: lv, hero: d.selectedHero,
      afkLast: d.afkLast || 0, afkSeasonH: Math.round((d.afkSeasonMs || 0) / 360000) / 10,
      econ: this.econSummary() };
  },
  // Admin paneli için çekim özeti (v8, USD). Oyuncunun tarayıcısı bildirir; Faz 2'de sunucu hesaplayacak.
  econSummary(now = Date.now()) {
    const d = this.data, r2 = (x) => Math.round((x || 0) * 100) / 100, D = CONFIG.v5.depositor;
    const dep = d.seasonDepositedUsd || 0, depositor = this.isDepositor();
    const day = d.roiAt ? Math.floor((now - d.roiAt) / 86400000) : null;
    const proj = this.projectSeason(now);
    return {
      depositor, price: +this.price().toPrecision(4), depositedUsd: r2(dep), withdrawnUsd: r2(d.withdrawnUsdSeason),
      returnX: +this.returnX().toFixed(3), lifeCap: D.lifeCap, capUsd: r2(this.lifeCapUsd()),
      capRoomUsd: r2(Math.max(0, this.lifeCapUsd() - (d.withdrawnUsdSeason || 0))), atCap: this.atLifeCap(),
      creditUsd: r2(d.creditUsd), poolUsd: r2(d.poolUsd), availableUsd: r2(this.withdrawableUsd()), availableDgn: this.withdrawable(),
      freePoolDgn: Math.floor(d.poolAvail || 0), roiLeftUsd: r2(this.roiLeftUsd()), paidBack: !!d.roiAt,
      shareDay: day === null ? null : day + 1, shareToday: day === null ? 0 : D.schedule[Math.min(day, D.schedule.length - 1)],
      usdPerHour: r2(this.usdPerHour()), perDayUsd: r2(this.poolPerDayUsd(now)), nextFee: this.nextFee(now),
      refUsd: r2(d.refUsd), refSeasonUsd: r2(d.refSeasonUsd), refTotalUsd: r2(d.refTotalUsd),
      feesToPool: Math.floor(d.feesToPool || 0), daysLeft: +((F.seasonEndsAt(now) - now) / 86400000).toFixed(2),
      projMaxUsd: proj ? r2(proj.maxUsd) : null, projMaxX: proj ? +proj.maxX.toFixed(2) : null, projCapInDays: proj?.capInDays ?? null,
    };
  },
  // Sezon sonuna kadar en fazla ne çekebilir (bugünkü üretim hızıyla, her açılan hakkı çektiğini varsayar)
  projectSeason(now = Date.now()) {
    if (!this.isDepositor()) return null;
    const d = this.data, D = CONFIG.v5.depositor, capK = CONFIG.v5.demo.depositor.capK;
    const dep = d.seasonDepositedUsd || 0, cap = this.lifeCapUsd(), perHour = this.usdPerHour();
    let total = (d.withdrawnUsdSeason || 0) + this.withdrawableUsd(), roiLeft = this.roiLeftUsd(), capInDays = null;
    let idx = d.roiAt ? Math.floor((now - d.roiAt) / 86400000) : -1;
    const daysLeft = Math.max(0, (F.seasonEndsAt(now) - now) / 86400000);
    if (total >= cap) capInDays = 0;
    for (let i = 0; i < Math.ceil(daysLeft); i++) {
      const frac = Math.min(1, daysLeft - i);
      if (total >= cap) { total += dep * D.afterCap * frac; continue; }
      let prod = perHour * 24 * frac;
      if (roiLeft > 0) { const pay = Math.min(prod, roiLeft); roiLeft -= pay; prod -= pay; if (roiLeft <= 0) idx = 0; }
      else idx++;
      if (idx >= 0 && prod > 0) total = Math.min(cap, total + prod * D.schedule[Math.min(idx, D.schedule.length - 1)] * capK);
      if (total >= cap && capInDays === null) capInDays = i + 1;
    }
    return { maxUsd: total, maxX: dep > 0 ? total / dep : 0, capInDays };
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(evt = {}) { for (const fn of listeners) fn(this.data, evt); },

  addGold(n) {
    n = Math.max(0, Math.round(n));
    this.data.gold += n;
    this.emit({ type: 'gold', amount: n });
    return n;
  },

  canAfford(n) { return this.data.gold >= n; },

  // ======================= DGN (Ekonomi v5) =======================
  // Faz 1: sunucu ve zincir yok. Yatırma "demo token", havuz payı config.v5.demo'daki örnek realm'e göre.
  isDepositor() { return (this.data.seasonDeposited || 0) > 0; },
  // Yatıran: kazanç, yatırdığını üretimiyle geri alınca (ROI) başlar
  poolEligible() {
    if (!this.isDepositor()) return true;
    return !!this.data.roiAt;
  },
  // ---- v8: USD hesapları (oracle) ----
  price() { return CONFIG.token.usdPerToken; },               // oracle (TWAP); oracle yoksa tasarım kuru
  prodUsd(dgn) { return dgn * this.price(); },                // üretilen DGN'in USD değeri (yatıranda saatlik USD sabit)
  usdPerHour() { return this.prodUsd(this.ratePerHour()); },
  // Geri ödemeye kalan (USD) ve tahmini zaman
  roiLeftUsd() { return Math.max(0, (this.data.seasonDepositedUsd || 0) - (this.data.prodUsdSinceDeposit || 0)); },
  poolStartsAt(now = Date.now()) { const r = this.usdPerHour(); return r > 0 ? now + this.roiLeftUsd() / r * 3600000 : Infinity; },
  // Sezonda çekilen / yatırılan (kat). 2.2x'e ulaşınca kazanç günde %1'e düşer.
  returnX() { const dep = this.data.seasonDepositedUsd || 0; return dep > 0 ? (this.data.withdrawnUsdSeason || 0) / dep : 0; },
  lifeCapUsd() { return (this.data.seasonDepositedUsd || 0) * CONFIG.v5.depositor.lifeCap; },
  atLifeCap() { return this.isDepositor() && (this.data.withdrawnUsdSeason || 0) >= this.lifeCapUsd() - this.price() * 2; },   // 2 DGN pay: çekimler tam sayı DGN
  // ROI'den sonraki gün sayısına göre üretimin çekilebilir oranı (havuz sınırı dahil)
  depositorRate(now = Date.now()) {
    const D = CONFIG.v5.depositor, d = this.data;
    if (!d.roiAt) return 0;
    const day = Math.max(0, Math.floor((now - d.roiAt) / 86400000));
    return D.schedule[Math.min(day, D.schedule.length - 1)] * CONFIG.v5.demo.depositor.capK;
  },
  // Yatıranın bugünkü çekim hakkı artışı (USD/gün)
  poolPerDayUsd(now = Date.now()) {
    if (!this.isDepositor()) return F.usd(this.poolPerDay());
    if (this.atLifeCap()) return (this.data.seasonDepositedUsd || 0) * CONFIG.v5.depositor.afterCap;
    return this.usdPerHour() * 24 * this.depositorRate(now);
  },
  // Üretim: sezonun en iyi dalgası × (1 + clan bonusu). Bonus ilk 5 clana girince hemen başlar.
  baseRatePerHour() { return F.rateAt(this.data.seasonBest || 0); },
  ratePerHour() { return this.baseRatePerHour() * (1 + (this.rateBonus || 0)) * (this.nerf ?? 1) * this.priceFactor(); },
  // v8: yatıranın üretimi USD'de sabittir (tablo değeri × tasarım kuru); DGN miktarı oracle fiyatına göre değişir.
  // Bedava oyuncunun üretimi DGN olarak sabit kalır (1.000/saat tavanı).
  priceFactor() { return this.isDepositor() ? CONFIG.token.designUsdPerToken / CONFIG.token.usdPerToken : 1; },
  rateBonus: 0,
  // Clan bonusu değişince önce eski hızla biriken kısmı yaz, sonra yeni hıza geç
  setRateBonus(b) {
    b = Math.max(0, +b || 0);
    if (b === this.rateBonus) return;
    this.accrue();
    this.rateBonus = b;
    this.data.clanBonus = b; this.save();    // açılışta, clan bilgisi gelmeden önceki birikim de doğru hızla hesaplansın
    this.emit({ type: 'rateBonus', bonus: b });
  },
  // Bugünkü havuz payı (DGN/gün), realm doluluğuna göre
  poolPerDay() {
    if (this.isDepositor()) return this.ratePerHour() * 24 * this.depositorRate();
    const D = CONFIG.v5.demo, dep = false;
    const pool = dep ? CONFIG.v5.pools.depositor : F.freePoolSize(D.free.players + 1);
    return F.poolShare(pool, this.ratePerHour(), (dep ? D.depositor : D.free).rateSum);
  },
  realmFill() {
    if (this.isDepositor()) return CONFIG.v5.demo.depositor.capK;
    const D = CONFIG.v5.demo, dep = false;
    const pool = dep ? CONFIG.v5.pools.depositor : F.freePoolSize(D.free.players + 1);
    const sum = (dep ? D.depositor : D.free).rateSum + this.ratePerHour();
    return Math.min(1, pool / (sum * 24));
  },
  // Geçen süre kadar üretim ve havuz payı ekle. Oyun kapalıyken en fazla 12 saat birikir.
  accrue(now = Date.now()) {
    const d = this.data;
    this.seasonCheck(now);
    const day = Math.floor(now / 86400000);
    // bedava oyuncu: bugünkü havuz payı gün dönünce sıfırlanır. Yatıran: kendi üretiminden açılan hak birikir (sezon sonuna kadar).
    if (d.poolDay !== day) { d.poolDay = day; if (!this.isDepositor()) d.poolAvail = 0; }
    if (!d.lastAccrue) { d.lastAccrue = now; return { produced: 0, pool: 0 }; }
    const secs = Math.max(0, Math.min((now - d.lastAccrue) / 1000, CONFIG.v5.offlineHours * 3600));
    d.lastAccrue = now;
    if (secs <= 0) return { produced: 0, pool: 0 };
    const produced = this.ratePerHour() * secs / 3600;
    d.uncollected += produced;
    let pool = 0;
    if (this.isDepositor()) {
      // USD ile: önce geri ödeme; ROI anında kalan üretim kazanca sayılır. pool = açılan hak (USD).
      const pUsd = this.prodUsd(produced);
      let earnUsd = pUsd;
      if (!d.roiAt) {
        const need = this.roiLeftUsd();
        d.prodUsdSinceDeposit = (d.prodUsdSinceDeposit || 0) + Math.min(pUsd, need);
        earnUsd = Math.max(0, pUsd - need);
        if (this.roiLeftUsd() <= 0) d.roiAt = now - (earnUsd / Math.max(1e-12, this.usdPerHour())) * 3600000;
      }
      if (this.atLifeCap()) pool = (d.seasonDepositedUsd || 0) * CONFIG.v5.depositor.afterCap * secs / 86400;
      else if (d.roiAt && earnUsd > 0) pool = earnUsd * this.depositorRate(now);
      d.poolUsd = (d.poolUsd || 0) + pool;
      this.clampPoolUsd();
    } else if (this.poolEligible(now)) { pool = this.poolPerDay() * secs / 86400; d.poolAvail += pool; }
    return { produced, pool };
  },
  claim() {
    this.accrue();
    const n = Math.floor(this.data.uncollected);
    if (n <= 0) return 0;
    this.data.uncollected -= n; this.data.balance += n;
    this.save(); this.emit({ type: 'claim', amount: n });
    return n;
  },
  tokens() { return this.data.balance || 0; },
  canAffordTokens(n) { return this.tokens() >= n; },
  // Faz 1 test modu: "demo token" yatırma. Canlıda cüzdandan transfer + zincir doğrulaması.
  deposit(n, now = Date.now()) {
    n = Math.max(0, Math.floor(n));
    if (!n) return 0;
    const d = this.data;
    const usd = n * this.price();      // yatırılanın USD değeri oracle fiyatıyla sabitlenir
    d.balance += n; d.depositBal += n; d.deposited += n; d.seasonDeposited += n;
    d.creditUsd = (d.creditUsd || 0) + usd; d.seasonDepositedUsd = (d.seasonDepositedUsd || 0) + usd;
    if (!d.firstDepositAt) d.firstDepositAt = now;
    d.roiAt = 0;                       // yeni yatırılan da önce üretimle geri ödenir
    this.save(); this.emit({ type: 'deposit', amount: n, usd });
    return n;
  },
  // Harcama: önce oyunda üretilen kısım, sonra yatırılan kısım
  spendTokens(n) {
    const d = this.data;
    if (d.balance < n) return false;
    const soft = Math.min(n, d.balance - d.depositBal);
    d.depositBal -= n - soft; d.balance -= n; d.spentDungeon += n;
    this.save(); this.emit({ type: 'tokenSpend', amount: n });
    return true;
  },
  // Çekilebilir hak (USD): anapara + açılan pay. Pay kısmı 2.2x tavanına kalan kadarla sınırlı
  // (tavandan sonra açılan %1'lik haklar ayrıca sayılır).
  withdrawableUsd() {
    const d = this.data, credit = d.creditUsd || 0, pool = d.poolUsd || 0, ref = d.refUsd || 0;
    if (!this.isDepositor() || this.atLifeCap()) return credit + ref + pool;
    const room = Math.max(0, this.lifeCapUsd() - (d.withdrawnUsdSeason || 0) - credit);
    return credit + ref + Math.min(pool, room);
  },
  // Davet kazancı (sunucudan, USD). Sezon tavanını aşan kısım yazılmaz. Bakiyeye DGN olarak eklenir.
  addReferral(usd) {
    const d = this.data, R = CONFIG.v5.referral;
    const give = Math.min(Math.max(0, +usd || 0), Math.max(0, R.seasonCapUsd - (d.refSeasonUsd || 0)));
    if (give < 0.0001) return 0;
    const dgn = give / this.price();
    d.balance += dgn; d.refUsd = (d.refUsd || 0) + give;
    d.refSeasonUsd = (d.refSeasonUsd || 0) + give; d.refTotalUsd = (d.refTotalUsd || 0) + give;
    this.save(); this.emit({ type: 'referral', usd: give, amount: dgn });
    return give;
  },
  // Tavana kadar olan pay, tavanı aşan kısım açılmaz (bakiyede oyun için kalır)
  clampPoolUsd() {
    const d = this.data;
    if (!this.isDepositor() || this.atLifeCap()) return;
    d.poolUsd = Math.min(d.poolUsd || 0, Math.max(0, this.lifeCapUsd() - (d.withdrawnUsdSeason || 0) - (d.creditUsd || 0)));
  },
  // Çekilebilir DGN: USD hak oracle fiyatıyla DGN'e çevrilir (+ bedava oyuncunun DGN havuz payı), en fazla bakiye kadar
  withdrawable() {
    const d = this.data;
    return Math.max(0, Math.floor(Math.min(d.balance, this.withdrawableUsd() / this.price() + (d.poolAvail || 0))));
  },
  // Son 24 saatteki kasaya aktarımlar (artan kesinti ve bekleme süresi için)
  recentMoves(now = Date.now()) {
    const W = CONFIG.v5.withdraw;
    const list = (this.data.vaultMoves || []).filter((t) => now - t < W.feeWindowHours * 3600000);
    this.data.vaultMoves = list;
    return list;
  },
  // Bir sonraki aktarımın kesinti oranı
  nextFee(now = Date.now()) {
    const F5 = CONFIG.v5.withdraw.fees;
    return F5[Math.min(this.recentMoves(now).length, F5.length - 1)];
  },
  // Kesinti oranının %5'e döneceği an (son 24 saatteki en eski aktarım + 24 saat)
  feeResetsAt(now = Date.now()) {
    const l = this.recentMoves(now);
    return l.length ? Math.max(...l) + CONFIG.v5.withdraw.feeWindowHours * 3600000 : 0;
  },
  // Bekleme bitene kadar kalan ms (0 = hazır)
  cooldownLeft(now = Date.now()) {
    const l = this.recentMoves(now);
    if (!l.length) return 0;
    return Math.max(0, Math.max(...l) + CONFIG.v5.withdraw.cooldownHours * 3600000 - now);
  },
  // 1. adım: oyundan kasaya (kesinti burada alınır)
  moveToVault(amount) {
    const d = this.data, W = CONFIG.v5.withdraw, now = Date.now();
    amount = Math.floor(amount);
    if (amount < W.min || amount > this.withdrawable()) return false;
    if (this.cooldownLeft(now) > 0) return false;
    const rate = this.nextFee(now), p = this.price();
    // önce anapara (USD), sonra yatıranın USD payı, en son bedava oyuncunun DGN havuz payı
    const fromCredit = Math.min((d.creditUsd || 0) / p, amount);
    d.creditUsd = Math.max(0, (d.creditUsd || 0) - fromCredit * p);
    let rest = amount - fromCredit;
    const fromRef = Math.min((d.refUsd || 0) / p, rest);          // davet kazancı (tavana sayılmaz)
    d.refUsd = Math.max(0, (d.refUsd || 0) - fromRef * p); rest -= fromRef;
    const fromPoolUsd = Math.min((d.poolUsd || 0) / p, rest);
    d.poolUsd = Math.max(0, (d.poolUsd || 0) - fromPoolUsd * p); rest -= fromPoolUsd;
    d.poolAvail = Math.max(0, (d.poolAvail || 0) - rest);
    d.withdrawnUsdSeason = (d.withdrawnUsdSeason || 0) + (amount - fromRef) * p;
    // çekilen anapara, paket almakta kullanılan "yatırılmış" kısımdan da düşer
    d.balance -= amount; d.depositBal = Math.min(Math.max(0, d.depositBal - fromCredit), d.balance);
    const fee = Math.ceil(amount * rate);
    d.feesToPool = (d.feesToPool || 0) + fee * W.feeToPool;   // kesinti ödül havuzuna döner
    d.vault += amount - fee;
    d.vaultMoves = [...this.recentMoves(now), now];
    this.save(); this.emit({ type: 'vault', amount, usd: amount * p, fee, rate });
    return { net: amount - fee, fee, rate };
  },
  // Cüzdan (Faz 1: simülasyon). Gerçekte bakiye ve geçmişi zincirden sunucu okur.
  walletAvg(now = Date.now()) { return F.avgHeld(this.data.walletHist, now, CONFIG.v5.withdraw.holdHours); },
  setWallet(bal, now = Date.now()) {
    const d = this.data, keep = now - (CONFIG.v5.withdraw.holdHours + 1) * 3600000;
    d.walletBal = Math.max(0, bal);
    // eski kayıtları at ama pencerenin başındaki bakiyeyi bilmek için pencere öncesinden son kaydı tut
    const h = (d.walletHist || []);
    const before = h.filter((x) => x.t <= keep).pop();
    d.walletHist = [...(before ? [before] : []), ...h.filter((x) => x.t > keep), { t: now, bal: d.walletBal }];
  },
  holdOk(now = Date.now()) { return this.walletAvg(now) >= CONFIG.v5.withdraw.holdTokens; },
  // 2. adım: kasadan cüzdana. Şart: cüzdanın son 12 saatteki ortalama bakiyesi 20K+ DGN (sunucu kontrol eder).
  // Faz 1'de gerçek cüzdan yok; test modunda (?dev=1) simüle edilir.
  sendToWallet(demoPass = false) {
    const d = this.data;
    if (d.vault <= 0) return { ok: false, reason: 'empty' };
    if (!demoPass) return { ok: false, reason: 'wallet' };
    if (!this.holdOk()) return { ok: false, reason: 'hold' };
    const n = Math.floor(d.vault);
    d.vault = 0; d.withdrawn += n;
    this.setWallet((d.walletBal || 0) + n);
    this.save(); this.emit({ type: 'withdraw', amount: n });
    return { ok: true, amount: n };
  },

  // ---- Anahtarlar ve dalga kapıları ----
  keyCount(id) { return (this.data.keys || {})[id] || 0; },
  keyPackPrice(k) { return F.keyPackTokens(k); },
  keySinglePrice(k) { return Math.round(this.keyPackPrice(k) / 10 * CONFIG.v5.singleKeyMult); },
  // Bu sezon o kademede kullanılmış anahtar (açılmış dalga) sayısı
  keysUsedInTier(k) { return Math.max(0, Math.min(10, (this.data.opened || 0) - k.from + 1)); },
  // Kademe başına en fazla 10 anahtar: elde duran + bu sezon kullanılan
  keyRoom(k) { return Math.max(0, 10 - this.keyCount(k.id) - this.keysUsedInTier(k)); },
  // Anahtar ancak o kademenin kapısına gelince alınabilir (ör. Silver için 30. dalga açılmış olmalı)
  keyUnlocked(k) { return Math.max(CONFIG.v5.freeMaxWave, this.data.opened || 0) >= k.from - 1; },
  // Paket: kalan hak kadar (en fazla 10), paket birim fiyatıyla; sadece yatırılan tokenle
  keyPackCount(k) { return this.keyUnlocked(k) ? Math.min(10, this.keyRoom(k)) : 0; },
  keyPackCost(k) { return Math.round(this.keyPackPrice(k) / 10 * this.keyPackCount(k)); },
  buyKeyPack(id) {
    const k = CONFIG.v5.keys.find((x) => x.id === id), d = this.data;
    const n = this.keyPackCount(k), price = this.keyPackCost(k);
    if (n <= 0 || d.depositBal < price) return false;
    d.balance -= price; d.depositBal -= price; d.spentDungeon += price;
    d.keys[id] = this.keyCount(id) + n;
    this.save(); this.emit({ type: 'keys', id });
    return n;
  },
  // Tek anahtar (sadece Bronze): her türlü bakiyeyle, pahalı
  buyKeySingle(id) {
    const k = CONFIG.v5.keys.find((x) => x.id === id);
    if (!k || !this.keyUnlocked(k) || this.keyRoom(k) <= 0 || !this.spendTokens(this.keySinglePrice(k))) return false;
    this.data.keys[id] = this.keyCount(id) + 1;
    this.save(); this.emit({ type: 'keys', id });
    return true;
  },
  // Dalgaya girilebilir mi? Gerekirse bir anahtar harcar. Dönüş: true | false
  enterWave(w) {
    const d = this.data;
    if (w <= Math.max(CONFIG.v5.freeMaxWave, d.opened || 0)) return true;
    if (w !== (d.opened || CONFIG.v5.freeMaxWave) + 1) return false;
    const k = F.keyTier(w);
    if (!k || this.keyCount(k.id) <= 0) return false;
    d.keys[k.id]--; d.opened = w;
    this.save(); this.emit({ type: 'keyUsed', id: k.id, wave: w });
    return true;
  },
  // Kapıda takılınca döngüye dönülecek dalga
  loopWave(w) {
    return w - 1 <= CONFIG.v5.freeMaxWave ? CONFIG.v5.freeLoopTo : Math.max(CONFIG.v5.freeLoopTo, w - CONFIG.v5.loopBack);
  },

  // ---- Forge ----
  forgeCost() { return F.forgeCost(this.data.forge || 0); },
  buyForge() {
    if ((this.data.forge || 0) >= CONFIG.v5.forge.max || !this.spendTokens(this.forgeCost())) return false;
    this.data.forge = (this.data.forge || 0) + 1;
    this.save(); this.emit({ type: 'forge' });
    return true;
  },

  // ---- Sezon ----
  // 10 günde bir: dalga, gold, seviye, geliştirmeler, Forge ve oyunda biriken üretim sıfırlanır.
  // Kalır: kullanılmamış anahtarlar, çekilmemiş anapara hakkı (bakiyede), kasadaki token, ayarlar.
  seasonCheck(now = Date.now()) {
    const idx = F.seasonIndex(now), d = this.data;
    if (d.season === null || d.season === undefined) { d.season = idx; return false; }
    if (d.season === idx) return false;
    const keep = { settings: d.settings, clanBonus: d.clanBonus, keys: d.keys, vault: d.vault, deposited: d.deposited,
      withdrawn: d.withdrawn, spentDungeon: d.spentDungeon, feesBurned: d.feesBurned, feesToPool: d.feesToPool, selectedHero: d.selectedHero,
      refTotalUsd: d.refTotalUsd };
    // çekilmemiş anapara hakkı (USD) yeni sezona geçer; bakiyede onun DGN karşılığı kalır
    const credUsd = d.creditUsd || 0, refUsd = d.refUsd || 0, p0 = this.price();
    const bal = Math.min(d.balance, (credUsd + refUsd) / p0), depBal = Math.min(d.depositBal, bal);
    keep.refUsd = Math.min(refUsd, bal * p0); keep.creditUsd = Math.max(0, bal * p0 - keep.refUsd);
    this.data = freshSave();
    Object.assign(this.data, keep, { season: idx, balance: bal, depositBal: depBal, lastAccrue: now });
    this.seasonReset = true;
    this.save(); this.emit({ type: 'season' });
    return true;
  },

  // Aktif oyunda toplanan gold'u kaydet (sadece düşmanlardan gelen). tickActive oyun zamanıyla çağrılır.
  noteActiveGold(n) { this._accG = (this._accG || 0) + n / this.goldMult(); },
  tickActive(dt) {
    this._accT = (this._accT || 0) + dt;
    if (this._accT < 60) return;              // dakikada bir örnek al
    const sample = (this._accG || 0) / this._accT;
    const r = this.data.activeRate || 0;
    this.data.activeRate = r > 0 ? r * 0.8 + sample * 0.2 : sample;
    this._accT = 0; this._accG = 0;
  },

  goldRushActive(now = Date.now()) { return (this.data.goldRushUntil || 0) > now; },
  goldRushLeft(now = Date.now()) { return Math.max(0, (this.data.goldRushUntil || 0) - now); },
  goldMult(now = Date.now()) { return this.goldRushActive(now) ? CONFIG.tokenShop.goldRush.mult : 1; },

  // Token mağazası satın alımı. Dönen değer: false ya da { item, ...detay }
  buyShopItem(id) {
    const it = CONFIG.tokenShop[id];
    if (!it || id === 'revive') return false;
    if (id === 'idlePass' && this.data.idlePass) return false;
    if (!this.spendTokens(it.price)) return false;
    const res = { item: id };
    if (id === 'timeSkip') {
      // AFK oranıyla 2 saatlik kazanç (Gold Rush varsa o da geçerli)
      const gold = Math.floor(F.offlineGoldPerSec(this.data) * it.hours * 3600 * this.goldMult());
      res.gold = this.addGold(gold);
    } else if (id === 'goldRush') {
      const now = Date.now();
      this.data.goldRushUntil = Math.max(now, this.data.goldRushUntil || 0) + it.hours * 3600 * 1000;
    } else if (id === 'idlePass') {
      this.data.idlePass = true;
    } else if (id === 'tome') {
      this.data.tomes = (this.data.tomes || 0) + 1;
    }
    this.save(); this.emit({ type: 'gemItem', id });
    return res;
  },

  // Öldüğün dalgadan devam et (bir alt değil)
  revive(deathWave) {
    if (!this.spendTokens(CONFIG.tokenShop.revive.price)) return false;
    this.data.resumeWave = Math.max(1, Math.min(CONFIG.wave.maxWave, deathWave));
    this.save(); this.emit({ type: 'revive', wave: deathWave });
    return true;
  },

  // Boss ilk yeniliş ödülü (Skill Tome). Ödül verildiyse { tomes } döner.
  bossFirstKill(w) {
    const list = this.data.bossesBeaten || (this.data.bossesBeaten = []);
    if (list.includes(w)) return null;
    list.push(w);
    const { tomes } = F.bossReward(w);
    this.data.tomes = (this.data.tomes || 0) + tomes;
    this.save(); this.emit({ type: 'tomes', amount: tomes });
    return { tomes };
  },

  spendGold(n) {
    if (this.data.gold < n) return false;
    this.data.gold -= n;
    this.emit({ type: 'spend', amount: n });
    this.save();
    return true;
  },

  addXp(n) {
    this.data.xp += n;
    let leveled = 0;
    while (this.data.xp >= F.xpToNext(this.data.level)) {
      this.data.xp -= F.xpToNext(this.data.level);
      this.data.level++;
      this.data.skillPoints += CONFIG.account.skillPointsPerLevel;
      leveled++;
    }
    this.emit({ type: 'xp', leveled });
    return leveled;
  },

  // ---- Geliştirmeler ----
  upgradeLevel(heroId, key) { return this.data.heroes[heroId].upgrades[key] || 0; },
  upgradeCost(heroId, key) { return F.upgradeCost(key, this.upgradeLevel(heroId, key)); },
  upgradeMaxed(heroId, key) {
    const m = CONFIG.upgrades[key].max;
    return m !== undefined && this.upgradeLevel(heroId, key) >= m;
  },
  buyUpgrade(heroId, key) {
    if (this.upgradeMaxed(heroId, key)) return false;
    const cost = this.upgradeCost(heroId, key);
    if (!this.spendGold(cost)) return false;
    this.data.heroes[heroId].upgrades[key]++;
    this.save(); this.emit({ type: 'upgrade', heroId, key });
    return true;
  },

  // ---- Yetenekler ----
  skillLevel(heroId, i) { return this.data.heroes[heroId].skills[i]; },
  skillCost(heroId, i) { return F.skillCost(this.skillLevel(heroId, i)); },
  // bir sonraki seviye Skill Tome istiyor mu (Lv5 → Lv6 ve sonrası)
  skillTomes(heroId, i) { return F.skillTomes(this.skillLevel(heroId, i)); },
  buySkill(heroId, i) {
    const lvl = this.skillLevel(heroId, i);
    if (lvl >= CONFIG.skillUpgrade.maxLevel) return false;
    if (this.data.skillPoints < CONFIG.skillUpgrade.pointCost) return false;
    const tome = F.skillTomes(lvl);
    if ((this.data.tomes || 0) < tome) return false;
    const cost = F.skillCost(lvl);
    if (!this.spendGold(cost)) return false;
    this.data.tomes -= tome;
    this.data.skillPoints -= CONFIG.skillUpgrade.pointCost;
    this.data.heroes[heroId].skills[i]++;
    this.save(); this.emit({ type: 'skill', heroId, i });
    return true;
  },

  // Boss sandığı kutsaması: { id, left } — kalan dalga sayısı. Kalıcı değildir, sıfırlamada silinir.
  // Her boss'un sandığı bir kez düşer (tekrar yenince düşmez; sıfırlamada da geri gelmez).
  chestAvailable(w) { return !(this.data.chestsTaken || []).includes(w); },
  takeChest(w) {
    const l = this.data.chestsTaken || (this.data.chestsTaken = []);
    if (!l.includes(w)) l.push(w);
  },
  grantBlessing() {
    const list = CONFIG.bossChest.blessings;
    const b = list[Math.floor(Math.random() * list.length)];
    this.data.blessing = { id: b.id, left: CONFIG.bossChest.blessWaves - 1 };
    this.save();
    return b;
  },
  // Her yeni dalgada bir azalır; bittiyse true döner.
  tickBlessing() {
    const b = this.data.blessing;
    if (!b) return false;
    if (--b.left >= 0) return false;
    this.data.blessing = null;
    return true;
  },

  recordWave(w) {
    if (w > this.data.bestWave) this.data.bestWave = w;
    // üretim sadece bu sezon açılmış dalgalara kadar sayılır (sezon devrinde eski dalga yeni sezona taşınmasın)
    const sw = Math.min(w, Math.max(CONFIG.v5.freeMaxWave, this.data.opened || 0));
    if (sw > (this.data.seasonBest || 0)) { this.data.seasonBest = sw; this.emit({ type: 'bestWave', wave: sw }); }
    // çıkıp girince kaldığın dalgadan devam et
    if (w >= 1 && w < CONFIG.wave.maxWave) this.data.resumeWave = Math.min(w + 1, this.resumeCap());

  },

  // öldüğün dalganın bir altından devam et (10'da öldüysen 9)
  setResumeAfterDeath(deathWave) {
    this.data.resumeWave = Math.max(1, deathWave - CONFIG.respawnWavesBack);
  },

  // Devam edilebilecek en yüksek dalga: açılmış son dalga; sıradaki dalga için anahtar varsa bir fazlası
  resumeCap() {
    const opened = Math.max(CONFIG.v5.freeMaxWave, this.data.opened || 0);
    const next = F.keyTier(opened + 1);
    return opened + (next && this.keyCount(next.id) > 0 ? 1 : 0);
  },
  startWave() {
    return Math.max(1, Math.min(CONFIG.wave.maxWave, this.resumeCap(), this.data.resumeWave || 1));
  },
};
