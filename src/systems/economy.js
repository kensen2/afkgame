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
    credit: 0,           // anapara hakkı: yatırdığın kadar, günlük sınıra takılmadan çekilebilir
    poolAvail: 0,        // bugün havuzdan çekilebilir (günlük pay, gün dönünce sıfırlanır)
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
    settings: { auto: true, speed: 1, sound: true, music: true, musicVol: 0.1, sfxVol: 0.1, audioVer: 2, offline: true },
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
        if (![1, 1.5, 2, 2.5].includes(this.data.settings.speed)) this.data.settings.speed = 1;
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
      'deposited', 'withdrawn', 'spentDungeon', 'feesBurned', 'seasonDeposited', 'firstDepositAt', 'keys', 'opened',
      'seasonBest', 'lastAccrue', 'idlePass', 'clanBonus',
      // DGN ile alınanlar da kalır: Forge, Gold Rush, Skill Tome. Tome ile birlikte "yenilmiş boss" listesi de
      // kalır; yoksa sıfırlayıp boss'ları tekrar yenerek bedava Tome toplanabilirdi.
      'forge', 'goldRushUntil', 'tomes', 'bossesBeaten', 'chestsTaken']) keep[k] = d[k];
    this.data = freshSave();
    Object.assign(this.data, keep);
    this.save(); this.emit();
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
  poolEligible(now = Date.now()) {
    if (!this.isDepositor()) return true;
    return now >= (this.data.firstDepositAt || now) + CONFIG.v5.depositorPoolDelayHours * 3600000;
  },
  poolStartsAt() { return (this.data.firstDepositAt || 0) + CONFIG.v5.depositorPoolDelayHours * 3600000; },
  // Üretim: sezonun en iyi dalgası × (1 + clan bonusu). Bonus ilk 5 clana girince hemen başlar.
  baseRatePerHour() { return F.rateAt(this.data.seasonBest || 0); },
  ratePerHour() { return this.baseRatePerHour() * (1 + (this.rateBonus || 0)); },
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
    const D = CONFIG.v5.demo, dep = this.isDepositor();
    const pool = dep ? CONFIG.v5.pools.depositor : F.freePoolSize(D.free.players + 1);
    return F.poolShare(pool, this.ratePerHour(), (dep ? D.depositor : D.free).rateSum);
  },
  realmFill() {
    const D = CONFIG.v5.demo, dep = this.isDepositor();
    const pool = dep ? CONFIG.v5.pools.depositor : F.freePoolSize(D.free.players + 1);
    const sum = (dep ? D.depositor : D.free).rateSum + this.ratePerHour();
    return Math.min(1, pool / (sum * 24));
  },
  // Geçen süre kadar üretim ve havuz payı ekle. Oyun kapalıyken en fazla 12 saat birikir.
  accrue(now = Date.now()) {
    const d = this.data;
    this.seasonCheck(now);
    const day = Math.floor(now / 86400000);
    if (d.poolDay !== day) { d.poolDay = day; d.poolAvail = 0; }
    if (!d.lastAccrue) { d.lastAccrue = now; return { produced: 0, pool: 0 }; }
    const secs = Math.max(0, Math.min((now - d.lastAccrue) / 1000, CONFIG.v5.offlineHours * 3600));
    d.lastAccrue = now;
    if (secs <= 0) return { produced: 0, pool: 0 };
    const produced = this.ratePerHour() * secs / 3600;
    d.uncollected += produced;
    let pool = 0;
    if (this.poolEligible(now)) { pool = this.poolPerDay() * secs / 86400; d.poolAvail += pool; }
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
    d.balance += n; d.depositBal += n; d.credit += n; d.deposited += n; d.seasonDeposited += n;
    if (!d.firstDepositAt) d.firstDepositAt = now;
    this.save(); this.emit({ type: 'deposit', amount: n });
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
  // Çekilebilir: bakiye içinden, anapara hakkı + bugünkü havuz payı kadar
  withdrawable() {
    const d = this.data;
    return Math.max(0, Math.floor(Math.min(d.balance, d.credit + d.poolAvail)));
  },
  // 1. adım: oyundan kasaya (%5 komisyon burada kesilir)
  moveToVault(amount) {
    const d = this.data, W = CONFIG.v5.withdraw;
    amount = Math.floor(amount);
    if (amount < W.min || amount > this.withdrawable()) return false;
    const fromCredit = Math.min(d.credit, amount);
    d.credit -= fromCredit; d.poolAvail = Math.max(0, d.poolAvail - (amount - fromCredit));
    // çekilen anapara, paket almakta kullanılan "yatırılmış" kısımdan da düşer
    d.balance -= amount; d.depositBal = Math.min(Math.max(0, d.depositBal - fromCredit), d.balance);
    const fee = Math.ceil(amount * W.fee);
    d.feesBurned += fee * W.feeBurn;
    d.vault += amount - fee;
    this.save(); this.emit({ type: 'vault', amount });
    return { net: amount - fee, fee };
  },
  // 2. adım: kasadan cüzdana. Şart: cüzdanda 12 saattir kesintisiz 20K+ DGN (sunucu kontrol eder).
  // Faz 1'de cüzdan bağlantısı yok; test modunda (?dev=1) simüle edilir.
  sendToWallet(demoPass = false) {
    const d = this.data;
    if (d.vault <= 0) return { ok: false, reason: 'empty' };
    if (!demoPass) return { ok: false, reason: 'wallet' };
    const n = Math.floor(d.vault);
    d.vault = 0; d.withdrawn += n;
    this.save(); this.emit({ type: 'withdraw', amount: n });
    return { ok: true, amount: n };
  },

  // ---- Anahtarlar ve dalga kapıları ----
  keyCount(id) { return (this.data.keys || {})[id] || 0; },
  keyPackPrice(k) { return F.keyPackTokens(k); },
  keySinglePrice(k) { return F.tokensForUsd(k.singleUsd); },
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
    if (!k?.singleUsd || !this.keyUnlocked(k) || this.keyRoom(k) <= 0 || !this.spendTokens(this.keySinglePrice(k))) return false;
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
    const keep = { settings: d.settings, clanBonus: d.clanBonus, keys: d.keys, credit: d.credit, vault: d.vault, deposited: d.deposited,
      withdrawn: d.withdrawn, spentDungeon: d.spentDungeon, feesBurned: d.feesBurned, selectedHero: d.selectedHero };
    const bal = Math.min(d.balance, d.credit), depBal = Math.min(d.depositBal, bal);
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
    this.save();
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
    if (sw > (this.data.seasonBest || 0)) this.data.seasonBest = sw;
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
