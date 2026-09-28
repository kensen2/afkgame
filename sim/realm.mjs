// Realm (havuz) simülasyonu — Ekonomi v4
//   node sim/realm.mjs              → 100..2000 oyuncu tablosu
//   node sim/realm.mjs 1000 --days  → 1000 oyuncuda gün gün döküm
//   JSON=1 node sim/realm.mjs       → whitepaper için JSON
//
// İki katmanı birleştirir:
//  1) İlerleme: sim/model.mjs ile bedava ve harcayan oyuncunun düşmanlara karşı hangi dalgaya
//     kaç saatte ulaştığı (ikisi de Warrior + Lion ortalaması). DP'nin "ilerleme" kısmı buradan gelir.
//  2) Realm: her gün havuz (taban + dünkü harcamanın %30'u) oyuncular arasında sayılan DP'ye göre bölünür.
//
// Varsayımlar (değiştirmek için aşağıdaki TIERS ve PLAY):
//  - Oyuncuların %83'ü hiç yatırmaz. %12 küçük ($10), %4 orta ($60), %1 balina ($300).
//  - Yatıranlar yatırdıklarının %70'ini harcar, %30'u credit olarak bekler (her an çekilebilir).
//    Harcamanın %30'u boost'lara (Idle Pass, Gold Rush, Time Skip), %30'u Vault'a, kalanı Relic'e gider.
//  - Herkes havuz payının %40'ını Relic'e yatırır, kalanını çeker (%5 komisyon).
//  - Bedava oyuncu günde 2 saat, yatıran 3 saat aktif oynar. Fiyat sabit (10.000 token = $1).
//  - Sezon 100 oyuncuyla başlar, 20 günde hedef sayıya çıkar. Oyuncu kaybı yok.
import { CONFIG, F } from '../src/config.js';
import { simulate } from './model.mjs';

const R = CONFIG.realm, USD = CONFIG.token.usdPerToken, TOK = 1 / USD;
const TIERS = [
  { k: 'free',  name: 'Free',  share: 0.83, usd: 0,   mode: 'free',  hours: 2 },
  { k: 'small', name: 'Small', share: 0.12, usd: 10,  mode: 'payer', hours: 3 },
  { k: 'mid',   name: 'Mid',   share: 0.04, usd: 60,  mode: 'payer', hours: 3 },
  { k: 'whale', name: 'Whale', share: 0.01, usd: 300, mode: 'payer', hours: 3 },
];
const PLAY = { spend: 0.70, reinvest: 0.40, boostShare: 0.30, vaultShare: 0.30, growDays: 20, startPlayers: 100 };

// ---- 1) İlerleme eğrileri ----
function curve(payer) {
  const a = simulate('warrior', { payer }).byWave, b = simulate('lion', { payer }).byWave;
  const pts = [];
  for (let w = 1; w <= CONFIG.wave.maxWave; w++) if (a[w] !== undefined && b[w] !== undefined) pts.push([(a[w] + b[w]) / 2, w]);
  return pts;
}
const CURVES = { free: curve(false), payer: curve(true) };
const waveAt = (mode, hours) => { let w = 0; for (const [h, wv] of CURVES[mode]) { if (h <= hours) w = wv; else break; } return w; };
const levelAt = (w) => Math.max(1, Math.round(w * 1.2));   // sim: seviye ≈ 1.2 × dalga
// bedava oyuncu Vault 2'yi (15.000 gold) yaklaşık 25. dalgada karşılar
const freeVaultAt = 25;

function vaultPlan(budgetTokens) {
  let lvl = 0, cost = 0;
  for (let i = 1; i < R.vault.length; i++) {
    const v = R.vault[i];
    if (v.gold) { lvl = i; continue; }          // gold seviyesi oyunla gelir
    if (cost + v.tokens > budgetTokens) break;
    cost += v.tokens; lvl = i;
  }
  return { lvl, cost };
}

