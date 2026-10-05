// Açılış sahnesi (HTML/CSS katmanı + sesler):
//   descent() ENTER THE DUNGEON'a basınca: kapı arkandan kapanır → adımlar → meşale tutuşur → kat adı → oyun
// Tıklama ya da herhangi bir tuş sahneyi atlar. Otomatik testlerde (navigator.webdriver) ve
// "hareketi azalt" ayarında sahne atlanır; ?intro=1 testte de oynatır.
import { Audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const SKIP = (navigator.webdriver && !QS.has('intro')) || QS.has('nointro')
  || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !QS.has('intro'));

export const Intro = {
  busy: false,
  _timers: [],
  _finish: null,

  _at(ms, fn) { this._timers.push(setTimeout(fn, ms)); },
  _begin(cls, finish) {
    const el = $('intro');
    el.className = 'intro ' + cls;
    this.busy = true;
    this._finish = () => {
      for (const t of this._timers) clearTimeout(t);
      this._timers = [];
      this.busy = false; this._finish = null;
      window.removeEventListener('keydown', this._skip, true);
      el.removeEventListener('pointerdown', this._skip);
      finish();
      el.classList.add('out');
      setTimeout(() => { if (!this.busy) el.className = 'intro hidden'; }, 650);
    };
    // ilk 350 ms'de atlama yok (başlatan tıklama sahneyi kapatmasın)
    this._skip = (e) => { e?.stopPropagation?.(); if (this._finish) this._finish(); };
    this._at(350, () => { window.addEventListener('keydown', this._skip, true); el.addEventListener('pointerdown', this._skip); });
    return el;
  },

  // Zindana iniş. start: ekran tamamen karardığında oyunu başlatır.
  descent(floorNo, floorName, start) {
    if (SKIP || this.busy) { start(); return; }
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    const el = this._begin('descent', go);
    $('intro-line').textContent = floorName;
    $('intro-sub').textContent = `Floor ${floorNo}`;
    this._at(40, () => el.classList.add('dark'));
    this._at(420, () => Audio.play('gateSlam'));
    this._at(700, go);
    this._at(1000, () => Audio.play('steps'));
    this._at(2300, () => { el.classList.add('torch', 'text'); Audio.play('torchLight'); });
    this._at(4000, () => this._finish?.());
  },
};
