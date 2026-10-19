// =====================================================================
//  Hikaye sahneleri ("The Ember Watch"). Oyunun kendi sahnesinde, kendi modelleriyle oynar.
//  - Her sahne oyuncu başına BİR KEZ (Economy.data.storySeen). Reset silmez, admin "wipe" siler.
//  - Ayarlardan kapatılabilir (settings.story). Tıklama / tuş atlar (ilk 350 ms hariç).
//  - Otomatik testlerde ve "hareketi azalt" ayarında oynamaz; ?story=1 zorla açar, ?story=again görülmüşü de oynatır.
//  Sahne çalışırken oyun durur (game.cine), kamera sahnenin elindedir, HUD gizlenir.
// =====================================================================
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Economy } from '../systems/economy.js';
import { Audio } from '../core/audio.js';
import { cloneDungeon } from '../core/assets.js';

const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const FORCE = QS.has('story'), AGAIN = QS.get('story') === 'again';
const BLOCKED = !FORCE && (navigator.webdriver || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Kamera yolu: [{ t, pos, look }] arasında yumuşak geçiş
function cameraAt(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = ease(THREE.MathUtils.clamp((t - a.t) / Math.max(0.001, b.t - a.t), 0, 1));
  return { pos: v3(a.pos).lerp(v3(b.pos), k), look: v3(a.look).lerp(v3(b.look), k) };
}

// Duvara "yakılmış" yazı: kor rengi, parlayan
function burnedText(lines, w = 4.2, h = 1.1) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 268;
  const g = c.getContext('2d');
  // arkada is lekesi (yazı açık duvarda da okunsun)
  const sc = g.createRadialGradient(512, 134, 20, 512, 134, 520);
  sc.addColorStop(0, 'rgba(10,5,2,0.85)'); sc.addColorStop(0.55, 'rgba(10,5,2,0.55)'); sc.addColorStop(1, 'rgba(10,5,2,0)');
  g.fillStyle = sc; g.fillRect(0, 0, 1024, 268);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 600 62px Georgia, "Times New Roman", serif';
  lines.forEach((ln, i) => {
    const y = 134 + (i - (lines.length - 1) / 2) * 92;
    g.shadowColor = 'rgba(255,110,30,0.95)'; g.shadowBlur = 26; g.fillStyle = '#ffb060'; g.fillText(ln, 512, y);
    g.shadowBlur = 6; g.fillStyle = '#ffe2b0'; g.fillText(ln, 512, y);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.renderOrder = 5;
  m.userData.dispose = () => { tex.dispose(); m.geometry.dispose(); m.material.dispose(); };
  return m;
}

// Uzakta titreyen fener: model + ışık + parıltı
function lantern(game, color = 0xff9a3c) {
  const g = new THREE.Group();
  const model = cloneDungeon('candle_lit'); model.scale.setScalar(1.4); g.add(model);
  const light = new THREE.PointLight(color, 0, 9, 1.6); light.position.y = 0.9; g.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.dungeon.flameTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(1.6, 1.6, 1); glow.position.y = 0.9; g.add(glow);
  g.userData = { light, glow, model };
  return g;
}

// ---------------- Sahneler ----------------
const SCENES = {
  // İlk oyun: yerde Lyra'nın yırtık sancağı → kapıya yakılmış son mesajı → koridorun dibinde kaybolan fener
  intro(game) {
    const x0 = game.hero ? game.hero.pos.x : 0;
    const root = new THREE.Group(); root.position.x = x0;
    const banner = cloneDungeon('banner_shield_blue');
    banner.rotation.set(-Math.PI / 2 + 0.12, 0, 0.5); banner.position.set(3.2, 0.06, 1.0);
    const sword = cloneDungeon('sword_shield_broken'); sword.position.set(4.3, 0, 1.6); sword.rotation.y = -0.8;
    const warm = new THREE.PointLight(0xffa860, 0, 6, 1.8); warm.position.set(3.4, 1.4, 1.6);
    const text = burnedText(['They took the Sigil.', 'They took me.']);
    text.position.set(3.6, 2.7, -3.25);
    const lamp = lantern(game); lamp.position.set(18, 0, -1.4);
    root.add(banner, sword, warm, text, lamp);
    game.scene.add(root);
    return {
      duration: 10.2,
      cam: [
        { t: 0,   pos: [0.4, 1.9, 5.2], look: [3.4, 0.2, 0.9] },
        { t: 3.0, pos: [1.3, 2.1, 4.4], look: [3.4, 0.3, 0.9] },
        { t: 5.0, pos: [3.0, 2.5, 2.4], look: [3.6, 2.6, -3.3] },
        { t: 7.0, pos: [2.7, 2.4, 2.1], look: [3.6, 2.6, -3.3] },
        { t: 9.0, pos: [0.6, 1.9, 2.2], look: [18, 0.8, -1.4] },
        { t: 10.2, pos: [1.2, 1.9, 2.0], look: [18, 0.8, -1.4] },
      ].map((k) => ({ ...k, pos: [k.pos[0] + x0, k.pos[1], k.pos[2]], look: [k.look[0] + x0, k.look[1], k.look[2]] })),
      sounds: [[0.2, 'torchLight'], [3.4, 'gateSlam'], [8.6, 'steps']],
      update(t) {
        warm.intensity = Math.min(1, t / 0.8) * (2.2 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.12);
        text.material.opacity = THREE.MathUtils.clamp((t - 3.2) / 1.0, 0, 1) * (0.85 + Math.sin(t * 7) * 0.08);
        // fener: 7. saniyede yanar, titrer, 9.6'da söner
        const on = THREE.MathUtils.clamp((t - 6.8) / 0.6, 0, 1) * (1 - THREE.MathUtils.clamp((t - 9.4) / 0.5, 0, 1));
        const fl = 0.75 + Math.sin(t * 13) * 0.15 + Math.sin(t * 31) * 0.1;
        lamp.userData.light.intensity = on * 3.2 * fl;
        lamp.userData.glow.material.opacity = on * 0.9 * fl;
      },
      dispose() { game.scene.remove(root); text.userData.dispose(); lamp.userData.glow.material.dispose(); },
    };
  },
};

export const Story = {
  busy: false,
  _end: null,

  enabled() { return Economy.data.settings.story !== false; },
  seen(id) { return (Economy.data.storySeen || []).includes(id); },
  canPlay(id) { return !!(SCENES[id] || CONFIG.story?.[id]?.video) && !!CONFIG.story?.[id] && this.enabled() && !BLOCKED && (AGAIN || !this.seen(id)) && !this.busy; },

  // Sahneyi oynat. done: sahne bitince (ya da oynamazsa hemen) çağrılır.
  play(id, game, done) {
    if (!this.canPlay(id)) { done?.(); return false; }
    const d = Economy.data;
    if (!d.storySeen) d.storySeen = [];
    if (!d.storySeen.includes(id)) d.storySeen.push(id);   // başta işaretle: sahne yarıda kalsa da tekrar çıkmasın
    Economy.save();

    const def = CONFIG.story[id];
    if (def.video) return this._playVideo(def, game, done);
    const sc = SCENES[id](game);
    const el = $('story'), cap = $('story-cap'), bars = el.querySelectorAll('.story-bar'), fadeEl = el.querySelector('.story-fade');
    cap.replaceChildren();
    const lines = def.lines.map((l) => {
      const e = document.createElement('div');
      e.className = 'story-line' + (l.quote ? ' quote' : '');
      e.textContent = l.text; cap.append(e);
      return { ...l, el: e };
    });
    el.className = 'story';
    document.body.classList.add('cine');
    const musicVol = d.settings.musicVol ?? 0.1;
    Audio.setMusicVolume(musicVol * 0.35);
    this.busy = true;

    // Her şey sahne zamanına (t) bağlı: aynı t her zaman aynı görüntü (video çekimi de bu yüzden kare kare tutarlı)
    const D = sc.duration, FADE = 0.5;
    const cl = (x) => Math.min(1, Math.max(0, x));
    let t = 0, ended = false;
    const sounds = [...(sc.sounds || [])];
    const finish = () => {
      if (ended) return; ended = true;
      game.cine = null;
      sc.dispose();
      el.className = 'story hidden';
      document.body.classList.remove('cine');
      Audio.setMusicVolume(musicVol);
      window.removeEventListener('keydown', skip, true); el.removeEventListener('pointerdown', skip);
      this.busy = false; this._end = null;
      done?.();
    };
    // atla: sondaki kararmaya geç (yarım saniyede kapanır)
    const skip = (e) => { if (t < 0.35) return; e.preventDefault?.(); e.stopPropagation?.(); if (t < D - FADE) { t = D - FADE; sounds.length = 0; } };
    window.addEventListener('keydown', skip, true); el.addEventListener('pointerdown', skip);
    this._end = finish;

    game.cine = {
      get t() { return t; },
      tick: (dt) => {
        t = Math.min(D, t + dt);
        const c = cameraAt(sc.cam, t);
        game.camera.position.copy(c.pos); game.camera.lookAt(c.look);
        game.dungeon.update(game.hero ? game.hero.pos.x : 0, dt);
        sc.update(t);
        while (sounds.length && t >= sounds[0][0]) Audio.play(sounds.shift()[1]);
        const bar = cl(t / 0.7) * cl((D - t) / 0.35);
        bars[0].style.transform = `translateY(${-100 * (1 - bar)}%)`; bars[1].style.transform = `translateY(${100 * (1 - bar)}%)`;
        lines.forEach((l, i) => {
          const until = i < lines.length - 1 ? lines[i + 1].at - 0.55 : D;
          const op = cl((t - l.at) / FADE) * cl((until - t) / FADE);
          l.el.style.opacity = op; l.el.style.transform = `translateY(${(1 - cl((t - l.at) / FADE)) * 6}px)`;
        });
        fadeEl.style.opacity = cl((t - (D - FADE)) / FADE);
        if (t >= D) finish();
      },
    };
    game.cine.tick(0);
    return true;
  },

  // Hazır film (oyun motorunda çekilmiş video). Alt yazı ve sesler videonun zamanına bağlı.
  _playVideo(def, game, done) {
    const d = Economy.data, el = $('story'), cap = $('story-cap'), bars = el.querySelectorAll('.story-bar'), fadeEl = el.querySelector('.story-fade');
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto' });
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const src = document.createElement('source'); src.src = `${def.video}.${ext}`; src.type = type; v.append(src);
    }
    v.className = 'story-video'; v.setAttribute('playsinline', '');
    el.prepend(v);
    cap.replaceChildren();
    const lines = def.lines.map((l) => { const e = document.createElement('div'); e.className = 'story-line' + (l.quote ? ' quote' : ''); e.textContent = l.text; cap.append(e); return { ...l, el: e }; });
    el.className = 'story';
    document.body.classList.add('cine');
    const musicVol = d.settings.musicVol ?? 0.1;
    Audio.setMusicVolume(musicVol * 0.35);
    this.busy = true;
    const cl = (x) => Math.min(1, Math.max(0, x)), FADE = 0.5;
    const sounds = [...(def.sounds || [])];
    let ended = false, closing = 0;
    const finish = () => {
      if (ended) return; ended = true;
      game.cine = null; v.pause(); v.remove();
      el.className = 'story hidden'; fadeEl.style.opacity = 0;
      document.body.classList.remove('cine');
      Audio.setMusicVolume(musicVol);
      window.removeEventListener('keydown', skip, true); el.removeEventListener('pointerdown', skip);
      this.busy = false; this._end = null;
      done?.();
    };
    const skip = (e) => { if (v.currentTime < 0.35 && !v.error) return; e.preventDefault?.(); e.stopPropagation?.(); if (!closing) closing = performance.now(); sounds.length = 0; };
    window.addEventListener('keydown', skip, true); el.addEventListener('pointerdown', skip);
    v.addEventListener('ended', () => { if (!closing) closing = performance.now(); });
    v.querySelector('source:last-child').addEventListener('error', () => finish());   // iki biçim de açılamazsa geç
    v.play().catch(() => finish());
    this._end = finish;
    // oyun durur ve çizilmez (video ekranı kaplar); her karede alt yazı/ses/şeritler videonun zamanına göre
    game.cine = {
      hide: true,
      get t() { return v.currentTime; },
      tick: () => {
        const t = v.currentTime, D = v.duration || 99;
        while (sounds.length && t >= sounds[0][0]) Audio.play(sounds.shift()[1]);
        const bar = cl(t / 0.7);
        bars[0].style.transform = `translateY(${-100 * (1 - bar)}%)`; bars[1].style.transform = `translateY(${100 * (1 - bar)}%)`;
        lines.forEach((l, i) => {
          const until = i < lines.length - 1 ? lines[i + 1].at - 0.55 : D - 0.4;
          l.el.style.opacity = cl((t - l.at) / FADE) * cl((until - t) / FADE);
          l.el.style.transform = `translateY(${(1 - cl((t - l.at) / FADE)) * 6}px)`;
        });
        const out = closing ? cl((performance.now() - closing) / (FADE * 1000)) : 0;
        fadeEl.style.opacity = out;
        if (closing && out >= 1) finish();
      },
    };
    return true;
  },

  // Test ve araçlar için: sahnenin t. saniyesine atla
  _seek(game, sec) { if (game.cine) game.cine.tick(sec); },
};
