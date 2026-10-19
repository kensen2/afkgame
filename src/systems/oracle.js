// =====================================================================
//  FİYAT ORACLE'I (TEST)
//  DGN henüz canlı değil. Test için sahte bir piyasa fiyatı üretir: market cap 100K–200K $ bandında
//  (1 milyar arz → 0,0001–0,0002 $) dalgalanır, arada ani sıçrama/düşüş olur.
//  Oyunun kullandığı fiyat ANLIK fiyat değil, son 'twapMinutes' dakikanın zaman ağırlıklı ortalamasıdır (TWAP).
//  Böylece birisi fiyatı birkaç dakikalığına pompalayıp/düşürüp ucuza anahtar alamaz ya da fazla token çekemez.
//  Canlıda: spot fiyat DEX havuzundan okunur, TWAP sunucuda hesaplanır; bu dosyanın sahte yürüyüşü kalkar.
// =====================================================================
import { CONFIG } from '../config.js';

const KEY = 'afk_oracle_v1';
const listeners = new Set();
const O = () => CONFIG.token.oracle;

// Standart normal dağılım (Box-Muller)
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };

export const Oracle = {
  hist: [],          // [{ t, p }] spot fiyat geçmişi (en az TWAP penceresi kadar)
  timer: null,
  nudge: 0,          // test butonu: bir sonraki adımda uygulanacak ek hareket (log)

  start() {
    this.load();
    const now = Date.now(), step = O().tickSec * 1000;
    if (!this.hist.length) {
      // ilk açılış: bandın ortasından başla, pencereyi doldur (TWAP hemen anlamlı olsun)
      const n = Math.ceil(O().twapMinutes * 60 / O().tickSec);
      let p = Math.sqrt(this.lo() * this.hi());
      for (let i = n; i > 0; i--) { p = this.next(p); this.hist.push({ t: now - i * step, p }); }
    } else {
      // kapalıyken geçen süreyi doldur (en fazla bir pencere kadar)
      const last = this.hist.at(-1);
      const missing = Math.min(Math.floor((now - last.t) / step), Math.ceil(O().twapMinutes * 60 / O().tickSec));
      let p = last.p;
      for (let i = missing; i > 0; i--) { p = this.next(p); this.hist.push({ t: now - i * step + 1, p }); }
    }
    this.trim(now);
    this.publish();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), step);
  },

  lo() { return O().mcapMin / O().supply; },
  hi() { return O().mcapMax / O().supply; },

  // Bir adım: ortaya doğru çeken rastgele yürüyüş + nadiren sıçrama; bandın dışına çıkınca geri yansır
  next(p) {
    const lo = Math.log(this.lo()), hi = Math.log(this.hi()), mid = (lo + hi) / 2;
    let x = Math.log(p);
    x += O().revert * (mid - x) + O().vol * gauss();
    if (Math.random() < O().jumpChance) x += (Math.random() < 0.5 ? -1 : 1) * O().jump * (0.5 + Math.random());
    if (this.nudge) { x += this.nudge; this.nudge = 0; }
    if (x > hi) x = hi - (x - hi);
    if (x < lo) x = lo + (lo - x);
    return Math.exp(Math.min(hi, Math.max(lo, x)));
  },

  tick(now = Date.now()) {
    this.hist.push({ t: now, p: this.next(this.spot()) });
    this.trim(now);
    this.publish();
    this.save();
  },

  trim(now) {
    const keep = now - (O().twapMinutes * 60 + 60) * 1000;
    while (this.hist.length > 2 && this.hist[1].t < keep) this.hist.shift();
  },

  spot() { return this.hist.at(-1)?.p || CONFIG.token.designUsdPerToken; },

  // Zaman ağırlıklı ortalama: her fiyat bir sonraki fiyata kadar geçen süre kadar ağırlık alır
  twap(now = Date.now()) {
    const from = now - O().twapMinutes * 60000, h = this.hist;
    if (!h.length) return CONFIG.token.designUsdPerToken;
    let sum = 0, span = 0;
    for (let i = 0; i < h.length; i++) {
      const a = Math.max(from, h[i].t), b = i + 1 < h.length ? h[i + 1].t : now;
      if (b <= a) continue;
      sum += h[i].p * (b - a); span += b - a;
    }
    return span > 0 ? sum / span : this.spot();
  },

  // Anlık fiyat oracle'dan ne kadar sapıyor (0,25 = %25 yukarıda)
  deviation() { return this.spot() / this.twap() - 1; },
  unstable() { return Math.abs(this.deviation()) > O().clamp; },
  mcap() { return this.spot() * O().supply; },
  // Son 'mins' dakikadaki değişim (HUD oku için)
  change(mins = 10, now = Date.now()) {
    const t = now - mins * 60000, old = this.hist.find((x) => x.t >= t) || this.hist[0];
    return old ? this.spot() / old.p - 1 : 0;
  },

  // Oyunun bütün USD → DGN dönüşümleri bu fiyatı kullanır (CONFIG.token.usdPerToken)
  publish() {
    CONFIG.token.live = this.twap();
    for (const fn of listeners) fn(this);
  },

  // Test: fiyatı bir anda oynat (ör. +0.3 = yaklaşık %35 pompa). TWAP yavaş takip eder.
  shock(logMove) { this.nudge = logMove; this.tick(); },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && Array.isArray(d.hist) && d.v === 1) this.hist = d.hist.filter((x) => x && x.t > 0 && x.p > 0);
    } catch (e) { this.hist = []; }
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, hist: this.hist })); } catch (e) { /* depolama yok */ }
  },
};
