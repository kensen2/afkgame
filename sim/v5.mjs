// Ekonomi v5 realm simülasyonu (analitik, günlük)
//   node sim/v5.mjs            → 100..2000 oyuncu tablosu
//   node sim/v5.mjs 1000 --bots 200   → 1000 oyuncu + 200 bot (bedava havuzda)
//
// Model:
//  - Herkes saatlik ÜRETİR: F.rateAt(sezonun en iyi dalgası). Üretim oyun içi bakiyede birikir.
//  - Çekilebilen = yatırdığı kadar (anapara, 48 saatte üretimle geri gelir) + günlük havuz payı.
//  - Bedava havuzu 10M/gün, yatıran havuzu 10M/gün; pay üretim hızına orantılı, en fazla kendi üretimi kadar.
//  - Yatıranın havuz payı ilk yatırımdan 48 saat sonra başlar.
//  - Oyuncu karışımı (MIX): %80 bedava, geri kalanı ulaştıkları anahtar kademesine göre.
import { CONFIG, F } from '../src/config.js';

const V = CONFIG.v5, USD = CONFIG.token.usdPerToken;
const MIX = [
  { k: 'free',     name: 'Free (wave 20)',     share: 0.80, wave: 20 },
  { k: 'bronze',   name: 'Bronze (wave 30)',   share: 0.10, wave: 30 },
  { k: 'silver',   name: 'Silver (wave 40)',   share: 0.05, wave: 40 },
  { k: 'gold',     name: 'Gold (wave 50)',     share: 0.03, wave: 50 },
  { k: 'platinum', name: 'Platinum (wave 60)', share: 0.02, wave: 60 },
];
// Bedava oyuncu 20'ye her zaman ulaşmaz: ortalama dalga ~17 (üretim ~1.700/saat) kabul edilir
const FREE_AVG_WAVE = 17;

function spentUsd(wave) {
  return CONFIG.v5.keys.filter((k) => k.from <= wave).reduce((s, k) => s + k.usd, 0);
}

export function realm(N, { bots = 0 } = {}) {
  const groups = MIX.map((g) => {
    const n = Math.round(N * g.share);
    const rate = F.rateAt(g.k === 'free' ? FREE_AVG_WAVE : g.wave);
    const rateTop = F.rateAt(g.wave);
    return { ...g, n, rate, rateTop, spent: spentUsd(g.wave) };
  });
  const free = groups[0];
  const freeSum = free.n * free.rate + bots * F.rateAt(FREE_AVG_WAVE);
  const freePool = F.freePoolSize(free.n + bots);   // kademeli bedava havuz (sayılan: 20. dalgaya ulaşmış aktif bedava oyuncu + botlar)
  const depSum = groups.slice(1).reduce((s, g) => s + g.n * g.rate, 0);
  const out = groups.map((g) => {
    const isFree = g.k === 'free';
    const others = (isFree ? freeSum : depSum) - g.rate;
    const pool = isFree ? freePool : V.pools.depositor;
    const share = F.poolShare(pool, g.rateTop, others);        // tam gelişmiş (kademenin tepesi) oyuncu
    const prod = g.rateTop * 24;
    return {
      name: g.name, n: g.n, ratePerHour: g.rateTop, prodPerDay: prod, withdrawPerDay: share,
      accumulatesPerDay: prod - share, spentUsd: g.spent,
      returnHours: g.spent ? (g.spent / USD) / g.rateTop : 0,
      season10dUsd: isFree ? share * 10 * USD : g.spent + share * (10 - V.depositorPoolDelayHours / 24) * USD,
    };
  });
  const paidFree = Math.min(freePool, freeSum * 24);
  const paidDep = Math.min(V.pools.depositor, depSum * 24);
  return {
    N, bots, groups: out,
    fillFree: Math.min(1, freePool / (freeSum * 24)), freePool, fillDep: depSum ? Math.min(1, V.pools.depositor / (depSum * 24)) : 1,
    teamPerDayUsd: (paidFree + paidDep) * USD, burnedLeftoverPerDay: (freePool - paidFree) + (V.pools.depositor - paidDep),
    freeRateSum: freeSum, depRateSum: depSum, deposits10dUsd: out.slice(1).reduce((s, g) => s + g.n * g.spentUsd, 0),
  };
}

const isMain = process.argv[1]?.endsWith('v5.mjs');
if (isMain) {
  const a = process.argv.slice(2);
  const nArg = +a.find((x) => /^\d+$/.test(x));
  const bi = a.indexOf('--bots'); const bots = bi >= 0 ? +a[bi + 1] : 0;
  const usd = (t) => '$' + (t * USD).toFixed(2);
  for (const N of nArg ? [nArg] : [100, 250, 500, 1000, 1500, 2000]) {
    const r = realm(N, { bots });
    console.log(`\n=== ${N} oyuncu${bots ? ` + ${bots} bot` : ''} · bedava havuz ${(r.freePool / 1e6).toFixed(0)}M · havuz doluluğu bedava %${Math.round(r.fillFree * 100)}, yatıran %${Math.round(r.fillDep * 100)} · ekip maliyeti ${'$' + r.teamPerDayUsd.toFixed(0)}/gün · dağıtılmayan (yakılır) ${(r.burnedLeftoverPerDay / 1e6).toFixed(1)}M/gün`);
    console.log('Tip                  | kişi | üretim/saat | çekilebilir/gün     | biriken/gün | harcanan | anapara dönüşü | 10 günde toplam');
    for (const g of r.groups) {
      console.log(`${g.name.padEnd(20)} | ${String(g.n).padStart(4)} | ${String(Math.round(g.ratePerHour)).padStart(11)} | ${String(Math.round(g.withdrawPerDay)).padStart(9)} (${usd(g.withdrawPerDay).padStart(7)}) | ${String(Math.round(g.accumulatesPerDay)).padStart(11)} | ${('$' + g.spentUsd).padStart(8)} | ${g.spentUsd ? (g.returnHours.toFixed(0) + ' saat').padStart(14) : '             –'} | ${('$' + g.season10dUsd.toFixed(1)).padStart(8)}`);
    }
    if (N === 1000 && !bots) console.log(`config.v5.demo için: free.rateSum=${Math.round(r.freeRateSum)}, depositor.rateSum=${Math.round(r.depRateSum)}`);
  }
}
