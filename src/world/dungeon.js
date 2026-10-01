// Kahraman ilerledikçe önünde zindan koridoru üretir, arkada kalanları siler.
import * as THREE from 'three';
import { cloneDungeon } from '../core/assets.js';
import { CONFIG } from '../config.js';

const SEG = 4;             // bir parça genişliği (KayKit grid = 4 birim)
const WALL_Z = -4.5;       // arka duvar
const AHEAD = 44, BEHIND = 26;
const LIGHT_POOL = 6;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeFlameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 36, 2, 32, 36, 30);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  gr.addColorStop(0.6, 'rgba(255,90,20,0.35)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Dungeon {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.segments = new Map();   // index -> group
    this.torches = [];           // {pos, flame, seg}
    this.breakables = [];        // {obj, seg} kırılabilir dekorlar (Boulder Toss)
    this.flying = [];            // kırılıp savrulan dekorlar
    this.theme = CONFIG.floors[0];
    this.flameTex = makeFlameTexture();
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xff8a3d, 0, 13, 1.6);
      l.userData.phase = Math.random() * 10;
      scene.add(l); this.lights.push(l);
    }
    // alttaki karanlık boşluk
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), voidMat);
    this.voidPlane.rotation.x = -Math.PI / 2; this.voidPlane.position.set(0, -1.2, 10);
    scene.add(this.voidPlane);
    this.time = 0;
  }

  setTheme(floorIndex) {
    this.theme = CONFIG.floors[floorIndex % CONFIG.floors.length];
    this.themeIndex = floorIndex;
    for (const l of this.lights) l.color.set(this.theme.torch);
    for (const t of this.torches) t.flame.material.color.set(this.theme.torch);
  }

  // Kat değişince tüm koridoru yeni temayla baştan kur
  rebuild(heroX) {
    for (const [i] of this.segments) this.removeSeg(i);
    for (const f of this.flying) this.scene.remove(f.obj);
    this.flying = [];
    this.update(heroX, 0);
  }

  removeSeg(i) {
    const g = this.segments.get(i);
    if (!g) return;
    this.root.remove(g);
    this.torches = this.torches.filter((t) => t.seg !== i);
    this.breakables = this.breakables.filter((b) => b.seg !== i);
    this.segments.delete(i);
  }

  buildSeg(i) {
    const r = rng(i * 7919 + (this.themeIndex || 0) * 104729 + 17);
    const g = new THREE.Group();
    const x = i * SEG;
    g.position.x = x;
    const th = this.theme;
    const pickW = (list) => { const tot = list.reduce((a, [, w]) => a + w, 0); let x = r() * tot; for (const [n, w] of list) { x -= w; if (x <= 0) return n; } return list[0][0]; };
    // zemin: 2 sıra karo (z = -2, +2); katın karo listesinden rastgele
    for (const z of [-2, 2]) {
      const name = th.tiles[Math.floor(r() * th.tiles.length)];
      const t = cloneDungeon(name);
      t.position.set(0, 0, z);
      t.rotation.y = Math.floor(r() * 4) * Math.PI / 2;
      g.add(t);
    }
    // ön zemin: ekranın altına kadar kesintisiz uzansın (kamera yaklaşıp uzaklaşınca boşluk görünmesin)
    for (const z of [6, 10, 14]) {
      const t = cloneDungeon(th.tiles[0]);
      t.position.set(0, 0, z);
      t.rotation.y = Math.floor(r() * 4) * Math.PI / 2;
      g.add(t);
    }

    // arka duvar
    const w = cloneDungeon(pickW(th.walls));
    w.position.set(0, 0, WALL_Z);
    g.add(w);
    // ikinci kat duvar (daha yüksek görünüm)
    const w2 = cloneDungeon(r() < 0.5 ? 'wall' : 'wall_cracked');
    w2.position.set(0, 4, WALL_Z);
    g.add(w2);

    // her 2 parçada bir sütun
    if (i % 2 === 0) {
      const p = cloneDungeon(r() < 0.4 ? 'pillar_decorated' : 'pillar');
      p.position.set(-SEG / 2, 0, WALL_Z + 0.6);
      g.add(p);
      const p2 = cloneDungeon('pillar');
      p2.position.set(-SEG / 2, 4, WALL_Z + 0.4);
      g.add(p2);
    }

    // meşale
    if (i % 2 === 1) {
      const t = cloneDungeon('torch_mounted');
      t.position.set(0, 2.1, WALL_Z + 0.5);
      g.add(t);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.flameTex, color: this.theme.torch, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5,   // göz almasın: %50
      }));
      flame.scale.set(0.9, 1.2, 1);
      flame.position.set(0, 2.1 + 0.95, WALL_Z + 0.95);
      g.add(flame);
      this.torches.push({ pos: new THREE.Vector3(x, 3.2, WALL_Z + 1.4), flame, seg: i, phase: r() * 10 });
    } else if (r() < 0.55) {
      const b = cloneDungeon(th.banners[Math.floor(r() * th.banners.length)]);
      b.position.set(0.3, 0.4, WALL_Z);
      g.add(b);
    }

    // duvar dibi dekor
    const dr = r();
    const decoSets = th.deco;
    if (dr < 0.6) {
      const [name, s] = decoSets[Math.floor(r() * decoSets.length)];
      const d = cloneDungeon(name);
      d.position.set((r() - 0.5) * 2.5, 0, WALL_Z + 1.4 + r() * 0.4);
      d.rotation.y = (r() - 0.5) * 0.8;
      d.scale.setScalar(s);
      g.add(d);
      this.breakables.push({ obj: d, seg: i });
    }
    // ön planda alçak sütun / moloz (derinlik hissi için)
    if (r() < 0.18) {
      const c = cloneDungeon('column');
      c.position.set((r() - 0.5) * 3, 0, 4.7);
      g.add(c);
      this.breakables.push({ obj: c, seg: i });
    }
    this.root.add(g);
    this.segments.set(i, g);
  }

  // (x, z) etrafında r içindeki dekorları kırıp savurur. Kırılanların dünya konumlarını döner (toz/parça efekti için).
  breakNear(x, z, r) {
    const out = [];
    const wp = new THREE.Vector3();
    for (let k = this.breakables.length - 1; k >= 0; k--) {
      const b = this.breakables[k];
      b.obj.getWorldPosition(wp);
      const d = Math.hypot(wp.x - x, (wp.z - z) * 0.8);
      if (d > r) continue;
      this.breakables.splice(k, 1);
      this.scene.attach(b.obj);                       // dünya konumunu koruyarak segmentten ayır
      const dir = new THREE.Vector3(wp.x - x, 0, wp.z - z);
      if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.normalize();
      const force = 7 * (1 - d / (r + 0.5)) + 3;
      this.flying.push({
        obj: b.obj, t: 0, life: 1.3, s0: b.obj.scale.x,
        v: new THREE.Vector3(dir.x * force, 5 + Math.random() * 4, dir.z * force * 0.6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 12),
      });
      out.push(wp.clone());
    }
    return out;
  }

  _updateFlying(dt) {
    for (let k = this.flying.length - 1; k >= 0; k--) {
      const f = this.flying[k];
      f.t += dt;
      f.v.y -= 22 * dt;
      f.obj.position.addScaledVector(f.v, dt);
      if (f.obj.position.y < 0) { f.obj.position.y = 0; f.v.y *= -0.35; f.v.x *= 0.6; f.v.z *= 0.6; f.spin.multiplyScalar(0.6); }
      f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; f.obj.rotation.z += f.spin.z * dt;
      // son kısımda küçülerek kaybolur (malzemeler ortak olduğu için saydamlık yerine ölçek)
      const k2 = Math.max(0, (f.t - f.life * 0.55) / (f.life * 0.45));
      f.obj.scale.setScalar(f.s0 * Math.max(0.001, 1 - k2));
      if (f.t >= f.life) { this.scene.remove(f.obj); this.flying.splice(k, 1); }
    }
  }

  update(heroX, dt) {
    this.time += dt;
    if (this.flying.length) this._updateFlying(dt);
    const i0 = Math.floor((heroX - BEHIND) / SEG), i1 = Math.floor((heroX + AHEAD) / SEG);
    for (let i = i0; i <= i1; i++) if (!this.segments.has(i)) this.buildSeg(i);
    for (const [i] of this.segments) if (i < i0 - 1 || i > i1 + 2) this.removeSeg(i);
    this.voidPlane.position.x = heroX;

    // en yakın meşalelere ışık ata
    const near = this.torches
      .map((t) => ({ t, d: Math.abs(t.pos.x - (heroX + 4)) }))
      .sort((a, b) => a.d - b.d).slice(0, this.lights.length);
    // Işıklar sabit parlaklıkta; uzaklaşan meşalenin ışığı yumuşakça söner,
    // böylece ışık bir meşaleden diğerine atlarken ekranda parlama/yanıp sönme olmaz.
    const cx = heroX + 4;
    this.lights.forEach((l, k) => {
      const n = near[k];
      if (!n) { l.intensity = 0; return; }
      l.position.copy(n.t.pos);
      const d = Math.abs(n.t.pos.x - cx);
      const w = THREE.MathUtils.clamp(1 - (d - 12) / 8, 0, 1);
      l.intensity = 11 * w * w * (3 - 2 * w);   // meşale ışığı %50 kısıldı (22 → 11)
    });
  }
}
