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
    gold: 0,
    level: 1,
    xp: 0,
    skillPoints: 0,
    bestWave: 0,
    resumeWave: 1,       // bir sonraki koşunun başlayacağı dalga
    wins: 0,
    totalKills: 0,
    selectedHero: 'warrior',
    heroes: { warrior: freshHero(), lion: freshHero() },
    settings: { auto: true, speed: 1, sound: true, music: true },
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
        // eski kayıttaki 3x hız artık yok
        if (![1, 1.5, 2, 2.5].includes(this.data.settings.speed)) this.data.settings.speed = 1;
        // eski kayıt: checkpoint'ten devam dalgasına geçiş
        if (d.resumeWave === undefined && d.checkpointWave) this.data.resumeWave = d.checkpointWave;
        for (const h of Object.keys(CONFIG.heroes)) {
          const fh = freshHero();
          this.data.heroes[h] = { ...fh, ...this.data.heroes[h], upgrades: { ...fh.upgrades, ...(this.data.heroes[h]?.upgrades || {}) } };
        }
      }
    } catch (e) { console.warn('Could not read save', e); }
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* tarayıcı depolamaya izin vermiyor */ }
  },

  reset() { this.data = freshSave(); this.save(); this.emit(); },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(evt = {}) { for (const fn of listeners) fn(this.data, evt); },

  addGold(n) {
    n = Math.max(0, Math.round(n));
    this.data.gold += n;
    this.emit({ type: 'gold', amount: n });
    return n;
  },

  canAfford(n) { return this.data.gold >= n; },

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
  buySkill(heroId, i) {
    const lvl = this.skillLevel(heroId, i);
    if (lvl >= CONFIG.skillUpgrade.maxLevel) return false;
    if (this.data.skillPoints < CONFIG.skillUpgrade.pointCost) return false;
    const cost = F.skillCost(lvl);
    if (!this.spendGold(cost)) return false;
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
