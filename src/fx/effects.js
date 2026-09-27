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

export class Effects {
  constructor(scene, camera, overlayEl) {
    this.scene = scene; this.camera = camera; this.overlay = overlayEl;
    this.tex = radialTex();
    this.particles = [];
    this.pool = [];
    this.rings = [];
    this.floaters = [];
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

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  // HTML ile uçan yazı (hasar, gold, "+LEVEL" vb.)
  floater(worldPos, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floaters.push({ el, pos: worldPos.clone(), life: 1.0, vx: (Math.random() - 0.5) * 0.6 });
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
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${0.8 + Math.min(1, (1 - f.life) * 6) * 0.3})`;
      f.el.style.opacity = Math.min(1, f.life * 2.5);
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
  }
}