export function runRealm(nmax, { days = R.seasonDays, model = 'B', log = false } = {}) {
  const fromSpend = model === 'A' ? 0 : R.pool.fromSpend;
  const cohorts = [];
  let cur = 0, prevSpend = 0, burned = 0, reserve = 0, treasury = 0, fees = 0, sells = 0, buys = 0;
  const daily = [];
  for (let t = 1; t <= days; t++) {
    const target = Math.round(t >= PLAY.growDays ? nmax : PLAY.startPlayers + (nmax - PLAY.startPlayers) * (t - 1) / (PLAY.growDays - 1));
    const nNew = Math.max(0, (t === 1 ? Math.min(PLAY.startPlayers, nmax) : target) - cur); cur += nNew;
    let spendToday = 0, depToday = 0;
    for (const T of TIERS) {
      const n = nNew * T.share; if (n <= 0) continue;
      const dep = T.usd * TOK, spend = dep * PLAY.spend;
      const boost = spend * PLAY.boostShare;
      const v = vaultPlan(spend * PLAY.vaultShare);
      const relicTok = spend - boost - v.cost;
      cohorts.push({ t, T, n, dep, credit: dep - spend, relicTok, vaultLvl: v.lvl, wd: 0, payback: null });
      depToday += n * dep; spendToday += n * spend;
    }
    // DP
    for (const c of cohorts) {
      const hours = (t - c.t + 1) * c.T.hours;
      const w = waveAt(c.T.mode, hours);
      const vl = c.T.k === 'free' ? (w >= freeVaultAt ? 1 : 0) : Math.max(c.vaultLvl, 1);
      c.dp = w * R.dp.perWave + levelAt(w) * R.dp.perLevel + c.relicTok / 100;
      c.cap = F.vaultCap(vl); c.wave = w;
    }
    let tot = 0, totN = 0; for (const c of cohorts) { tot += c.n * c.dp; totN += c.n; }
    const avg = tot / totN;
    let sumW = 0; for (const c of cohorts) { c.w = Math.min(c.dp, c.cap * avg); sumW += c.n * c.w; }
    const extra = fromSpend * prevSpend, pool = R.pool.base + extra;
    reserve += R.pool.base; treasury -= extra;
    let sellT = 0; const agg = {};
    for (const c of cohorts) {
      const share = pool * c.w / sumW;
      const re = share * PLAY.reinvest, wdr = share * (1 - PLAY.reinvest);
      c.relicTok += re; spendToday += c.n * re;
      const net = wdr * (1 - R.withdraw.fee); fees += c.n * wdr * R.withdraw.fee; sellT += c.n * net;
      c.wd += net;
      // geri dönüş: çekilen + hâlâ çekilebilir credit ≥ yatırılan
      if (c.dep > 0 && c.payback === null && c.wd + c.credit >= c.dep) c.payback = t - c.t + 1;
      const a = agg[c.T.k] || (agg[c.T.k] = { s: 0, n: 0, w: 0, dp: 0 });
      a.s += share * c.n; a.n += c.n; a.w += c.wave * c.n; a.dp += c.dp * c.n;
    }
    burned += spendToday * R.spendSplit.burn;
    treasury += spendToday * (1 - R.spendSplit.burn - R.spendSplit.pool);
    sells += sellT; buys += depToday;
    const row = { day: t, players: cur, pool, totalCountedDp: sumW, net: (sellT - depToday) * USD };
    for (const T of TIERS) { const a = agg[T.k]; row[T.k] = a ? { usd: a.s / a.n * USD, wave: a.w / a.n, dp: a.dp / a.n } : null; }
    daily.push(row);
    if (log) console.log(`gün ${String(t).padStart(2)} | ${String(cur).padStart(4)} oyuncu | havuz ${(pool / 1e6).toFixed(2)}M | ` + TIERS.map((T) => row[T.k] ? `${T.name} w${Math.round(row[T.k].wave)} $${row[T.k].usd.toFixed(3)}` : '').join(' | '));
    prevSpend = spendToday;
  }
  const pay = {};
  for (const T of TIERS) {
    const e = cohorts.find((c) => c.T.k === T.k && c.t === 1), l = cohorts.find((c) => c.T.k === T.k && c.t >= 15);
    pay[T.k] = { early: e ? e.payback : null, late: l ? l.payback : null };
  }
  const last = daily[daily.length - 1];
  return { nmax, model, daily, last, pay, burned, netSeasonUsd: (sells - buys) * USD, teamNetUsd: (reserve + treasury * -1 - fees) * USD, treasuryUsd: treasury * USD };
}

// ---- CLI ----
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('realm.mjs');
if (isMain) {
  const args = process.argv.slice(2);
  const n = +args.find((a) => /^\d+$/.test(a)) || 0;
  const fmt = (d) => (d == null ? '30+' : `${d}g`);
  if (n && args.includes('--days')) { runRealm(n, { log: true }); process.exit(0); }
  const Ns = [100, 250, 500, 1000, 1500, 2000];
  const out = [];
  console.log(`\nİlerleme (bedava 2 sa/gün, yatıran 3 sa/gün): gün 1/3/7/14/30'da ulaşılan dalga`);
  for (const [mode, h] of [['free', 2], ['payer', 3]]) console.log(`  ${mode.padEnd(6)} ` + [1, 3, 7, 14, 30].map((d) => `g${d}=w${waveAt(mode, d * h)}`).join('  '));
  console.log(`\nOyuncu | Model | Free $/g | Small $/g | Mid $/g | Whale $/g | Small dönüş | Mid dönüş | Whale dönüş | Net borsa $ | Ekip net $`);
  for (const N of Ns) for (const m of ['A', 'B']) {
    const r = runRealm(N, { model: m });
    const L = r.last;
    out.push({ players: N, model: m, free: L.free?.usd, small: L.small?.usd, mid: L.mid?.usd, whale: L.whale?.usd, pay: r.pay, netUsd: r.netSeasonUsd, teamUsd: r.teamNetUsd, burned: r.burned, wave: { free: L.free?.wave, payer: L.small?.wave } });
    console.log(`${String(N).padStart(6)} |   ${m}   | ${L.free.usd.toFixed(3).padStart(8)} | ${L.small.usd.toFixed(2).padStart(9)} | ${L.mid.usd.toFixed(2).padStart(7)} | ${L.whale.usd.toFixed(2).padStart(9)} | ${fmt(r.pay.small.early).padStart(11)} | ${fmt(r.pay.mid.early).padStart(9)} | ${fmt(r.pay.whale.early).padStart(11)} | ${Math.round(r.netSeasonUsd).toString().padStart(11)} | ${Math.round(r.teamNetUsd).toString().padStart(10)}`);
  }
  const d = runRealm(500).daily[14];
  console.log(`\nconfig.realm.demo için (500 oyuncu, 15. gün): players=${d.players}, totalCountedDp=${Math.round(d.totalCountedDp)}`);
  if (process.env.JSON) console.log(JSON.stringify(out));
}
