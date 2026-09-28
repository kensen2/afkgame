// =====================================================================
//  EKONOMİ + KAYIT
//  Gold, XP, hesap seviyesi, geliştirmeler ve karakter sahipliği burada.
//  İleride kripto (Solana) entegrasyonu yapılacağında sadece bu modül
//  değişecek: load()/save() zincirden okuyup yazabilir, spendGold() bir
//  işlem (transaction) olabilir. Oyunun geri kalanı bu API'yi kullanır.
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
    econVer: 3,          // ekonomi sürümü (değişince eski ilerleme sıfırlanır)
    gold: 0,
    gems: 0,             // değerli para (ileride Solana yatırımıyla); paraya çevrilemez
    tomes: 0,            // Skill Tome envanteri (yetenek Lv6+ için)
    bossesBeaten: [],    // ilk kez yenilen boss dalgaları (ilk yeniliş ödülü için)
    goldRushUntil: 0,    // Gold Rush bitiş zamanı (ms)
    idlePass: false,     // kalıcı Idle Pass
    gemsSpent: 0,
    activeRate: 0,       // son aktif oyundaki ortalama gold/sn (Gold Rush hariç); AFK ve Time Skip bunu kullanır
    level: 1,
    xp: 0,
    skillPoints: 0,
    bestWave: 0,
    resumeWave: 1,       // bir sonraki koşunun başlayacağı dalga
    wins: 0,
    totalKills: 0,
    selectedHero: 'warrior',
    heroes: { warrior: freshHero(), lion: freshHero() },
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
        // Ekonomi sürümü değişince (v3: Gems + yeni maliyet eğrisi) eski ilerleme
        // yeni dengeyle uyumsuz; bir kereliğine sıfırlanır (ayarlar korunur)
        if ((d.econVer || 1) < 3) {
          const settings = this.data.settings;
          this.data = freshSave();
          this.data.settings = settings;
          this.economyReset = true;
        }
      }
    } catch (e) { console.warn('Could not read save', e); }
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
    const gold = Math.floor(F.offlineGoldPerSec(this.data) * (secs + rushSecs * (CONFIG.gemShop.goldRush.mult - 1)));
    if (gold <= 0) return null;
    this.addGold(gold);
    this.data.offlineTotal = (this.data.offlineTotal || 0) + gold;
    this.save();
    return { away, secs, gold, capped: away > secs, maxHours: F.offlineMaxHours(this.data), wave: Math.max(1, this.data.resumeWave || 1), hero: this.data.selectedHero };
  },

  // İlerlemeyi sıfırla; ses/hız gibi ayarlar korunur
  reset() { const settings = this.data.settings; this.data = freshSave(); this.data.settings = settings; this.save(); this.emit(); },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(evt = {}) { for (const fn of listeners) fn(this.data, evt); },

  addGold(n) {
    n = Math.max(0, Math.round(n));
    this.data.gold += n;
    this.emit({ type: 'gold', amount: n });
    return n;
  },

  canAfford(n) { return this.data.gold >= n; },

  // ---- Gems ----
  // Faz 1: sadece istemci. Gerçek yatırım (Solana) Faz 3'te sunucu doğrulamasıyla gelecek.
  addGems(n, reason = '') {
    n = Math.max(0, Math.round(n));
    this.data.gems += n;
    this.save(); this.emit({ type: 'gems', amount: n, reason });
    return n;
  },
  canAffordGems(n) { return this.data.gems >= n; },
  spendGems(n) {
    if (this.data.gems < n) return false;
    this.data.gems -= n;
    this.data.gemsSpent = (this.data.gemsSpent || 0) + n;
    this.save(); this.emit({ type: 'gemSpend', amount: n });
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
  goldMult(now = Date.now()) { return this.goldRushActive(now) ? CONFIG.gemShop.goldRush.mult : 1; },

  // Gems mağazası satın alımı. Dönen değer: false ya da { item, ...detay }
  buyGemItem(id) {
    const it = CONFIG.gemShop[id];
    if (!it || id === 'revive') return false;
    if (id === 'idlePass' && this.data.idlePass) return false;
    if (!this.spendGems(it.price)) return false;
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
    if (!this.spendGems(CONFIG.gemShop.revive.price)) return false;
    this.data.resumeWave = Math.max(1, Math.min(CONFIG.wave.maxWave, deathWave));
    this.save();
    return true;
  },

  // Boss ilk yeniliş ödülü. Ödül verildiyse { gems, tomes } döner.
  bossFirstKill(w) {
    const list = this.data.bossesBeaten || (this.data.bossesBeaten = []);
    if (list.includes(w)) return null;
    list.push(w);
    const G = CONFIG.gems;
    let gems = G.bossFirstKill;
    if (w === CONFIG.wave.maxWave) gems += G.finalBossBonus;
    this.data.tomes = (this.data.tomes || 0) + G.bossFirstTome;
    this.addGems(gems, 'boss');
    return { gems, tomes: G.bossFirstTome };
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
  skillNeedsTome(heroId, i) { return this.skillLevel(heroId, i) + 1 >= CONFIG.skillUpgrade.tomeFrom; },
  buySkill(heroId, i) {
    const lvl = this.skillLevel(heroId, i);
    if (lvl >= CONFIG.skillUpgrade.maxLevel) return false;
    if (this.data.skillPoints < CONFIG.skillUpgrade.pointCost) return false;
    const tome = this.skillNeedsTome(heroId, i);
    if (tome && (this.data.tomes || 0) < 1) return false;
    const cost = F.skillCost(lvl);
    if (!this.spendGold(cost)) return false;
    if (tome) this.data.tomes--;
    this.data.skillPoints -= CONFIG.skillUpgrade.pointCost;
    this.data.heroes[heroId].skills[i]++;
    this.save(); this.emit({ type: 'skill', heroId, i });
    return true;
  },

  recordWave(w) {
    if (w > this.data.bestWave) this.data.bestWave = w;

  },

  // öldüğün dalganın bir altından devam et (10'da öldüysen 9)
  setResumeAfterDeath(deathWave) {
    this.data.resumeWave = Math.max(1, deathWave - CONFIG.respawnWavesBack);
  },

  startWave() {
    return Math.max(1, Math.min(CONFIG.wave.maxWave, this.data.resumeWave || 1));
  },
};
