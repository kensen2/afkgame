// Denge simülasyonu modeli (analitik, oyun zamanı 1x hızda).
// simulate(heroId, { payer, ovr }) → { marks: {10: dk, 20: dk, ...}, gems, level, deaths }
//
// Varsayımlar:
//  - Oyuncu her ölümden sonra gold'unu en ucuz geliştirmelere ve yeteneklere harcar.
//  - Her ölümde ~10 sn kayıp (geri sayım / "Start Now").
//  - Bedava oyuncu: sadece aktif oyun süresi sayılır, AFK kazancı yok sayılır (temkinli).
//  - Harcayan (payer, ≈$10): Idle Pass var, her 2 saat oyunda 1 Time Skip, her 24 saatte 1 Gold Rush
//    (yani oynadığı sürece altın ×2). Skill Tome'ları sadece boss'lardan alır.
import { CONFIG, F } from '../src/config.js';

const SNAP = structuredClone(CONFIG);
function resetConfig() { for (const k of Object.keys(SNAP)) CONFIG[k] = structuredClone(SNAP[k]); }
function merge(t, o) { for (const k in o) { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { t[k] = t[k] || {}; merge(t[k], o[k]); } else t[k] = o[k]; } }

export function simulate(heroId = 'warrior', { payer = false, ovr = null, log = null, maxHours = 400 } = {}) {
  resetConfig();
  if (ovr) merge(CONFIG, ovr);
  const G = CONFIG.gemShop;
  const save = {
    gold: 0, level: 1, xp: 0, skillPoints: 0, resumeWave: 1, selectedHero: heroId,
    idlePass: payer, activeRate: 0, tomes: 0, gems: 0, bosses: new Set(),
    heroes: { warrior: { upgrades: {}, skills: [1, 1, 1] }, lion: { upgrades: {}, skills: [1, 1, 1] } },
  };
  for (const h of Object.values(save.heroes)) for (const k of Object.keys(CONFIG.upgrades)) h.upgrades[k] = 0;
  const hero = save.heroes[heroId];
  let gemsSpent = payer ? G.idlePass.price : 0;
  const rush = payer ? G.goldRush.mult : 1;

  function waveEnemies(w) {
    const pool = Object.entries(CONFIG.enemies).filter(([, d]) => d.unlock <= w);
    const tw = pool.reduce((s, [, d]) => s + d.weight, 0);
    const avg = (key) => pool.reduce((s, [, d]) => s + d[key] * d.weight, 0) / tw;
    const avgDps = pool.reduce((s, [, d]) => s + (d.dmg / d.atkCd) * d.weight, 0) / tw;
    let n = F.waveCount(w), hp = 0, dps = 0, gold = 0, xp = 0;
    if (F.isBoss(w)) {
      const final = w === CONFIG.wave.maxWave && CONFIG.finalBoss;
      const b = final ? CONFIG.finalBoss : CONFIG.bosses[(w / CONFIG.wave.bossEvery - 1) % CONFIG.bosses.length];
      const d = CONFIG.enemies[b.type];
      const adds = final ? 6 : Math.min(6, 2 + Math.floor(w / 15));
      hp = F.enemyHp(d.hp, w) * CONFIG.boss.hp * (b.hpMult || 1) * F.bossHpScale(w) + adds * F.enemyHp(avg('hp'), w);
      dps = F.enemyDmg(d.dmg / d.atkCd, w) * CONFIG.boss.dmg * 0.8 + adds * F.enemyDmg(avgDps, w);
      gold = F.enemyGold(d.gold, w) * CONFIG.boss.gold + adds * F.enemyGold(avg('gold'), w);
      xp = F.enemyXp(d.xp, w) * CONFIG.boss.xp + adds * F.enemyXp(avg('xp'), w);
      n = adds + 1;
    } else {
      const elites = F.isElite(w) ? 1 + Math.floor(w / 20) : 0;
      hp = F.enemyHp(avg('hp'), w) * (n + elites * (CONFIG.elite.hp - 1));
      dps = F.enemyDmg(avgDps, w) * (n + elites * (CONFIG.elite.dmg - 1));
      gold = F.enemyGold(avg('gold'), w) * (n + elites * (CONFIG.elite.gold - 1));
      xp = F.enemyXp(avg('xp'), w) * (n + elites * (CONFIG.elite.xp - 1));
    }
    return { n, hp, dps, gold, xp };
  }

  function levelUp(xp) {
    save.xp += xp;
    while (save.xp >= F.xpToNext(save.level)) { save.xp -= F.xpToNext(save.level); save.level++; save.skillPoints++; }
  }

  function shop() {
    const keys = ['atk', 'hp', 'armor', 'atkSpd', 'crit', 'regen'];
    for (;;) {
      let best = null, bc = Infinity;
      for (const k of keys) {
        const u = CONFIG.upgrades[k];
        if (u.max !== undefined && hero.upgrades[k] >= u.max) continue;
        const c = F.upgradeCost(k, hero.upgrades[k]) * (k === 'atk' || k === 'hp' ? 1 : 1.3);
        if (c < bc) { bc = c; best = k; }
      }
      if (!best) break;
      const real = F.upgradeCost(best, hero.upgrades[best]);
      if (save.gold < real) break;
      save.gold -= real; hero.upgrades[best]++;
    }
    for (let i = 0; i < 3; i++) {
      for (;;) {
        const l = hero.skills[i];
        if (save.skillPoints < 1 || l >= CONFIG.skillUpgrade.maxLevel || save.gold < F.skillCost(l)) break;
        const tome = l + 1 >= CONFIG.skillUpgrade.tomeFrom;
        if (tome && save.tomes < 1) break;
        if (tome) save.tomes--;
        save.gold -= F.skillCost(l); save.skillPoints--; hero.skills[i]++;
      }
    }
  }

  // Tek sürekli döngü: oyuncu her dalgadan sonra dükkana uğrar (oyunda dükkan oyunu durdurur).
  // Ölünce ~10 sn kaybeder ve bir alt dalgadan devam eder.
  let total = 0, nextSkip = 7200, deaths = 0, waves = 0, fight = 0, maxFight = 0;
  const marks = {};
  let st, heroDps;
  const refresh = () => {
    st = F.heroStats(heroId, save);
    const avgSkill = hero.skills.reduce((s, l) => s + (1 + (l - 1) * CONFIG.skillUpgrade.powerPer), 0) / 3;
    heroDps = st.atk * st.atkSpd * (1 + st.crit * (st.critDmg - 1)) * (1 + 0.35 * avgSkill);
  };
  refresh();
  let hp = st.maxHp, w = 1;
  while (total < maxHours * 3600 && w <= CONFIG.wave.maxWave) {
    const e = waveEnemies(w);
    const tKill = e.hp / heroDps;
    const engaged = Math.min(1, 3.5 / e.n);
    const taken = e.dps * F.armorMult(st.armor) * tKill * 0.55 * Math.max(engaged, 0.45) * (heroId === 'warrior' ? 0.8 : 1);
    const net = taken - st.maxHp * st.regen * tKill;
    fight += tKill; maxFight = Math.max(maxFight, tKill);
    const t0 = total, g0 = save.gold;
    total += tKill + CONFIG.wave.walkDistance / (st.speed * 0.8) + 2;
    waves++;
    if (hp - net <= 0) {
      const frac = Math.max(0, hp / net) * 0.8;
      total -= tKill * (1 - Math.max(0, hp / net));   // ölünce savaş erken biter
      save.gold += e.gold * st.goldMult * rush * frac; levelUp(e.xp * frac);
      deaths++; total += 10;
      w = Math.max(1, w - CONFIG.respawnWavesBack);
      hp = Infinity;
    } else {
      hp -= net;
      save.gold += e.gold * st.goldMult * rush;
      levelUp(e.xp);
      if (F.isBoss(w) && !save.bosses.has(w)) {
        save.bosses.add(w); save.tomes += CONFIG.gems.bossFirstTome;
        save.gems += CONFIG.gems.bossFirstKill + (w === CONFIG.wave.maxWave ? CONFIG.gems.finalBossBonus : 0);
      }
      hp += st.maxHp * 0.15;
      if (marks[w] === undefined && [10, 20, 30, 50, 75, 100].includes(w)) marks[w] = Math.round(total / 60);
      if (log && w % 5 === 0) log(waves, { reached: w }, total, save);
      w++;
    }
    save.resumeWave = w;
    // oyundaki activeRate'in karşılığı: ~5 dk'lık hareketli ortalama (Gold Rush hariç)
    { const dt = total - t0, rate = (save.gold - g0) / rush / Math.max(1e-6, dt), a = Math.min(1, dt / 300);
      save.activeRate = save.activeRate > 0 ? save.activeRate + (rate - save.activeRate) * a : rate; }
    // payer: oynadığı her 2 saatte bir Time Skip (Idle Pass oranıyla 2 saatlik AFK altını, Gold Rush dahil)
    while (payer && total >= nextSkip) {
      save.gold += F.offlineGoldPerSec(save) * G.timeSkip.hours * 3600 * rush;
      gemsSpent += G.timeSkip.price; nextSkip += 7200;
    }
    const frac = Math.min(1, hp / st.maxHp);
    shop(); refresh();
    hp = st.maxHp * frac;
  }
  if (payer) gemsSpent += Math.ceil(total / 86400) * G.goldRush.price;
  return { marks, level: save.level, deaths, waves, avgFight: fight / Math.max(1, waves), maxFight, gemsEarned: save.gems, gemsSpent, usd: gemsSpent / CONFIG.gems.usdcRate, upgrades: hero.upgrades, skills: hero.skills };
}

export const TARGETS = {
  free:  { 10: 5, 20: 40, 30: 120, 50: 720, 75: 2100, 100: 4800 },
  payer: { 10: 5, 20: 40, 30: 90,  50: 300, 75: 840,  100: 1800 },
};
