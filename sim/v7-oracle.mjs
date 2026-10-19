// Oracle simülasyonu: 100 yatırımcı (10–500 $), token fiyatı sezon boyunca 2 katına çıkar, 10 günlük sezon.
// Anahtar fiyatları USD; o anki fiyatla DGN'e çevrilir (oracle).
//   Mod A: üretim de oracle ile ayarlanır (bir paketin 48 saatte geri dönmesi her fiyatta korunur)
//   Mod B: üretim DGN cinsinden sabit (bugünkü tablo, 0,0001 $ varsayımıyla ayarlı)
// Kurallar CONFIG'ten: geri ödeme önce, sonra %50/40/30/20, tüm yatırımcılara günlük tavan = sezon yatırımının %10'u,
// günde bir çekim (%5 kesinti), kalan bakiyeyle tek anahtar (paket/10 × 4).
// Not: Çekilen tokenlerin satış baskısı fiyata yansıtılmadı (fiyat dışarıdan verilir).
// Çalıştır: node sim/v7-oracle.mjs [başlangıç piyasa değeri $] [fiyat çarpanı]   örn: node sim/v7-oracle.mjs 10000 2
import { F, CONFIG } from '../src/config.js';

const MCAP0 = Number(process.argv[2] || 10000), GROWTH = Number(process.argv[3] || 2), SUPPLY = 1e9;
const P0 = MCAP0 / SUPPLY, DESIGN = CONFIG.token.usdPerToken;       // oyunun ayarlandığı fiyat (0,0001)
const FEE = CONFIG.v5.withdraw.fees[0], SCH = CONFIG.v5.depositor.schedule, CAP = CONFIG.v5.depositor.capOfDeposits;
const MULT = CONFIG.v5.singleKeyMult, KEYS = CONFIG.v5.keys, DAYS = 10;
const price = (h) => P0 * Math.pow(GROWTH, h / (DAYS * 24));       // sezon boyunca düzgün artış
const tierOf = (w) => KEYS.find((k) => w >= k.from && w <= k.to);
const packTokens = (k, p) => k.usd / p * (1 - 1e-9);   // küçük pay: yuvarlama yüzünden paket kaçmasın

// 100 oyuncu: farklı yatırım büyüklükleri
const MIX = [[10, 30], [25, 25], [50, 20], [100, 15], [250, 7], [500, 3]];

function run(mode) {
  const rate = (w, p) => (mode === 'A' ? F.rateAt(w) * DESIGN / p : F.rateAt(w));
  const players = [];
  for (const [usd, n] of MIX) for (let i = 0; i < n; i++) players.push({ usd, dep: usd / P0 });
  const seasonDep = players.reduce((a, p) => a + p.dep, 0), dayCap = seasonDep * CAP;
  for (const pl of players) {
    // paketlerle başla (yatırılan DGN ile, sırayla Bronze → ...)
    let bal = pl.dep, wave = 20, spent = 0;
    for (const k of KEYS) { const c = packTokens(k, P0); if (bal < c) break; bal -= c; spent += c; wave = k.to; }
    Object.assign(pl, { bal, wave, credit: pl.dep - spent, repay: spent, repaid: 0, roiH: null, share: 0, outUsd: 0, outTok: 0, keys: 0, keyTok: 0 });
  }
  const days = [];
  for (let h = 1; h <= DAYS * 24; h++) {
    const p = price(h);
    for (const pl of players) {
      const prod = rate(pl.wave, p); pl.bal += prod;
      if (pl.roiH === null) {
        const pay = Math.min(prod, pl.repay - pl.repaid); pl.repaid += pay; pl.credit += pay;
        if (pl.repaid >= pl.repay - 1e-6) pl.roiH = h;
        if (prod > pay) pl.share += (prod - pay) * SCH[0];
      } else pl.share += prod * SCH[Math.min(Math.floor((h - pl.roiH) / 24), SCH.length - 1)];
    }
    if (h % 24) continue;
    // günlük çekim: önce kendi yatırdığın (sınırsız), sonra pay; paylar toplamı günlük tavanı aşarsa herkes küçülür
    const wantShare = players.reduce((a, pl) => a + Math.min(pl.share, Math.max(0, pl.bal - Math.min(pl.credit, pl.bal))), 0);
    const scale = wantShare > dayCap ? dayCap / wantShare : 1;
    let paidUsd = 0;
    for (const pl of players) {
      const fromCredit = Math.min(pl.credit, pl.bal); pl.credit -= fromCredit; pl.bal -= fromCredit;
      const fromShare = Math.min(pl.share, pl.bal) * scale; pl.share = 0; pl.bal -= fromShare;
      const net = (fromCredit + fromShare) * (1 - FEE);
      pl.outTok += net; pl.outUsd += net * p; paidUsd += net * p;
      // kalan bakiyeyle tek anahtar al, yukarı çık
      let t;
      while (pl.wave < 100 && (t = tierOf(pl.wave + 1)) && pl.bal >= packTokens(t, p) / 10 * MULT) {
        const c = packTokens(t, p) / 10 * MULT; pl.bal -= c; pl.keyTok += c; pl.wave++; pl.keys++;
      }
    }
    days.push({ day: h / 24, p, scale, paidUsd, cum: players.reduce((a, x) => a + x.outUsd, 0) });
  }
  return { players, days, seasonDep };
}

