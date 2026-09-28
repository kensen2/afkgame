// Ses sistemi: gerçek ses dosyaları (Kenney, CC0) + müzik (Kevin MacLeod, CC BY 4.0).
// Dosyası olmayan birkaç efekt (büyü, kükreme vb.) hâlâ kodla üretiliyor.
let ctx = null, master = null, sfxBus = null, ambient = null;
let sfxOn = true, musicOn = true;
let sfxVol = 0.1, musicVol = 0.1;   // 0..1 (ayarlar ekranındaki çubuklar)
const SFX_BASE = 0.7, MUSIC_BASE = 0.6;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_BASE * sfxVol; sfxBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---------------------------------------------------------------------
// Dosyadan çalınan efektler. Her olay için birkaç varyant; her çalışta
// rastgele biri seçilir ve perdesi hafifçe değiştirilir (tekrar hissi olmasın).
// ---------------------------------------------------------------------
const BANK = {
  // Vuruşlar: metal çınlaması yok; tok gövde darbesi + tahta/taş kırılma + alçak "güm"
  hit:    { files: ['impactSoft_medium_000', 'impactSoft_medium_001'], vol: 0.9, pitch: [0.8, 1.05], gap: 45,
            layer: { files: ['impactWood_light_002', 'impactWood_light_003', 'impactWood_heavy_000'], vol: 0.55 },
            thump: { f0: 150, vol: 0.6 } },
  crit:   { files: ['impactWood_heavy_000'], vol: 1.0, pitch: [0.75, 0.9], gap: 60,
            layer: { files: ['impactMining_002', 'impactMining_004'], vol: 0.75 },
            thump: { f0: 120, vol: 0.9, dur: 0.24 } },
  hurt:   { files: ['impactSoft_medium_000', 'impactSoft_medium_001'], vol: 0.7, pitch: [0.6, 0.75], gap: 90,
            thump: { f0: 110, vol: 0.5 } },
  bones:  { files: ['impactMining_002', 'impactMining_004', 'impactWood_light_002', 'impactWood_light_003'], vol: 0.7, pitch: [0.8, 1.1], gap: 50 },
  die:    { files: ['impactSoft_medium_001', 'dropLeather'], vol: 0.7, pitch: [0.6, 0.8], gap: 60, thump: { f0: 100, vol: 0.5, dur: 0.2 } },
  coin:   { files: ['handleCoins', 'handleCoins2'], vol: 0.22, pitch: [1.0, 1.25], gap: 120 },
  buy:    { files: ['handleCoins2'], vol: 0.55, pitch: [1, 1], gap: 50 },
  shield: { files: ['impactWood_heavy_000'], vol: 1.0, pitch: [0.6, 0.7], gap: 80,
            layer: { files: ['impactSoft_medium_000'], vol: 0.8 }, thump: { f0: 100, vol: 0.85, dur: 0.25 } },
  skill:  { files: ['impactWood_heavy_000'], vol: 1.0, pitch: [0.7, 0.85], gap: 80,
            layer: { files: ['impactMining_004'], vol: 0.7 }, thump: { f0: 100, vol: 0.85, dur: 0.26 } },
  bolt:   { files: ['metalClick'], vol: 0.45, pitch: [0.9, 1.1], gap: 120 },
  levelup:{ files: ['maximize_006'], vol: 0.7, pitch: [1, 1], gap: 300, layer: { files: ['confirmation_004'], vol: 0.6 } },
  wave:   { files: ['doorOpen_2'], vol: 0.55, pitch: [0.8, 0.9], gap: 500 },
  click:  { files: ['click_002', 'select_001'], vol: 0.45, pitch: [0.95, 1.05], gap: 40 },
  denied: { files: ['error_006'], vol: 0.5, pitch: [1, 1], gap: 150 },
  page:   { files: ['bookFlip2'], vol: 0.5, pitch: [0.95, 1.05], gap: 80 },
};
const buffers = {};   // dosya adı -> AudioBuffer
const lastPlay = {};

export async function loadSounds(base = 'assets/audio/sfx/') {
  if (!ensure()) return;
  const names = new Set();
  for (const b of Object.values(BANK)) { b.files.forEach((f) => names.add(f)); b.layer?.files.forEach((f) => names.add(f)); }
  await Promise.all([...names].map(async (n) => {
    try {
      const r = await fetch(`${base}${n}.ogg`);
      const data = await r.arrayBuffer();
      buffers[n] = await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
    } catch (e) { /* dosya yüklenemezse kodla üretilen ses çalınır */ }
  }));
}

function playBuffer(name, vol, rate, delay = 0) {
  const buf = buffers[name];
  if (!buf) return false;
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(sfxBus); s.start(ctx.currentTime + delay);
  return true;
}

function playBank(key) {
  const b = BANK[key];
  if (!b) return false;
  const now = performance.now();
  if (now - (lastPlay[key] || 0) < b.gap) return true; // çok sık çalma (2x hızda kakofoniyi önler)
  const file = b.files[Math.floor(Math.random() * b.files.length)];
  const rate = b.pitch[0] + Math.random() * (b.pitch[1] - b.pitch[0]);
  if (!playBuffer(file, b.vol, rate)) return false;
  lastPlay[key] = now;
  if (b.layer) {
    const lf = b.layer.files[Math.floor(Math.random() * b.layer.files.length)];
    playBuffer(lf, b.layer.vol, rate);
  }
  if (b.thump) thump(b.thump.f0 * rate, b.thump.vol, b.thump.dur || 0.16);
  return true;
}

