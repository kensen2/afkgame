// =====================================================================
//  ULTIMATE YETENEKLER (4. özel yetenek, uzun bekleme süresi)
//   - Inferno (Aslan Kılıçlı): altın girdap → alev sütunu → kenarı parlayan, ortadan dışa
//     doğru sönen yanık zemin. İçindeki düşmanlar her saniye yanar.
//   - Boulder Toss (Varior): yeşil aura, yerden kaya koparıp başının üstüne kaldırır,
//     yerde nişan yayı ve iniş halkası görünür, kaya fırlatılır; çarpınca toz, kaya parçaları,
//     sersemletme ve yakındaki dekorların kırılıp savrulması.
//  Zamanlama oyun adımına bağlıdır (hit-stop ve duraklatmada bekler).
// =====================================================================
import * as THREE from 'three';

// ---------- dokular ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// alev dili: altı yuvarlak, üstü sivri, ortası beyaza yakın
const flameTex = () => canvasTex(64, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.62, h * 0.5);
  gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.22, 'rgba(255,220,120,0.95)');
  gr.addColorStop(0.5, 'rgba(255,120,30,0.55)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, 2);
  g.bezierCurveTo(w * 0.95, h * 0.45, w * 0.98, h * 0.8, w / 2, h - 2);
  g.bezierCurveTo(w * 0.02, h * 0.8, w * 0.05, h * 0.45, w / 2, 2);
  g.fill();
});
// yumuşak toz bulutu
const smokeTex = () => canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});

// ---------- yanık zemin shader'ı ----------
const groundVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const groundFrag = `
  uniform float uTime; uniform float uGrow; uniform float uBurn; uniform float uFade; uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec2 dir = r > 0.0001 ? p / r : vec2(1.0, 0.0);
    // dalgalı, organik kenar (açıya göre gürültü; dikiş olmasın diye yön vektöründen örneklenir)
    float edge = 0.78 + 0.22 * fbm(dir * 1.7 + uSeed);
    float R = edge * uGrow;
    if (r > R) discard;
    float n = fbm(p * 3.5 + uSeed * 1.7);
    // kömürleşmiş iç: koyu, damarlı
    vec3 col = mix(vec3(0.035, 0.02, 0.02), vec3(0.16, 0.06, 0.03), n);
    // yanma cephesi merkezden dışa ilerler: önündeki bölge hâlâ kızgın
    float front = uBurn * R;
    float hot = smoothstep(front - 0.12, front + 0.06, r);
    col += vec3(1.0, 0.32, 0.05) * hot * (0.12 + 0.3 * n * n) * (0.85 + 0.15 * sin(uTime * 7.0 + n * 9.0));
    // kor kıvılcımları
    float e = step(0.9, noise(p * 26.0 + floor(uTime * 3.0)));
    col += vec3(1.0, 0.6, 0.2) * e * (0.6 + 0.4 * sin(uTime * 9.0 + p.x * 40.0)) * (0.4 + hot);
    // parlayan kenar çizgisi
    float rim = smoothstep(R - 0.07, R - 0.01, r);
    col += vec3(1.0, 0.72, 0.3) * rim * 1.6;
    float a = (0.86 + 0.14 * rim) * uFade;
    gl_FragColor = vec4(col, a);
  }`;

// Kaya geometrisi: köşeli, düzensiz (low-poly KayKit havasına uygun)
function rockGeo(radius, detail, seed) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 0.78 + 0.38 * h(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100));
    v.multiplyScalar(k); v.y *= 0.86;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const enemiesWithin = (game, x, z, r) => game.enemies.filter((e) => !e.dead && e.active && Math.hypot(e.pos.x - x, e.pos.z - z) <= r + e.radius);