const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const totalUsd = MIX.reduce((a, [u, n]) => a + u * n, 0);
console.log(`Başlangıç değeri ${fmt(MCAP0)} $ (fiyat ${P0.toExponential(2)} $), sezon sonu ×${GROWTH} → ${fmt(MCAP0 * GROWTH)} $. 100 yatırımcı, toplam ${fmt(totalUsd)} $.`);
for (const mode of ['A', 'B']) {
  const { players, days } = run(mode);
  console.log(`\n=== Mod ${mode}: ${mode === 'A' ? 'üretim oracle ile (48 saat geri dönüş korunur)' : 'üretim DGN olarak sabit'} ===`);
  console.log('Gün | fiyat çarpanı | tavan kesintisi | o gün ödenen $ | toplam ödenen $');
  for (const d of days) console.log(`${String(d.day).padStart(3)} | ×${(d.p / P0).toFixed(2)} | ${d.scale < 1 ? `paylar %${Math.round(d.scale * 100)}'e indi` : 'yok'} | ${fmt(d.paidUsd)} | ${fmt(d.cum)}`);
  console.log('Yatırım | kişi | başlangıç dalga → son | geri dönüş (saat) | tek anahtar | net çekilen $ | kat');
  for (const [usd, n] of MIX) {
    const g = players.filter((p) => p.usd === usd), a = (f) => g.reduce((s, p) => s + f(p), 0) / g.length;
    const startWave = (() => { let b = usd + 1e-6, w = 20; for (const k of KEYS) { if (b < k.usd) break; b -= k.usd; w = k.to; } return w; })();
    const roi = a((p) => p.roiH ?? 999);
    console.log(`${String(usd).padStart(4)} $ | ${n} | ${startWave} → ${fmt(a((p) => p.wave))} | ${roi >= 999 ? 'dönmedi' : fmt(roi)} | ${fmt(a((p) => p.keys))} | ${fmt(a((p) => p.outUsd), 2)} | ×${(a((p) => p.outUsd) / usd).toFixed(2)}`);
  }
  const out = players.reduce((a, p) => a + p.outUsd, 0), kept = players.reduce((a, p) => a + p.keyTok, 0);
  console.log(`Toplam: yatırılan ${fmt(totalUsd)} $, çekilen ${fmt(out)} $ (×${(out / totalUsd).toFixed(2)}), anahtara harcanıp oyunda kalan ${fmt(kept / 1e6, 1)}M DGN`);
}
// Arz kontrolü: oyunun dağıttığı DGN toplam arza (1 milyar) göre ne kadar?
for (const mode of ['A', 'B']) {
  const { players } = run(mode);
  const out = players.reduce((a, p) => a + p.outTok, 0), kept = players.reduce((a, p) => a + p.keyTok, 0), dep = players.reduce((a, p) => a + p.dep, 0);
  console.log(`Mod ${mode}: yatırılan ${fmt(dep / 1e6)}M DGN, çekilen ${fmt(out / 1e6)}M DGN, anahtara giden ${fmt(kept / 1e6)}M DGN (toplam arz ${fmt(SUPPLY / 1e6)}M)`);
}
