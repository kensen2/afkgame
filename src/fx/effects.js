// Parçacıklar, halka efektleri, uçan hasar yazıları, ekran sarsıntısı.
import * as THREE from 'three';

function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Kılıç izi: kuyruğu ince, ucu parlak bir yay şeridi. uv.x = yay boyunca (0 kuyruk → 1 uç), uv.y = şerit enine
function arcGeo(r, w, a0, a1, seg = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = a0 + (a1 - a0) * t;
    const ww = w * (0.2 + 0.8 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5));
    for (let j = 0; j < 2; j++) {
      const rr = r + (j - 0.5) * ww;
      pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0);
      uv.push(t, j);
    }
    if (i < seg) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const slashVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const slashFrag = `
  uniform float uProg; uniform float uFade; uniform vec3 uColor; varying vec2 vUv;
  void main(){
    float t = vUv.x;
    float head = uProg;
    float body = smoothstep(head - 0.75, head, t) * (1.0 - smoothstep(head, head + 0.04, t));
    float core = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 0.6);
    vec3 col = mix(uColor, vec3(1.0), core * 0.85);
    gl_FragColor = vec4(col, body * core * uFade);
  }`;

export class Effects {
  constructor(scene, camera, overlayEl) {
    this.scene = scene; this.camera = camera; this.overlay = overlayEl;
    this.tex = radialTex();
    this.particles = [];
    this.pool = [];
    this.rings = [];
    this.floaters = [];
    this.slashes = [];
    this.waves = [];
    this.shakeAmt = 0;
    this.tmp = new THREE.Vector3();
  }