// En kalabalık düşman grubunun merkezi (boss 3 sayılır)
function clusterCenter(game, r) {
  const alive = game.enemies.filter((e) => !e.dead && e.active);
  if (!alive.length) return null;
  let best = null, bestScore = -1;
  for (const e of alive) {
    let score = 0;
    for (const o of alive) if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= r) score += o.rank === 'boss' ? 3 : 1;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  const group = alive.filter((o) => Math.hypot(o.pos.x - best.pos.x, o.pos.z - best.pos.z) <= r);
  const c = new THREE.Vector3();
  for (const o of group) c.add(o.pos);
  c.multiplyScalar(1 / group.length); c.y = 0;
  return { center: c, count: bestScore };
}

export class Ultimates {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.flameTex = flameTex();
    this.smokeTex = smokeTex();
    this.parts = [];      // alev / duman sprite'ları
    this.pool = { add: [], norm: [] };
    this.zones = [];      // yanan zeminler
    this.chunks = [];     // kaya parçaları
    this.boulders = [];   // kaldırılan/uçan kayalar
    this.timers = [];
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0xb2a08c, roughness: 0.9, flatShading: true, emissive: 0x2aff7a, emissiveIntensity: 0 });
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x9c8a78, roughness: 1, flatShading: true });
    this.chunkGeos = [rockGeo(0.2, 0, 1), rockGeo(0.28, 0, 2), rockGeo(0.16, 0, 3)];
  }

  // ---------------- yardımcılar ----------------
  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  _sprite(additive) {
    const key = additive ? 'add' : 'norm';
    let s = this.pool[key].pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: additive ? this.flameTex : this.smokeTex, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      s.userData.key = key;
    }
    this.scene.add(s);
    return s;
  }
  // alev dili
  flame(pos, { w = 0.6, h = 1.2, vy = 1.6, life = 0.6, color = 0xff9a3a, vx = 0, vz = 0 } = {}) {
    const s = this._sprite(true);
    s.material.color.set(color); s.material.opacity = 1;
    s.position.copy(pos);
    s.center.set(0.5, 0.1);                       // tabandan büyüsün
    s.scale.set(w, h, 1);
    this.parts.push({ s, v: new THREE.Vector3(vx, vy, vz), life, max: life, w, h, kind: 'flame', g: 0 });
  }
  // toz bulutu
  smoke(pos, { size = 1.4, grow = 2.2, life = 1.2, color = 0x9a8f86, v = null, opacity = 0.55 } = {}) {
    const s = this._sprite(false);
    s.material.color.set(color); s.material.opacity = opacity;
    s.position.copy(pos); s.center.set(0.5, 0.5);
    s.scale.set(size, size, 1);
    this.parts.push({ s, v: v || new THREE.Vector3((Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 2), life, max: life, size, grow, op: opacity, kind: 'smoke', g: 0 });
  }
  chunk(pos, v, scale = 1) {
    const m = new THREE.Mesh(this.chunkGeos[Math.floor(Math.random() * this.chunkGeos.length)], this.chunkMat);
    m.position.copy(pos); m.scale.setScalar(scale);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.chunks.push({ m, v, spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), life: 1.6 + Math.random() * 0.6, t: 0, s0: scale });
  }

  // ---------------- karar: hazır mı? ----------------
  ready(h, def) {
    const g = this.game;
    const c = clusterCenter(g, def.radius);
    if (!c) return false;
    // Inferno kahramanın yakınına iner: grup 5 birimden yakın değilse bekle
    if (def.id === 'inferno') return Math.hypot(c.center.x - h.pos.x, c.center.z - h.pos.z) < 5 && (c.count >= 3 || g.bossAlive());
    return c.count >= 3 || g.bossAlive();
  }

  cast(h, def) {
    const c = clusterCenter(this.game, def.radius);
    if (!c) return false;
    if (def.id === 'inferno') return this._inferno(h, def, c.center);
    if (def.id === 'boulder') return this._boulder(h, def, c.center);
    return false;
  }

  // ================= INFERNO =================
  _inferno(h, def, center) {
    const g = this.game, fx = g.fx;
    // merkez kahramandan en fazla 5 birim uzakta olsun
    const d = new THREE.Vector3(center.x - h.pos.x, 0, center.z - h.pos.z);
    if (d.length() > 5) center = h.pos.clone().add(d.setLength(5)).setY(0);
    h.setFacing(Math.sign(center.x - h.pos.x) || h.facing);
    h.casting = 0.55;
    h.play('attack', true, 1.4);
    // 1) altın girdap ve uyarı halkası
    fx.slash(h.pos.clone().setY(0.6), { ground: true, full: true, color: 0xffc860, radius: 1.2, width: 0.7, dur: 0.45 });
    fx.slash(h.pos.clone().setY(1.2), { ground: true, full: true, color: 0xffffff, radius: 0.8, width: 0.4, dur: 0.4 });
    for (let i = 0; i < 4; i++) this.after(i * 0.1, () => fx.aura(h.pos.clone().setY(0.2), 0xffd27a, 4, 0.9));
    fx.ring(center, { color: 0xffd060, radius: def.radius * 1.15, life: 0.5 });
    g.audio.play('ultCharge');
    // 2) patlama
    this.after(0.45, () => {
      const R = def.radius;
      const c = center.clone().setY(0.05);
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 1.1;
        this.flame(new THREE.Vector3(c.x + Math.cos(a) * rr, 0.1, c.z + Math.sin(a) * rr * 0.8), {
          w: 0.8 + Math.random() * 0.9, h: 1.8 + Math.random() * 2.6, vy: 4 + Math.random() * 6, life: 0.45 + Math.random() * 0.35,
          color: Math.random() < 0.5 ? 0xffb347 : 0xff7a2a, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 0.8,
        });
      }
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        this.flame(new THREE.Vector3(c.x + Math.cos(a) * R * 0.5, 0.1, c.z + Math.sin(a) * R * 0.4), {
          w: 0.6, h: 1.1 + Math.random() * 0.8, vy: 1.5, life: 0.5, color: 0xff8a33, vx: Math.cos(a) * 5, vz: Math.sin(a) * 3,
        });
      }
      fx.impact(c.clone().setY(1.6), { color: 0xffe9a0, size: 7, life: 0.2 });
      fx.burst(c.clone().setY(0.8), { count: 34, color: 0xffa53a, speed: 7, up: 6, size: 0.5, life: 0.8 });
      fx.ring(c, { color: 0xff8a2a, radius: R * 1.2, life: 0.55, width: 0.5 });
      fx.ring(c, { color: 0xffe08a, radius: R * 0.7, life: 0.35 });
      fx.shake(0.9); g.hitStop(0.1); g.audio.play('inferno');
      for (const e of enemiesWithin(g, c.x, c.z, R)) {
        const { dmg, crit } = h.rollDamage(def.power);
        e.takeDamage(dmg, g, crit);
        const k = new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z); if (k.lengthSq() < 0.01) k.set(1, 0, 0);
        e.knockback(k.normalize(), 1.4);
      }
      this._addZone(c, def, h);
    });
    return true;
  }

  _addZone(c, def, h) {
    const R = def.radius;
    const mat = new THREE.ShaderMaterial({
      vertexShader: groundVert, fragmentShader: groundFrag,
      uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, uBurn: { value: 0 }, uFade: { value: 1 }, uSeed: { value: Math.random() * 10 } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.3, R * 2.3), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, 0.06, c.z);
    m.renderOrder = 2;
    this.scene.add(m);
    this.zones.push({ m, c: c.clone(), R, t: 0, dur: def.dur, tick: 0.5, def, hero: h, spawn: 0 });
  }

  _updateZones(dt) {
    const g = this.game;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      const u = z.m.material.uniforms;
      u.uTime.value += dt;
      u.uGrow.value = Math.min(1, z.t / 0.35) * 0.87;           // geometri R*1.15; kenar ~R
      u.uBurn.value = Math.min(1, Math.max(0, (z.t - 0.3) / (z.dur * 0.75)));   // merkez önce söner, ateş kenara çekilir
      const fadeK = Math.max(0, (z.t - (z.dur - 0.9)) / 0.9);
      u.uFade.value = 1 - fadeK;
      // alevler: yanma cephesinin dışında kalan halkada
      const life = 1 - fadeK;
      z.spawn += dt * 55 * life;
      const front = u.uBurn.value;
      while (z.spawn >= 1) {
        z.spawn -= 1;
        const a = Math.random() * Math.PI * 2;
        const rk = front + (1 - front) * Math.sqrt(Math.random());
        const rr = Math.min(0.92, Math.max(0.12, rk)) * z.R * 0.95;
        this.flame(new THREE.Vector3(z.c.x + Math.cos(a) * rr, 0.08, z.c.z + Math.sin(a) * rr), {
          w: 0.45 + Math.random() * 0.45, h: 0.8 + Math.random() * 1.1, vy: 0.9 + Math.random() * 1.2, life: 0.45 + Math.random() * 0.35,
          color: Math.random() < 0.6 ? 0xff8a2a : 0xffc04a,
        });
      }
      // yanma hasarı: saniyede bir
      z.tick -= dt;
      if (z.tick <= 0 && z.t < z.dur - 0.3 && z.hero && !z.hero.dead) {
        z.tick += 1;
        for (const e of enemiesWithin(g, z.c.x, z.c.z, z.R * 0.95)) {
          const { dmg } = z.hero.rollDamage(z.def.burn);
          e.takeDamage(dmg, g, false);
          g.fx.burst(e.pos.clone().setY(0.9), { count: 6, color: 0xff7a2a, speed: 2, up: 2.5, size: 0.4, life: 0.5 });
        }
      }
      if (z.t >= z.dur) { this.scene.remove(z.m); z.m.geometry.dispose(); z.m.material.dispose(); this.zones.splice(i, 1); }
    }
  }

  // ================= BOULDER TOSS =================
  _boulder(h, def, target) {
    const g = this.game, fx = g.fx;
    h.setFacing(Math.sign(target.x - h.pos.x) || h.facing);
    const LIFT = 0.85;
    h.casting = LIFT + 0.15;
    const mesh = new THREE.Mesh(rockGeo(1.05, 1, Math.random() * 100), this.rockMat.clone());
    const start = h.pos.clone().add(new THREE.Vector3(h.facing * 0.5, -1.0, 0.35));
    const top = h.pos.clone().add(new THREE.Vector3(0, (h.def.height || 2.4) + 1.35, 0.25));
    mesh.position.copy(start);
    mesh.castShadow = true;
    this.scene.add(mesh);
    // nişan: yeşil yay + iniş halkası
    const aim = this._aimArc(top, target, def.radius);
    const b = { mesh, h, def, target: target.clone(), start, top, t: 0, phase: 'lift', LIFT, aim, spin: new THREE.Vector3(0.8, 1.6, 0.4) };
    this.boulders.push(b);
    // yeşil aura ve yerden kopma
    fx.slash(h.pos.clone().setY(0.4), { ground: true, full: true, color: 0x5dff8a, radius: 1.15, width: 0.6, dur: 0.5 });
    fx.ring(h.pos, { color: 0x5dff8a, radius: 2.2, life: 0.6 });
    for (let i = 0; i < 8; i++) this.after(i * 0.1, () => fx.aura(h.pos.clone().setY(0.1), 0x6dff9a, 3, 0.8));
    this.after(0.35, () => fx.slash(h.pos.clone().setY(0.5), { ground: true, full: true, color: 0x9dffb5, radius: 0.9, width: 0.45, dur: 0.45 }));
    const ground = start.clone().setY(0.2);
    fx.burst(ground, { count: 18, color: 0x9a8a78, speed: 3, up: 3, size: 0.45, life: 0.6 });
    for (let i = 0; i < 6; i++) this.chunk(ground.clone(), new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 2), 0.7);
    for (let i = 0; i < 3; i++) this.smoke(ground.clone().setY(0.5), { size: 1.2, grow: 1.6, life: 0.9, opacity: 0.45 });
    g.audio.play('boulderLift');
    g.fx.shake(0.3);
    return true;
  }

  _aimArc(from, to, radius) {
    const mid = from.clone().lerp(to, 0.5); mid.y = Math.max(from.y, 1) + 2.6;
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone().setY(0.15));
    const mat = new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.045, 5, false), mat);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.93, radius, 56), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(to.x, 0.09, to.z);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.93, 48), new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2; inner.position.set(to.x, 0.08, to.z);
    this.scene.add(tube, ring, inner);
    return { tube, ring, inner, curve };
  }
  _removeAim(a) {
    for (const m of [a.tube, a.ring, a.inner]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }

  _updateBoulders(dt) {
    const g = this.game;
    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      b.t += dt;
      const m = b.mesh;
      m.rotation.x += b.spin.x * dt; m.rotation.y += b.spin.y * dt; m.rotation.z += b.spin.z * dt;
      if (b.phase === 'lift') {
        const k = Math.min(1, b.t / b.LIFT);
        const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);   // hafif fazla yükselip oturur
        // kaya kahramanın üstünü takip eder (kahraman hareketsiz ama sarsıntı vs.)
        b.top.set(b.h.pos.x, (b.h.def.height || 2.4) + 1.35 + Math.sin(b.t * 6) * 0.06, b.h.pos.z + 0.25);
        m.position.lerpVectors(b.start, b.top, Math.min(1.08, e));
        m.material.emissiveIntensity = 0.03 + 0.06 * Math.sin(b.t * 10) ** 2;   // hafif yeşil nabız, taş rengi baskın kalsın
        // nişan görünür olur
        const op = Math.max(0, Math.min(1, (b.t - 0.2) / 0.3));
        b.aim.tube.material.opacity = 0.75 * op;
        b.aim.ring.material.opacity = (0.75 + 0.25 * Math.sin(b.t * 14)) * op;
        b.aim.inner.material.opacity = 0.12 * op;
        if (Math.random() < dt * 8) this.chunk(m.position.clone().add(new THREE.Vector3(0, -0.6, 0)), new THREE.Vector3((Math.random() - 0.5), -1, (Math.random() - 0.5)), 0.45);
        if (Math.random() < dt * 20) g.fx.aura(m.position.clone().add(new THREE.Vector3(0, -0.9, 0)), 0x7dffa5, 1, 0.7);
        if (k >= 1) {
          b.phase = 'fly'; b.t = 0;
          b.from = m.position.clone();
          const to = b.target.clone().setY(0.75);
          const mid = b.from.clone().lerp(to, 0.5); mid.y = Math.max(b.from.y, 1) + 2.6;
          b.curve = new THREE.QuadraticBezierCurve3(b.from, mid, to);
          b.dur = 0.38 + Math.min(0.25, b.from.distanceTo(to) * 0.03);
          b.spin.multiplyScalar(5);
          b.h.play('attack', true, 2.2);
          g.audio.play('swing'); g.fx.shake(0.2);
        }
      } else if (b.phase === 'fly') {
        const k = Math.min(1, b.t / b.dur);
        b.curve.getPoint(k * k * 0.35 + k * 0.65, m.position);        // sona doğru hızlanır
        m.material.emissiveIntensity = Math.max(0, m.material.emissiveIntensity - dt * 1.5);
        const op = 1 - k;
        b.aim.tube.material.opacity = 0.75 * op;
        if (Math.random() < dt * 30) this.smoke(m.position.clone(), { size: 0.7, grow: 1, life: 0.45, opacity: 0.3, v: new THREE.Vector3(0, 0.3, 0) });
        if (k >= 1) { this._land(b); this.boulders.splice(i, 1); }
      }
    }
  }

  _land(b) {
    const g = this.game, fx = g.fx, def = b.def, h = b.h;
    const c = b.target;
    this._removeAim(b.aim);
    this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose();
    // hasar + sersemletme + savurma
    for (const e of enemiesWithin(g, c.x, c.z, def.radius)) {
      const { dmg, crit } = h.rollDamage(def.power);
      e.takeDamage(dmg, g, crit);
      e.applyStun(def.stun);
      const k = new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z); if (k.lengthSq() < 0.01) k.set(1, 0, 0);
      e.knockback(k.normalize(), 2.6);
    }
    // kaya parçalanır
    const p = c.clone().setY(0.6);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
      this.chunk(p.clone(), new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s * 0.7), 0.8 + Math.random() * 1.3);
    }
    // toz bulutu
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
      this.smoke(new THREE.Vector3(c.x + Math.cos(a) * r, 0.6 + Math.random() * 0.5, c.z + Math.sin(a) * r), {
        size: 1.6 + Math.random() * 1.4, grow: 2.6, life: 1.1 + Math.random() * 0.8, opacity: 0.6,
        v: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 2), 0.5 + Math.random(), Math.sin(a) * (1.5 + Math.random() * 1.5)),
      });
    }
    fx.impact(p.clone().setY(1.0), { color: 0xfff4d8, size: 5, life: 0.16 });
    fx.burst(p, { count: 30, color: 0xb8a48c, speed: 8, up: 5, size: 0.5, life: 0.7 });
    fx.ring(c, { color: 0xd8cbb5, radius: def.radius * 1.35, life: 0.5, width: 0.5 });
    fx.ring(c, { color: 0x6dff9a, radius: def.radius, life: 0.35 });
    fx.shake(1.1); g.hitStop(0.12); g.audio.play('boulderHit');
    // yakındaki dekorlar kırılır
    const broken = g.dungeon.breakNear(c.x, c.z, def.radius + 1.6);
    for (const w of broken) {
      fx.burst(w.clone().setY(0.8), { count: 14, color: 0x8a5a32, speed: 5, up: 4, size: 0.4, life: 0.7 });
      this.smoke(w.clone().setY(0.8), { size: 1.4, grow: 1.8, life: 0.9, opacity: 0.45 });
    }
  }

  // ---------------- döngü ----------------
  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    this._updateBoulders(dt);
    this._updateZones(dt);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.s); this.pool[p.s.userData.key].push(p.s); this.parts.splice(i, 1); continue; }
      p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      if (p.kind === 'flame') {
        p.v.x *= 1 - dt * 3; p.v.z *= 1 - dt * 3;
        // doğar, uzar, incelerek söner
        const grow = Math.min(1, (1 - k) * 5);
        p.s.scale.set(p.w * (0.5 + 0.5 * k) * grow, p.h * (0.4 + 0.6 * grow) * (0.6 + 0.4 * k), 1);
        p.s.material.opacity = Math.min(1, k * 1.6);
      } else {
        p.v.multiplyScalar(1 - dt * 1.8);
        const sz = p.size * (1 + (1 - k) * (p.grow - 1));
        p.s.scale.set(sz, sz, 1);
        p.s.material.opacity = p.op * Math.min(1, k * 1.4) * Math.min(1, (1 - k) * 8 + 0.2);
      }
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.t += dt;
      c.v.y -= 24 * dt;
      c.m.position.addScaledVector(c.v, dt);
      if (c.m.position.y < 0.08) { c.m.position.y = 0.08; c.v.y *= -0.3; c.v.x *= 0.55; c.v.z *= 0.55; c.spin.multiplyScalar(0.5); }
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      const k = Math.max(0, (c.t - c.life * 0.6) / (c.life * 0.4));
      c.m.scale.setScalar(c.s0 * Math.max(0.001, 1 - k));
      if (c.t >= c.life) { this.scene.remove(c.m); this.chunks.splice(i, 1); }
    }
  }

  clear() {
    this.timers = [];
    for (const p of this.parts) { this.scene.remove(p.s); this.pool[p.s.userData.key].push(p.s); }
    this.parts = [];
    for (const z of this.zones) { this.scene.remove(z.m); z.m.geometry.dispose(); z.m.material.dispose(); }
    this.zones = [];
    for (const c of this.chunks) this.scene.remove(c.m);
    this.chunks = [];
    for (const b of this.boulders) { this._removeAim(b.aim); this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
    this.boulders = [];
  }
}
