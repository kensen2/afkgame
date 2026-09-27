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
    this.update(heroX, 0);
  }

  removeSeg(i) {
    const g = this.segments.get(i);
    if (!g) return;
    this.root.remove(g);
    this.torches = this.torches.filter((t) => t.seg !== i);
    this.segments.delete(i);
  }

  buildSeg(i) {
    const r = rng(i * 7919 + (this.themeIndex || 0) * 104729 + 17);
    const g = new THREE.Group();
    const x = i * SEG;
    g.position.x = x;
    const tileName = this.theme.tile;
    // zemin: 2 sıra karo (z = -2, +2)
    for (const z of [-2, 2]) {
      let name = tileName;
      if (r() < 0.08 && z === -2) name = 'floor_tile_large_rocks';
      const t = cloneDungeon(name);
      t.position.set(0, 0, z);
      t.rotation.y = Math.floor(r() * 4) * Math.PI / 2;
      g.add(t);
    }
    // ön zemin: ekranın altına kadar kesintisiz uzansın (kamera yaklaşıp uzaklaşınca boşluk görünmesin)
    for (const z of [6, 10, 14]) {
      const t = cloneDungeon('floor_tile_large');
      t.position.set(0, 0, z);
      t.rotation.y = Math.floor(r() * 4) * Math.PI / 2;
      g.add(t);
    }

    // arka duvar
    const wr = r();
    let wall = 'wall';
    if (wr < 0.12) wall = 'wall_arched';
    else if (wr < 0.22) wall = 'wall_cracked';
    else if (wr < 0.30) wall = 'wall_window_closed';
    else if (wr < 0.36) wall = 'wall_gated';
    const w = cloneDungeon(wall);
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
        map: this.flameTex, color: this.theme.torch, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      flame.scale.set(0.9, 1.2, 1);
      flame.position.set(0, 2.1 + 0.95, WALL_Z + 0.95);
      g.add(flame);
      this.torches.push({ pos: new THREE.Vector3(x, 3.2, WALL_Z + 1.4), flame, seg: i, phase: r() * 10 });
    } else if (r() < 0.55) {
      const banners = ['banner_patternA_red', 'banner_thin_red', 'banner_patternC_brown', 'banner_shield_red'];
      const b = cloneDungeon(banners[Math.floor(r() * banners.length)]);
      b.position.set(0.3, 0.4, WALL_Z);
      g.add(b);
    }

    // duvar dibi dekor
    const dr = r();
    const decoSets = [
      ['barrel_large', 0.7], ['barrel_small_stack', 0.8], ['crates_stacked', 0.7], ['keg_decorated', 0.6],
      ['chest', 1], ['trunk_large_A', 0.9], ['table_medium_broken', 0.9], ['sword_shield_broken', 1],
      ['candle_triple', 1.2], ['coin_stack_small', 1],
    ];
    if (dr < 0.6) {
      const [name, s] = decoSets[Math.floor(r() * decoSets.length)];
      const d = cloneDungeon(name);
      d.position.set((r() - 0.5) * 2.5, 0, WALL_Z + 1.4 + r() * 0.4);
      d.rotation.y = (r() - 0.5) * 0.8;
      d.scale.setScalar(s);
      g.add(d);
    }
    // ön planda alçak sütun / moloz (derinlik hissi için)
    if (r() < 0.18) {
      const c = cloneDungeon('column');
      c.position.set((r() - 0.5) * 3, 0, 4.7);
      g.add(c);
    }
    this.root.add(g);
    this.segments.set(i, g);
  }

  update(heroX, dt) {
    this.time += dt;
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
      l.intensity = 22 * w * w * (3 - 2 * w);
    });
  }
}