  _sprite() {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    }
    this.scene.add(s);
    return s;
  }

  burst(pos, { count = 10, color = 0xffcc66, speed = 4, size = 0.35, life = 0.5, up = 2, gravity = -6, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const s = this._sprite();
      s.material.color.set(color); s.material.opacity = 1;
      s.position.copy(pos);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.2) * spread;
      const v = new THREE.Vector3(Math.cos(a) * speed * Math.random(), up + Math.random() * speed * e, Math.sin(a) * speed * Math.random());
      const sz = size * (0.6 + Math.random() * 0.8);
      s.scale.setScalar(sz);
      this.particles.push({ s, v, life, max: life, sz, gravity });
    }
  }

  // yükselen büyü/aura parçacıkları
  aura(pos, color, count = 2, radius = 0.6) {
    for (let i = 0; i < count; i++) {
      const s = this._sprite();
      s.material.color.set(color); s.material.opacity = 0.9;
      const a = Math.random() * Math.PI * 2;
      s.position.set(pos.x + Math.cos(a) * radius, pos.y + Math.random() * 0.3, pos.z + Math.sin(a) * radius);
      const sz = 0.25 + Math.random() * 0.2; s.scale.setScalar(sz);
      this.particles.push({ s, v: new THREE.Vector3(0, 1.5 + Math.random(), 0), life: 0.8, max: 0.8, sz, gravity: 0 });
    }
  }

  ring(pos, { color = 0xffaa33, radius = 3, life = 0.45, width = 0.35 } = {}) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.08, pos.z);
    this.scene.add(m);
    this.rings.push({ m, life, max: life, radius, width });
  }

  // Kılıç izi. facing: 1 sağ / -1 sol. ground: yere paralel (Whirlwind gibi).
  slash(center, { facing = 1, color = 0xffffff, radius = 1.5, width = 0.5, dur = 0.2, full = false, ground = false, a0 = 2.1, a1 = -0.75 } = {}) {
    const geo = full ? arcGeo(radius, width, 0, Math.PI * 2 * 1.05, 64) : arcGeo(radius, width, a0, a1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: slashVert, fragmentShader: slashFrag,
      uniforms: { uProg: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(center);
    if (ground) { m.rotation.x = -Math.PI / 2; m.position.y = Math.max(0.35, center.y); }
    else { m.quaternion.copy(this.camera.quaternion); m.scale.x = facing; }
    m.renderOrder = 7;
    this.scene.add(m);
    this.slashes.push({ m, t: 0, dur });
  }

  // Kılıç dalgası: hilal şeklinde iz kılıçtan çıkıp hedefe uçar, varınca onArrive çağrılır.
  slashWave(from, to, { facing = 1, color = 0xffffff, size = 1.1, speed = 16, onArrive = null } = {}) {
    const geo = arcGeo(size, size * 0.5, 1.35, -1.35, 24);
    const mat = new THREE.ShaderMaterial({
      vertexShader: slashVert, fragmentShader: slashFrag,
      uniforms: { uProg: { value: 1.02 }, uFade: { value: 1 }, uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.copy(this.camera.quaternion);
    m.scale.set(facing * 0.6, 0.6, 1);
    m.position.copy(from);
    m.renderOrder = 7;
    this.scene.add(m);
    const dist = from.distanceTo(to);
    this.waves.push({ m, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.05, dist / speed), onArrive, arrived: false, after: 0, facing });
  }

  // Darbe anındaki kısa parlak yıldız
  impact(pos, { color = 0xffffff, size = 1.1, life = 0.09 } = {}) {
    const s = this._sprite();
    s.material.color.set(color); s.material.opacity = 1;
    s.position.copy(pos); s.scale.setScalar(size);
    this.particles.push({ s, v: new THREE.Vector3(), life, max: life, sz: size, gravity: 0 });
  }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  // HTML ile uçan yazı (hasar, gold, "+LEVEL" vb.)
  floater(worldPos, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    this.overlay.appendChild(el);
    const pop = cls.includes('crit') ? 0.9 : cls.includes('dmg') ? 0.45 : 0.2;
    this.floaters.push({ el, pos: worldPos.clone(), life: 1.0, vx: (Math.random() - 0.5) * 0.6, pop });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.s); this.pool.push(p.s); this.particles.splice(i, 1); continue; }
      p.v.y += p.gravity * dt;
      p.s.position.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      p.s.material.opacity = k;
      p.s.scale.setScalar(p.sz * (0.4 + k * 0.6));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.2 + k * r.radius);
      r.m.material.opacity = (1 - k) * 0.9;
      if (r.life <= 0) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      f.pos.y += dt * 1.6; f.pos.x += f.vx * dt;
      this.tmp.copy(f.pos).project(this.camera);
      const x = (this.tmp.x * 0.5 + 0.5) * w, y = (-this.tmp.y * 0.5 + 0.5) * h;
      // büyüyerek çıkar, hemen yerine oturur (kritikte daha güçlü)
      const age = 1 - f.life;
      const sc = age < 0.08 ? 0.6 + (age / 0.08) * (0.5 + f.pop) : 1.1 + f.pop - Math.min(1, (age - 0.08) / 0.18) * f.pop;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${sc})`;
      f.el.style.opacity = Math.min(1, f.life * 2.5);
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const sl = this.slashes[i];
      sl.t += dt;
      const k = sl.t / sl.dur;
      sl.m.material.uniforms.uProg.value = Math.min(1.05, k * 2.2);
      sl.m.material.uniforms.uFade.value = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55);
      if (k >= 1) { this.scene.remove(sl.m); sl.m.geometry.dispose(); sl.m.material.dispose(); this.slashes.splice(i, 1); }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      if (!w.arrived) {
        w.t += dt;
        const k = Math.min(1, w.t / w.dur);
        w.m.position.lerpVectors(w.from, w.to, k);
        const sc = 0.6 + k * 0.5;                        // uçarken büyür
        w.m.scale.set(w.facing * sc, sc, 1);
        if (k >= 1) { w.arrived = true; w.onArrive?.(); }
      } else {
        w.after += dt;                                   // çarpınca biraz daha büyüyüp söner
        const k = w.after / 0.14;
        const sc = 1.1 + k * 0.4;
        w.m.scale.set(w.facing * sc, sc, 1);
        w.m.material.uniforms.uFade.value = Math.max(0, 1 - k);
        if (k >= 1) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); this.waves.splice(i, 1); }
      }
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
  }

  shakeOffset() {
    const a = this.shakeAmt * this.shakeAmt * 0.35;
    return new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
  }

  clear() {
    for (const p of this.particles) { this.scene.remove(p.s); this.pool.push(p.s); }
    this.particles = [];
    for (const r of this.rings) this.scene.remove(r.m);
    this.rings = [];
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    for (const sl of this.slashes) { this.scene.remove(sl.m); sl.m.geometry.dispose(); sl.m.material.dispose(); }
    this.slashes = [];
    for (const w of this.waves) { this.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); }
    this.waves = [];
  }
}
