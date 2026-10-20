// v8 harman: çekim oracle ile USD bazlı + geri ödeme önce, sonra günlük adımlı pay (50/40/30/20/10).
// Üretim oracle ile USD'de sabit tutulur (Mod A). 2.2x ömür tavanı: tavana ulaşanın çekimi günde yatırımının %1'i.
// Tüm yatıranların günlük toplam çekimi = sezon yatırımının capOfDeposits'i (USD).
// Çalıştır: node sim/v8-blend.mjs [başlangıç MC $] [fiyat çarpanı] [şema 50,40,30,20,10] [tavan 0.10] [ömür 2.2]
import { F, CONFIG } from '../src/config.js';
const MCAP0 = +(process.argv[2] || 150000), GROWTH = +(process.argv[3] || 1);
const SCH = (process.argv[4] || '50,40,30,20,10').split(',').map((x) => x / 100);
const CAP = +(process.argv[5] || 0.10), LIFE = +(process.argv[6] || 2.2), AFTER = 0.01;
const SUPPLY = 1e9, P0 = MCAP0 / SUPPLY, DESIGN = CONFIG.token.designUsdPerToken, DAYS = 10;
const FEE = CONFIG.v5.withdraw.fees[0], MULT = CONFIG.v5.singleKeyMult, KEYS = CONFIG.v5.keys;
const price = (h) => P0 * Math.pow(GROWTH, h / (DAYS * 24));
const tierOf = (w) => KEYS.find((k) => w >= k.from && w <= k.to);
const MIX = [[10, 30], [25, 25], [50, 20], [100, 15], [250, 7], [500, 3]];
const prodUsd = (w) => F.rateAt(w) * DESIGN;            // saatlik üretim USD (fiyattan bağımsız)
const players = [];
for (const [usd, n] of MIX) for (let i = 0; i < n; i++) {
  let b = usd + 1e-9, wave = 20;
  for (const k of KEYS) { if (b < k.usd) break; b -= k.usd; wave = k.to; }
  players.push({ usd, wave, bal: b, credit: usd - b, repaid: 0, roiH: null, share: 0, out: 0 });
}
const seasonDep = players.reduce((a, p) => a + p.usd, 0), dayCap = seasonDep * CAP;
let capDays = 0;
for (let h = 1; h <= DAYS * 24; h++) {
  for (const pl of players) {
    const prod = prodUsd(pl.wave); pl.bal += prod;
    if (pl.out >= LIFE * pl.usd) continue;                // tavandakiler aşağıda ayrıca
    if (pl.roiH === null) {
      const pay = Math.min(prod, pl.credit - pl.repaid); pl.repaid += pay;
      if (pl.repaid >= pl.credit - 1e-9) pl.roiH = h;
      if (prod > pay) pl.share += (prod - pay) * SCH[0];
    } else pl.share += prod * SCH[Math.min(Math.floor((h - pl.roiH) / 24), SCH.length - 1)];
  }
  if (h % 24) continue;
  const want = players.map((pl) => {
    if (pl.out >= LIFE * pl.usd) return { c: 0, s: Math.min(pl.bal, pl.usd * AFTER) };
    const c = Math.min(pl.repaid, pl.bal); const room = LIFE * pl.usd - pl.out - c * (1 - FEE);
    return { c, s: Math.max(0, Math.min(pl.share, pl.bal - c, room / (1 - FEE))) };
  });
  const tot = want.reduce((a, w) => a + w.s, 0), scale = tot > dayCap ? dayCap / tot : 1;
  if (scale < 1) capDays++;
  players.forEach((pl, i) => {
    const { c, s } = want[i]; const take = c + s * scale;
    pl.bal -= take; pl.repaid -= c; pl.credit -= c; pl.share = 0; pl.out += take * (1 - FEE);
    let t;   // kalan oyun içi bakiyeyle tek anahtar (USD fiyatla)
    while (pl.wave < 100 && (t = tierOf(pl.wave + 1)) && pl.bal >= t.usd / 10 * MULT) { pl.bal -= t.usd / 10 * MULT; pl.wave++; }
  });
}
const fmt = (n, d = 2) => n.toFixed(d);
console.log(`MC ${MCAP0} → ×${GROWTH} | şema ${SCH.map((x) => x * 100).join('/')} | günlük tavan %${CAP * 100} | ömür ${LIFE}x | tavanın kestiği gün: ${capDays}`);
for (const [usd] of MIX) {
  const g = players.filter((p) => p.usd === usd), a = (f) => g.reduce((s, p) => s + f(p), 0) / g.length;
  console.log(`  $${String(usd).padStart(3)}: geri dönüş ${fmt(a((p) => p.roiH ?? 999), 0)} saat · çekilen ×${fmt(a((p) => p.out) / usd)} · son dalga ${fmt(a((p) => p.wave), 0)}`);
}
const out = players.reduce((a, p) => a + p.out, 0);
console.log(`  TOPLAM ×${fmt(out / seasonDep)} (yatırılan $${seasonDep}, çekilen $${fmt(out, 0)}) · 2.2x'e ulaşan %${Math.round(players.filter((p) => p.out >= LIFE * p.usd - 0.01).length)}`);
