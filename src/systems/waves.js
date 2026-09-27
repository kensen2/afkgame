// Dalga içeriği: hangi düşmanlar, kaç tane, elit/boss.
import { CONFIG, F } from '../config.js';

export function buildWave(w) {
  const list = [];
  const pool = Object.entries(CONFIG.enemies).filter(([, d]) => d.unlock <= w);
  const total = pool.reduce((s, [, d]) => s + d.weight, 0);
  const pick = () => {
    let r = Math.random() * total;
    for (const [name, d] of pool) { r -= d.weight; if (r <= 0) return name; }
    return pool[0][0];
  };

  if (w === CONFIG.wave.maxWave && CONFIG.finalBoss) {
    list.push({ type: CONFIG.finalBoss.type, rank: 'boss', bossDef: CONFIG.finalBoss });
    for (let i = 0; i < 6; i++) list.push({ type: pick(), rank: i < 2 ? 'elite' : 'normal' });
    return list;
  }
  if (F.isBoss(w)) {
    const idx = (w / CONFIG.wave.bossEvery - 1) % CONFIG.bosses.length;
    const b = CONFIG.bosses[idx];
    list.push({ type: b.type, rank: 'boss', bossDef: b });
    const adds = Math.min(6, 2 + Math.floor(w / 15));
    for (let i = 0; i < adds; i++) list.push({ type: pick(), rank: 'normal' });
    return list;
  }
  const n = F.waveCount(w);
  // yeni açılan düşman tipini ilk dalgasında mutlaka göster
  const fresh = pool.find(([, d]) => d.unlock === w);
  if (fresh) list.push({ type: fresh[0], rank: 'normal' });
  while (list.length < n) list.push({ type: pick(), rank: 'normal' });
  if (F.isElite(w)) {
    const eliteCount = 1 + Math.floor(w / 20);
    for (let i = 0; i < eliteCount && i < list.length; i++) list[i].rank = 'elite';
  }
  return list;
}
