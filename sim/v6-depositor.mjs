// Yatıran oyuncu (v6) için 10 günlük sezon hesabı: 1M yatırır, bronz→platin paketlerini alır,
// günde bir çeker (%5 kesinti), biriken DGN ile tekli anahtar alır. Çalıştır: node sim/v6-depositor.mjs
import { F, CONFIG } from '../src/config.js';
const FEE = 0.05, K = CONFIG.v5.demo.depositor.capK, SCH = CONFIG.v5.depositor.schedule;
const tierOf = (w) => CONFIG.v5.keys.find((k) => w >= k.from && w <= k.to);
function run(mult) {
  let bal = 100_000, repaid = 0, roiAt = null, wave = 60, avail = 0, creditAvail = 100_000, net = 0, spent = 0, keys = 0; const log = [];
  for (let h = 1; h <= 240; h++) {
    const prod = F.rateAt(wave); bal += prod;
    if (roiAt === null) { const pay = Math.min(prod, 900_000 - repaid); repaid += pay; creditAvail += pay; if (repaid >= 900_000) roiAt = h; if (prod > pay) avail += (prod - pay) * SCH[0] * K; }
    else { const day = Math.floor((h - roiAt) / 24); avail += prod * SCH[Math.min(day, SCH.length - 1)] * K; }
    if (h % 24 === 0) {
      const gross = Math.min(bal, creditAvail + avail);
      const fc = Math.min(creditAvail, gross); creditAvail -= fc; avail -= gross - fc; bal -= gross; net += gross * (1 - FEE);
      // tek tek anahtar: fiyat = paket fiyatı / 10 × mult, her biri bir dalga açar (kademe başına sezonda en fazla 10)
      if (mult) { let t; while (wave < 100 && (t = tierOf(wave + 1)) && bal >= F.keyPackTokens(t) / 10 * mult) { const p = F.keyPackTokens(t) / 10 * mult; bal -= p; spent += p; wave++; keys++; } }
      log.push(`${h / 24}:${wave}`);
    }
  }
  return { net, spent, keys, wave, log: log.join(' ') };
}
for (const m of [0, 4, 3, 2]) {
  const r = run(m);
  console.log(`${m ? `tekli anahtar = paketin ${m} katı` : 'anahtar yok'} | 10 günde net ${(r.net / 1e6).toFixed(2)}M | anahtar ${r.keys} adet, ${(r.spent / 1e6).toFixed(2)}M harcadı | son dalga ${r.wave} | gün:dalga ${r.log}`);
}
