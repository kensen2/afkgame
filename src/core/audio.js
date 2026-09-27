// Ses dosyası gerektirmeyen, WebAudio ile üretilen ses efektleri + ortam sesi.
let ctx = null, master = null, ambient = null;
let enabled = true;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

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
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', f1 = freq, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

const SFX = {
  swing: () => noise({ dur: 0.16, vol: 0.25, freq: 2500, f1: 600, q: 0.8 }),
  hit: () => { noise({ dur: 0.12, vol: 0.4, freq: 900, f1: 200, q: 1.2 }); tone({ type: 'square', f0: 140, f1: 60, dur: 0.1, vol: 0.15 }); },
  crit: () => { noise({ dur: 0.18, vol: 0.5, freq: 1800, f1: 300, q: 1 }); tone({ type: 'sawtooth', f0: 220, f1: 50, dur: 0.18, vol: 0.2 }); },
  hurt: () => tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.15, vol: 0.18 }),
  bones: () => { for (let i = 0; i < 4; i++) tone({ type: 'triangle', f0: 600 + Math.random() * 500, f1: 300, dur: 0.06, vol: 0.12, delay: i * 0.05 }); },
  die: () => noise({ dur: 0.4, vol: 0.3, freq: 400, f1: 80, q: 0.7 }),
  coin: () => { tone({ type: 'sine', f0: 1320, dur: 0.08, vol: 0.12 }); tone({ type: 'sine', f0: 1760, dur: 0.15, vol: 0.12, delay: 0.06 }); },
  cast: () => { tone({ type: 'sine', f0: 300, f1: 900, dur: 0.3, vol: 0.12 }); noise({ dur: 0.3, vol: 0.1, freq: 3000, q: 4 }); },
  bolt: () => noise({ dur: 0.1, vol: 0.2, freq: 3000, f1: 1500, q: 2 }),
  skill: () => { tone({ type: 'square', f0: 200, f1: 400, dur: 0.2, vol: 0.12 }); noise({ dur: 0.25, vol: 0.25, freq: 1200, f1: 300 }); },
  roar: () => { tone({ type: 'sawtooth', f0: 110, f1: 70, dur: 0.6, vol: 0.25 }); noise({ dur: 0.6, vol: 0.3, freq: 500, f1: 150, q: 0.5 }); },
  shield: () => { tone({ type: 'triangle', f0: 520, f1: 780, dur: 0.35, vol: 0.15 }); tone({ type: 'triangle', f0: 780, dur: 0.3, vol: 0.1, delay: 0.08 }); },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.15, delay: i * 0.09 })),
  wave: () => { tone({ type: 'sawtooth', f0: 110, dur: 0.5, vol: 0.12 }); tone({ type: 'sawtooth', f0: 165, dur: 0.5, vol: 0.1, delay: 0.1 }); },
  boss: () => { [110, 104, 98].forEach((f, i) => tone({ type: 'sawtooth', f0: f, f1: f * 0.9, dur: 0.7, vol: 0.2, delay: i * 0.35 })); noise({ dur: 1.2, vol: 0.2, freq: 200, f1: 60 }); },
  buy: () => { tone({ type: 'sine', f0: 880, dur: 0.08, vol: 0.12 }); tone({ type: 'sine', f0: 1320, dur: 0.12, vol: 0.12, delay: 0.07 }); },
  denied: () => tone({ type: 'square', f0: 160, f1: 120, dur: 0.15, vol: 0.1 }),
  click: () => tone({ type: 'sine', f0: 700, dur: 0.05, vol: 0.08 }),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.15, delay: i * 0.18 })),
};

export const Audio = {
  play(name) {
    if (!enabled) return;
    if (!ensure()) return;
    SFX[name]?.();
  },
  setEnabled(v) {
    enabled = v;
    if (master) master.gain.value = v ? 0.5 : 0;
  },
  get enabled() { return enabled; },
  startAmbient() {
    if (!ensure() || ambient) return;
    // alçak zindan uğultusu + hafif rüzgar
    const g = ctx.createGain(); g.gain.value = 0.06; g.connect(master);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.7;
    o1.connect(g); o2.connect(g); o1.start(); o2.start();
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(4); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    s.connect(f); f.connect(g2); g2.connect(master); s.start();
    ambient = { g, g2 };
  },
};
