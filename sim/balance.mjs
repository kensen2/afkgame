// Denge simülasyonu (Ekonomi v3)
//   node sim/balance.mjs [warrior|lion]            → bedava + harcayan oyuncu süreleri
//   node sim/balance.mjs lion --payer --verbose    → sadece harcayan, koşu koşu döküm
//   OVR='{"wave":{"goldPerWave":0.2}}' node sim/balance.mjs   → ayar üzerine yazma
// Çıktı: {"10":dk,"20":dk,...} = o dalgayı geçme süresi (dakika, 1x oyun hızı, aktif oyun)
import { CONFIG, F } from '../src/config.js';
import { simulate, TARGETS } from './model.mjs';

const args = process.argv.slice(2);
const heroes = args.filter((a) => CONFIG.heroes[a]);
const ovr = process.env.OVR ? JSON.parse(process.env.OVR) : null;
const verbose = args.includes('--verbose') && !process.env.QUIET;
const modes = args.includes('--payer') ? [true] : args.includes('--free') ? [false] : [false, true];
const hm = (m) => (m === undefined ? '—' : m >= 120 ? `${(m / 60).toFixed(1)}s` : `${m}dk`);

if (!process.env.QUIET) {
  console.log('Dalga başına gold:', [1, 10, 25, 50, 75, 100].map((w) => `w${w}=${Math.round(F.waveGold(w))}`).join('  '));
  console.log('Attack maliyeti:', [0, 10, 20, 21, 30, 40, 41, 50, 60].map((l) => `lv${l}=${F.upgradeCost('atk', l)}`).join('  '));
}
for (const heroId of heroes.length ? heroes : ['warrior', 'lion']) {
  for (const payer of modes) {
    const log = verbose ? (r, res, total, save) => {
      const u = save.heroes[heroId].upgrades;
      console.log(`${String(r).padStart(5)} | w${String(res.reached).padStart(3)} | ${(total / 3600).toFixed(1).padStart(6)}s | lv${save.level} | atk${u.atk} hp${u.hp} arm${u.armor} spd${u.atkSpd} crit${u.crit} reg${u.regen} | skills ${save.heroes[heroId].skills.join('/')}`);
    } : null;
    const r = simulate(heroId, { payer, ovr, log });
    const tgt = TARGETS[payer ? 'payer' : 'free'];
    const who = payer ? 'Harcayan' : 'Bedava  ';
    console.log(`${CONFIG.heroes[heroId].name.padEnd(18)} ${who} ` + [10, 20, 30, 50, 75, 100].map((m) => `w${m}=${hm(r.marks[m])}(${hm(tgt[m])})`).join(' ')
      + ` | seviye ${r.level}, ölüm ${r.deaths}` + (payer ? `, harcanan ${Math.round(r.tokensSpent)} ${CONFIG.token.symbol} ≈ $${r.usd.toFixed(1)}` : ''));
    if (process.env.JSON) console.log(JSON.stringify(r.marks));
  }
}