// ---------------------------------------------------------------------
// Kodla üretilen sesler (dosyası olmayanlar için)
// ---------------------------------------------------------------------
function noiseBuffer(dur) {
  const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.3, attack = 0.005, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
function noise({ dur = 0.2, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', f1 = freq, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t);
}
// Vuruşa ağırlık veren kısa, alçak "tok" ses
function thump(f0, vol, dur) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(40, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}

// Kılıç savurma: yüksekten alçağa hızla kayan kısa bir "vuş"
function whoosh() {
  const t = ctx.currentTime, dur = 0.16 + Math.random() * 0.04;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
  const hi = 2600 + Math.random() * 900;
  f.frequency.setValueAtTime(hi, t); f.frequency.exponentialRampToValueAtTime(380, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t);
}

// Not: burada gürültü (hışırtı) üreten hiçbir ses yok; sadece temiz tonlar.
const SYNTH = {
  cast: () => { const now = performance.now(); if (now - (lastPlay.cast || 0) < 250) return; lastPlay.cast = now;
    tone({ type: 'sine', f0: 260, f1: 520, dur: 0.22, vol: 0.06 }); },
  roar: () => { tone({ type: 'sawtooth', f0: 110, f1: 60, dur: 0.6, vol: 0.18 }); tone({ type: 'sine', f0: 70, f1: 40, dur: 0.6, vol: 0.5 }); },
  boss: () => {
    playBuffer('doorOpen_2', 0.8, 0.6);
    [110, 104, 98].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.8, vol: 0.12, delay: i * 0.35 }));
    thump(90, 0.8, 0.6);
  },
  defeat: () => { playBuffer('minimize_004', 0.6, 0.8); [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.45, vol: 0.14, delay: 0.1 + i * 0.2 })); },
  swing: () => {}, // kılıç savurma sesi yok; sadece vuruş anında tok ses çalar
  // dosya yüklenemezse yedekler (yine gürültüsüz)
  hit: () => thump(150, 0.6, 0.16),
  crit: () => thump(120, 0.9, 0.24),
  hurt: () => thump(110, 0.5, 0.16),
  coin: () => tone({ type: 'sine', f0: 1320, dur: 0.1, vol: 0.1 }),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.15, delay: i * 0.09 })),
};

// ---------------------------------------------------------------------
// Müzik: menü, zindan (iki parça sırayla), boss. Parçalar arası yumuşak geçiş.
// ---------------------------------------------------------------------
const MUSIC = {
  menu: ['menu'],
  dungeon: ['dungeon1', 'dungeon2'],
  boss: ['boss'],
};
const musicTarget = () => (musicOn ? MUSIC_BASE * musicVol : 0);
const music = { mode: null, el: null, idx: 0, fades: [] };

function fadeTo(el, target, ms, onDone) {
  const start = el.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, start + (target - start) * k));
    if (k < 1) requestAnimationFrame(step); else onDone?.();
  };
  step();
}

function startTrack(mode) {
  const list = MUSIC[mode];
  const name = list[music.idx % list.length];
  const el = new window.Audio(`assets/audio/music/${name}.mp3`);
  el.loop = list.length === 1;
  el.volume = 0;
  el.addEventListener('ended', () => {
    if (music.el !== el) return;
    music.idx++;
    startTrack(mode);
  });
  el.play().then(() => fadeTo(el, musicTarget(), 1500)).catch(() => { /* kullanıcı etkileşimi bekleniyor */ });
  music.el = el;
}

export const Audio = {
  play(name) {
    if (!sfxOn || !ensure()) return;
    if (playBank(name)) return;
    SYNTH[name]?.();
  },
  setEnabled(v) { sfxOn = v; },
  get enabled() { return sfxOn; },

  setMusicEnabled(v) {
    musicOn = v;
    if (music.el) fadeTo(music.el, musicTarget(), 400);
  },
  get musicEnabled() { return musicOn; },

  setMusicVolume(v) {
    musicVol = Math.max(0, Math.min(1, v));
    if (music.el) music.el.volume = musicTarget();
  },
  setSfxVolume(v) {
    sfxVol = Math.max(0, Math.min(1, v));
    if (sfxBus) sfxBus.gain.value = SFX_BASE * sfxVol;
  },

  // mode: 'menu' | 'dungeon' | 'boss' | null (sessiz)
  setMusic(mode) {
    if (music.mode === mode) {
      if (music.el?.paused && mode) music.el.play().catch(() => {});
      return;
    }
    music.mode = mode;
    const old = music.el;
    if (old) fadeTo(old, 0, 900, () => { old.pause(); old.src = ''; });
    music.el = null;
    if (!mode) return;
    if (mode === 'dungeon') music.idx = Math.floor(Math.random() * MUSIC.dungeon.length); else music.idx = 0;
    startTrack(mode);
  },

  startAmbient() { /* sürekli arka plan uğultusu kaldırıldı (hışırtı yapıyordu) */ },
};
