// Denge simülasyonu: node sim/balance.mjs [warrior|lion]
// Oyuncunun her ölümden sonra gold'unu en ucuz geliştirmelere harcadığını varsayar
// ve 50 dalgaya kadar ilerleme eğrisini yazdırır.
import { CONFIG, F } from '../src/config.js';

const heroId = process.argv[2] || 'warrior';
const save = {
  gold: 0, level: 1, xp: 0, skillPoints: 0, resumeWave: 1,
  heroes: { warrior: { upgrades: {}, skills: [1, 1, 1] }, lion: { upgrades: {}, skills: [1, 1, 1] } },
};
for (const h of Object.values(save.heroes)) for (const k of Object.keys(CONFIG.upgrades)) h.upgrades[k] = 0;

function waveEnemies(w) {
  // buildWave ile aynı dağılımın ortalaması
  const pool = Object.entries(CONFIG.enemies).filter(([, d]) => d.unlock <= w);
  const tw = pool.reduce((s, [, d]) => s + d.weight, 0);
  const avg = (key) => pool.reduce((s, [, d]) => s + d[key] * d.weight, 0) / tw;
  const avgDps = pool.reduce((s, [, d]) => s + (d.dmg / d.atkCd) * d.weight, 0) / tw;
  let n = F.waveCount(w), hp = 0, dps = 0, gold = 0, xp = 0;
  if (F.isBoss(w)) {
    const b = CONFIG.bosses[(w / CONFIG.wave.bossEvery - 1) % CONFIG.bosses.length];
    const d = CONFIG.enemies[b.type];
    const adds = Math.min(6, 2 + Math.floor(w / 15));
    hp = F.enemyHp(d.hp, w) * CONFIG.boss.hp + adds * F.enemyHp(avg('hp'), w);
    dps = F.enemyDmg(d.dmg / d.atkCd, w) * CONFIG.boss.dmg * 0.8 + adds * F.enemyDmg(avgDps, w);
    gold = F.enemyGold(d.gold, w) * CONFIG.boss.gold + adds * F.enemyGold(avg('gold'), w);
    xp = F.enemyXp(d.xp, w) * CONFIG.boss.xp + adds * F.enemyXp(avg('xp'), w);
    n = adds + 1;
  } else {
    const elites = F.isElite(w) ? 1 + Math.floor(w / 20) : 0;
    const m = n + elites * (CONFIG.elite.hp - 1);
    hp = F.enemyHp(avg('hp'), w) * m;
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

function run() {
  const st = F.heroStats(heroId, save);
  const skillMult = 1.35; // yetenekler + sıçrayan hasar katkısı (yaklaşık)
  const heroDps = st.atk * st.atkSpd * (1 + st.crit * (st.critDmg - 1)) * skillMult;
  let hp = st.maxHp, w = save.resumeWave, time = 0, gold = 0;
  for (;; w++) {
    const e = waveEnemies(w);
    const tKill = e.hp / heroDps;
    const engaged = Math.min(1, 3.5 / e.n); // aynı anda hepsi vuramaz
    const taken = e.dps * F.armorMult(st.armor) * tKill * 0.55 * Math.max(engaged, 0.45) * (heroId === 'warrior' ? 0.8 : 1);
    const net = taken - st.maxHp * st.regen * tKill;
    time += tKill + CONFIG.wave.walkDistance / (st.speed * 0.8) + 2;
    if (hp - net <= 0) { const frac = Math.max(0, hp / net) * 0.8; gold += e.gold * st.goldMult * frac; levelUp(e.xp * frac); break; }
    hp -= net;
    gold += e.gold * st.goldMult;
    levelUp(e.xp);
    hp = Math.min(st.maxHp, hp + st.maxHp * 0.15);
    if (w >= CONFIG.wave.maxWave) { w++; break; }
  }
  save.resumeWave = Math.max(1, w - CONFIG.respawnWavesBack);
  save.gold += gold;
  return { reached: w, time, gold };
}

function shop() {
  const h = save.heroes[heroId];
  const keys = ['atk', 'hp', 'armor', 'atkSpd', 'crit', 'regen'];
  for (;;) {
    let best = null, bc = Infinity;
    for (const k of keys) {
      const u = CONFIG.upgrades[k];
      if (u.max !== undefined && h.upgrades[k] >= u.max) continue;
      const c = F.upgradeCost(k, h.upgrades[k]) * (k === 'atk' || k === 'hp' ? 1 : 1.3);
      if (c < bc) { bc = c; best = k; }
    }
    const real = F.upgradeCost(best, h.upgrades[best]);
    if (save.gold < real) break;
    save.gold -= real; h.upgrades[best]++;
  }
  // yetenekler
  for (let i = 0; i < 3; i++) {
    while (save.skillPoints > 0 && h.skills[i] < 10 && save.gold >= F.skillCost(h.skills[i])) {
      save.gold -= F.skillCost(h.skills[i]); save.skillPoints--; h.skills[i]++;
    }
  }
}

let total = 0;
console.log(`Kahraman: ${CONFIG.heroes[heroId].name}`);
console.log('Koşu | Ulaşılan | Süre(dk) | Toplam(dk) | Seviye | Geliştirmeler');
for (let r = 1; r <= 400; r++) {
  const res = run();
  total += res.time;
  const u = save.heroes[heroId].upgrades;
  console.log(`${String(r).padStart(4)} | ${String(res.reached).padStart(8)} | ${(res.time / 60).toFixed(1).padStart(8)} | ${(total / 60).toFixed(0).padStart(10)} | ${String(save.level).padStart(6)} | atk${u.atk} hp${u.hp} arm${u.armor} spd${u.atkSpd} crit${u.crit} reg${u.regen}`);
  shop();
  if (res.reached > CONFIG.wave.maxWave) { console.log('100. dalga tamamlandı!'); break; }
}
