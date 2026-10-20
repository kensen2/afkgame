// =====================================================================
//  AFK MODU (sağ alttaki 🌙 AFK düğmesi, F tuşu)
//  Ekran sisle kararır, ortada canlı sayaçlar kalır; oyun aynı hızla oynamaya devam eder.
//  Kazanç oyun açıkken olduğu gibidir (ekstra ödül yok, kesinti yok). Pil tasarrufu: 3D çizim saniyede ~4 kareye düşer.
//  Ayarlar: autoAfk (2 dakika dokunulmazsa kendiliğinden), afkWake (AFK'dayken ekran kapanmasın).
// =====================================================================
import { Economy } from '../systems/economy.js';
import { Audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const AUTO_AFTER = 120000;     // otomatik AFK için hareketsizlik süresi (ms)
const n0 = (v) => Math.floor(v || 0).toLocaleString('en-US');
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export class AfkMode {
  constructor(ui) {
    this.ui = ui;
    this.on = false;
    this.lastInput = Date.now();
    const touch = () => { this.lastInput = Date.now(); };
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { capture: true, passive: true });
    setInterval(() => this._autoCheck(), 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.on) this._lock(); });
  }

  get game() { return this.ui.game; }

  // Oyun gerçekten akıyor mu ve üstte açık bir pencere yok mu
  canEnter() {
    const g = this.game;
    if (!g?.hero || g.paused || g.cine) return false;
    return !document.querySelector('.screen.modal:not(.hidden):not(#screen-death):not(#screen-gate)');
  }

  toggle() { if (this.on) this.exit(); else this.enter(); }

  enter(auto = false) {
    if (this.on || !this.canEnter()) return false;
    this.on = true;
    const d = Economy.data, g = this.game;
    this.start = { t: Date.now(), dgn: this._dgnTotal(), gold: d.gold || 0, wave: g.wave || 1, auto };
    d.afkLast = Date.now(); Economy.save();
    g.lowPower = true;                                  // pil tasarrufu: çizim seyrekleşir
    this._musicVol = d.settings.musicVol ?? 0.1;
    Audio.setMusicVolume(this._musicVol * 0.35);
    let el = $('afk-screen');
    if (!el) {
      el = document.createElement('div'); el.id = 'afk-screen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'AFK mode');
      el.innerHTML = `<div class="afk-fog f1"></div><div class="afk-fog f2"></div><div class="afk-embers">${'<i></i>'.repeat(14)}</div>
        <div class="afk-box"><div class="afk-moon">🌙</div><div class="afk-title">AFK FARMING</div>
          <div class="afk-sub">Your hero keeps fighting in the dark</div>
          <div class="afk-dgn"><span class="gem">◈</span><b id="afk-dgn">0</b><small id="afk-rate"></small></div>
          <div class="afk-grid"><div><span>Time</span><b id="afk-time">00:00:00</b></div><div><span>Gold</span><b id="afk-gold">+0</b></div><div><span>Wave</span><b id="afk-wave">1</b></div></div>
          <div class="afk-saved">This session: <b id="afk-session">+0 DGN</b> · Battery saver on</div>
          <div class="afk-wake">Tap anywhere to wake up</div></div>`;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.exit(); });
      document.body.appendChild(el);
      window.addEventListener('keydown', (e) => { if (this.on) { e.preventDefault(); e.stopPropagation(); this.exit(); } }, { capture: true });
    }
    el.classList.remove('hidden', 'out');
    void el.offsetWidth; el.classList.add('in');
    document.body.classList.add('afk');
    this._tick(); clearInterval(this._t); this._t = setInterval(() => this._tick(), 250);
    this._lock();
    this.ui.syncAfk?.();
    return true;
  }

  exit() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this._t);
    const d = Economy.data, g = this.game, s = this.start;
    if (g) g.lowPower = false;
    Audio.setMusicVolume(d.settings.musicVol ?? this._musicVol ?? 0.1);
    const ms = Date.now() - s.t;
    d.afkSeasonMs = (d.afkSeasonMs || 0) + ms; d.afkLast = Date.now(); Economy.save();
    this._unlock();
    const el = $('afk-screen');
    if (el) { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { if (!this.on) el.classList.add('hidden'); }, 600); }
    document.body.classList.remove('afk');
    this.lastInput = Date.now();
    this.ui.syncAfk?.();
    if (ms > 15000) {
      const dg = this._dgnTotal() - s.dgn, gold = (d.gold || 0) - s.gold, w = g?.wave || s.wave;
      Audio.play('coin');
      this.ui.toast(`While you were AFK (${clock(ms)}): +${n0(dg)} DGN · +${n0(gold)} gold${w !== s.wave ? ` · wave ${s.wave} → ${w}` : ''}`, 6000);
    }
  }

  // Bakiye + biriken + bu ana kadar üretilen (canlı)
  _dgnTotal() {
    const d = Economy.data, now = Date.now();
    return (d.balance || 0) + (d.uncollected || 0) + Economy.ratePerHour() * Math.max(0, now - (d.lastAccrue || now)) / 3600000;
  }

  _tick() {
    if (!this.on) return;
    const d = Economy.data, g = this.game, s = this.start, now = Date.now();
    // AFK'dayken menü/ölüm/kapı ekranları açılabilir; ölümde oyun kendi kendine yeniden başlar, kapı 10 sn sonra geçer
    $('afk-dgn').textContent = this._dgnTotal().toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    $('afk-rate').textContent = `+${n0(Economy.ratePerHour())} / h`;
    $('afk-time').textContent = clock(now - s.t);
    $('afk-gold').textContent = `+${n0((d.gold || 0) - s.gold)}`;
    $('afk-wave').textContent = g?.wave || s.wave;
    $('afk-session').textContent = `+${n0(this._dgnTotal() - s.dgn)} DGN`;
    // biriken üretimi düzenli yaz (kapanırsa kaybolmasın)
    if ((this._n = (this._n || 0) + 1) % 60 === 0) { Economy.accrue(); Economy.save(); }
  }

  _autoCheck() {
    if (this.on || !Economy.data.settings.autoAfk || document.hidden) return;
    if (Date.now() - this.lastInput >= AUTO_AFTER) this.enter(true);
  }

  // Ekran kapanmasın (ayardan; tarayıcı destekliyorsa)
  async _lock() {
    if (!this.on || !Economy.data.settings.afkWake || !navigator.wakeLock) return;
    try { this._wl = await navigator.wakeLock.request('screen'); } catch (e) { this._wl = null; }
  }
  _unlock() { try { this._wl?.release(); } catch (e) { /* yok */ } this._wl = null; }
}
