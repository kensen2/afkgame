// Oyun denetleyicisi: sahne, kamera, faz makinesi (yürü → dalga → savaş → ganimet).
import * as THREE from 'three';
import { CONFIG, F } from './config.js';
import { Dungeon } from './world/dungeon.js';
import { Hero } from './entities/hero.js';
import { Enemy } from './entities/enemy.js';
import { Effects } from './fx/effects.js';
import { Economy } from './systems/economy.js';
import { Skills } from './systems/skills.js';
import { Ultimates } from './systems/ultimates.js';
import { buildWave } from './systems/waves.js';
import { cloneDungeon, cloneWeapon } from './core/assets.js';
import { Audio } from './core/audio.js';

// Arka planda kısılmayan zamanlayıcı (Web Worker). Worker açılamazsa setInterval'e düşer.
function startTicker(fn, ms) {
  try {
    const src = `setInterval(() => postMessage(0), ${ms});`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = fn;
    return w;
  } catch (e) {
    return setInterval(fn, ms);
  }
}

// düşman mermileri ortak geometri kullanır (her atışta yeni geometri sızıntı yapıyordu)
const ORB_BIG = new THREE.SphereGeometry(0.32, 12, 8), ORB_SMALL = new THREE.SphereGeometry(0.24, 12, 8);

export class Game {
  constructor(canvas, overlay, ui) {
    this.ui = ui;
    this.audio = Audio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.floors[0].fog);
    this.scene.fog = new THREE.Fog(CONFIG.floors[0].fog, 16, 42);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);

    this.hemi = new THREE.HemisphereLight(CONFIG.floors[0].ambient, 0x0a0604, 1.4);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.7);
    this.moon.position.set(-3, 10, 8);
    this.scene.add(this.moon); this.scene.add(this.moon.target);

    this.dungeon = new Dungeon(this.scene);
    this.fx = new Effects(this.scene, this.camera, overlay);
    this.ults = new Ultimates(this);
    this.enemies = [];
    this.projectiles = [];
    this.coins = [];
    this.hero = null;
    this.phase = 'idle';
    this.time = 0;
    this.paused = true;
    this.camFocus = new THREE.Vector3();
    this.lookOffset = new THREE.Vector3(3.2, 1.0, -0.8);
    this.camOffset = new THREE.Vector3(-0.8, 7.2, 12.5);
    this.zoom = 1;
    this.resize();

    window.addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    // Arka plan: sekme gizliyken tarayıcı requestAnimationFrame'i durdurur.
    // Oyun durmasın diye gizliyken simülasyonu bir Web Worker zamanlayıcısıyla yürütürüz
    // (worker zamanlayıcıları arka planda kısılmaz). Görüntü çizilmez, sadece savaş devam eder.
    this._bgLast = performance.now();
    this._bgSave = 0;
    startTicker(() => this.backgroundTick(), 250);
  }

  get running() { return !!this.hero && !this.paused; }

  backgroundTick() {
    const now = performance.now();
    let real = (now - this._bgLast) / 1000;
    this._bgLast = now;
    if (!document.hidden) return;          // görünürken normal döngü (frame) çalışır
    this.ui.tickCountdown?.();
    if (!this.running) return;
    real = Math.min(real, 5);              // çok uzun kesintileri çevrimdışı kazanç karşılar
    const dt = real * (Economy.data.settings.speed || 1);
    const steps = Math.ceil(dt / 0.034);
    for (let s = 0; s < steps && this.hero; s++) this.step(dt / steps);
    // son görülme zamanını taze tut: dönüşte oyun zaten oynadığı için çevrimdışı ödül verilmez
    this._bgSave += real;
    if (this._bgSave >= 10) { this._bgSave = 0; Economy.save(); }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // dar ekranlarda (telefon dikey) biraz geri çekil
    const portrait = w / h < 1;
    this.camera.fov = portrait ? 58 : 42;
    this.lookOffset.set(portrait ? 1.0 : 3.2, 1.0, -0.8);
    this.camOffset.set(portrait ? -0.2 : -0.8, portrait ? 9 : 7.2, portrait ? 15 : 12.5);
    this.camera.updateProjectionMatrix();
  }

  // ---------- Koşu başlat / bitir ----------
  startRun(heroId) {
    this.clearWorld();
    Economy.data.selectedHero = heroId;
    Economy.save();
    this.hero = new Hero(heroId, this.scene);
    this.hero.pos.set(0, 0, 0);
    this.wave = Economy.startWave() - 1;
    this.runStartWave = this.wave + 1;
    this.runGold = 0; this.runKills = 0; this.runXp = 0;
    this.floorIndex = -1;
    this.setFloor(F.floorOf(this.wave + 1));
    this.dungeon.rebuild(0);
    this.camFocus.set(0, 0, 0);
    this.walkTarget = 8;
    this.phase = 'walking';
    this.paused = false;
    this.ui.onRunStart(this);
    this.audio.startAmbient();
    this.audio.setMusic('dungeon');
  }

  clearWorld() {
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.clearProjectiles();
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.coins = [];
    this.removeChest();
    this.fx.clear();
    this.ults.clear();
    if (this.hero) { this.hero.dispose(); this.hero = null; }
  }

  setFloor(fi) {
    if (fi === this.floorIndex) return;
    this.floorIndex = fi;
    const th = CONFIG.floors[fi % CONFIG.floors.length];
    this.scene.background.set(th.fog);
    this.scene.fog.color.set(th.fog);
    this.hemi.color.set(th.ambient);
    this.dungeon.setTheme(fi);
  }

  // ---------- Dalga ----------
  startWave() {
    // Ekonomi v5: 20'den sonrası anahtar ister. Anahtar yoksa Mühürlü Kapı, sonra döngü.
    const next = this.wave + 1;
    if (!Economy.enterWave(next)) {
      this.phase = 'gate';
      this.gateT = 0;
      this.gateWave = next;
      this.ui.showGate(next);
      return;
    }
    this.wave++;
    const w = this.wave;
    if (Economy.tickBlessing()) { this.hero.refreshStats(); this.ui.toast('The blessing fades'); }
    const fi = F.floorOf(w);
    if (fi !== this.floorIndex) {
      // yeni kat
      this.phase = 'transition';
      this.ui.floorTransition(fi + 1, CONFIG.floors[fi % CONFIG.floors.length].name, () => {
        // geçiş sırasında oyundan çıkıldıysa ya da kahraman öldüyse yeni dalgayı başlatma
        if (!this.hero || this.hero.dead || this.phase !== 'transition') return;
        this.setFloor(fi);
        this.hero.pos.set(this.hero.pos.x, 0, 0);
        this.dungeon.rebuild(this.hero.pos.x);
        this._spawnWave(w);
      });
      return;
    }
    this._spawnWave(w);
  }

  _spawnWave(w) {
    const list = buildWave(w);
    const hx = this.hero.pos.x;
    const ahead = CONFIG.wave.spawnAhead;
    list.forEach((s, i) => {
      const e = new Enemy(s.type, w, this.scene, s.rank, s.bossDef);
      const col = i % 4, row = Math.floor(i / 4);
      const skel = e.def.skel;
      const x = hx + (skel ? ahead - 2 : ahead + 3) + row * 1.6 + Math.random() * 1.2 + (s.rank === 'boss' ? 1.5 : 0);
      const z = s.rank === 'boss' ? 0 : -2.4 + col * 1.6 + (Math.random() - 0.5) * 0.6;
      e.pos.set(x, 0, z);
      e.spawn();
      if (skel) {
        this.fx.burst(new THREE.Vector3(x, 0.2, z), { count: 10, color: 0x9fb4ff, speed: 2, up: 2, size: 0.4, life: 0.8 });
      }
      this.enemies.push(e);
    });
    this.phase = 'combat';
    const boss = list.find((s) => s.rank === 'boss');
    if (boss) {
      this.audio.play('boss');
      this.audio.setMusic('boss');
      this.fx.shake(0.6);
      this.ui.banner(`BOSS · ${boss.bossDef.name}`, 'boss');
    } else if (F.isElite(w)) {
      this.audio.play('wave');
      this.ui.banner(`Wave ${w} · ELITE`, 'elite');
    } else {
      this.audio.play('wave');
      this.ui.banner(`Wave ${w}`);
    }
    this.ui.updateWave(this);
  }

  bossAlive() { return this.enemies.some((e) => e.rank === 'boss' && !e.dead); }

  bossSummon(boss) {
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (alive > 8) return;
    for (let i = 0; i < 2; i++) {
      const e = new Enemy('Skeleton_Minion', this.wave, this.scene, 'normal');
      e.pos.set(boss.pos.x + (Math.random() - 0.5) * 3, 0, THREE.MathUtils.clamp(boss.pos.z + (Math.random() - 0.5) * 4, -3, 3));
      e.spawn();
      e.gold *= 0.3; e.xp *= 0.3;
      this.fx.burst(e.pos.clone().setY(0.3), { count: 14, color: 0x9a6aff, speed: 2, up: 3 });
      this.enemies.push(e);
    }
  }

  nearestEnemy(pos) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || !e.active) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) - (e.rank === 'boss' ? 0.5 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  onEnemyDeath(e) {
    this.runKills++;
    Economy.data.totalKills++;
    const p = e.pos.clone(); p.y = 1;
    this.fx.burst(p, { count: e.rank === 'boss' ? 50 : 14, color: e.def.skel ? 0xdde4ff : 0xff5544, speed: 5, size: 0.4, life: 0.6 });
    this.audio.play(e.def.skel ? 'bones' : 'die');
    if (e.rank === 'boss') this.fx.shake(1);
    // gold paraları saç
    // Tam sayı gold: küsurat olasılıkla yuvarlanır (1.4 gold → %40 ihtimalle 2, yoksa 1)
    const raw = e.gold * this.hero.stats.goldMult * (1 + (this.hero.stats.blessGold || 0)) * Economy.goldMult();
    const total = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
    if (total > 0) {
      const want = e.rank === 'boss' ? 14 : e.rank === 'elite' ? 6 : Math.min(4, 1 + Math.floor(Math.random() * 3));
      const n = Math.min(want, total);
      const each = Math.floor(total / n);
      for (let i = 0; i < n; i++) this.spawnCoin(e.pos, each + (i < total - each * n ? 1 : 0));
    }
    // boss'un ilk yenilişi: Skill Tome (token sadece günlük havuzdan gelir)
    if (e.rank === 'boss') {
      const r = Economy.bossFirstKill(this.wave);
      if (r && r.tomes) {
        this.fx.floater(this.hero.pos.clone().setY(3.8), `+${r.tomes} 📘`, 'gems');
        setTimeout(() => this.ui.toast(`First boss kill! +${r.tomes} Skill Tome${r.tomes > 1 ? 's' : ''}`), 1200);
      }
    }
    if (e.rank === 'boss') this.spawnChest(e.pos);
    const lv = Economy.addXp(e.xp);
    this.runXp += e.xp;
    if (lv > 0) {
      this.hero.refreshStats();
      this.hero.heal(this.hero.stats.maxHp * 0.3);
      this.audio.play('levelup');
      this.fx.floater(this.hero.pos.clone().setY(3.4), `LEVEL ${Economy.data.level}!`, 'level');
      this.fx.burst(this.hero.pos.clone().setY(1), { count: 40, color: 0x7affc0, speed: 3, up: 5, size: 0.5, life: 1 });
      this.ui.toast(`Level ${Economy.data.level}! +1 skill point`);
    }
    this.ui.updateWave(this);
  }

  // ---- Boss sandığı (DENEME) ----
  // Boss ölünce yere düşer, kısa süre sonra açılır: ekstra gold saçar + birkaç dalgalık kutsama verir.
  // Kalıcı güç ya da DGN vermez.
  spawnChest(pos) {
    if (!Economy.chestAvailable(this.wave)) return;
    this.removeChest();
    const mesh = cloneDungeon('chest_gold');
    mesh.position.set(pos.x, 6, pos.z);
    mesh.rotation.y = -Math.PI / 2 + 0.5;            // kameraya hafif dönük
    mesh.scale.setScalar(1.5);
    this.scene.add(mesh);
    const lid = mesh.getObjectByName('chest_gold_lid');
    const light = new THREE.PointLight(0xffc860, 0, 9, 2);
    light.position.set(pos.x, 1.6, pos.z);
    this.scene.add(light);
    this.chest = { mesh, lid, light, t: 0, opened: false, burst: false, wave: this.wave };
  }
  removeChest() {
    const c = this.chest;
    if (!c) return;
    if (!c.burst) this.openChest(true);              // açılmadan temizlenirse ödül kaybolmasın
    this.scene.remove(c.mesh); this.scene.remove(c.light); c.light.dispose();
    this.chest = null;
  }
  // Ödülü verir. quiet: görsel olmadan (kat geçişi/çıkış sırasında)
  openChest(quiet) {
    const c = this.chest, C = CONFIG.bossChest;
    c.burst = true;
    Economy.takeChest(c.wave);
    const gold = Math.max(1, Math.round(F.waveGold(c.wave) * C.goldWaves));
    const b = Economy.grantBlessing();
    if (quiet) { Economy.addGold(gold); return; }
    const n = 14, each = Math.floor(gold / n);
    for (let i = 0; i < n; i++) this.spawnCoin(c.mesh.position, each + (i < gold - each * n ? 1 : 0), C.linger);
    const p = c.mesh.position.clone().setY(1.2);
    this.fx.burst(p, { count: 60, color: 0xffd76a, speed: 4, up: 7, size: 0.45, life: 1.1 });
    this.fx.floater(p.clone().setY(3.2), `${b.icon} ${b.name}`, 'level');
    this.fx.shake(0.35);
    this.audio.play('levelup');
    if (this.hero && !this.hero.dead) this.hero.refreshStats();
    this.ui.toast(`Boss chest: +${gold} gold · ${b.name} (${b.text}, ${C.blessWaves} waves)`);
    this.ui.updateWave(this);
  }
  updateChest(dt) {
    const c = this.chest;
    if (!c) return;
    c.t += dt;
    const m = c.mesh, T = c.t, end = 1.9 + CONFIG.bossChest.linger;
    if (T < 0.45) m.position.y = 6 * (1 - (T / 0.45) ** 2);                       // düşüş
    else {
      m.position.y = 0;
      if (T < 1.0) {                                                              // yere çarpıp sallanır
        const k = (T - 0.45) / 0.55;
        m.scale.setScalar(1.5 * (1 + 0.12 * Math.sin(k * Math.PI * 4) * (1 - k)));
        m.rotation.z = 0.08 * Math.sin(k * Math.PI * 6);
        if (!c.opened && T > 0.47) { c.opened = true; this.audio.play('gateSlam'); }
      } else {
        m.rotation.z = 0; 
        // kapak açılır (hafif geri yaylanma ile)
        const k = Math.min(1, (T - 1.0) / 0.45), e = 1 - Math.pow(1 - k, 3);
        if (c.lid) c.lid.rotation.x = -1.95 * e + 0.25 * Math.sin(k * Math.PI) * (1 - k);
        c.light.intensity = 9 * e * (T > end - 0.6 ? Math.max(0, (end - T) / 0.6) : 1);
        if (!c.burst && T >= 1.2) this.openChest(false);
        if (T > end - 0.4) {
          const s = Math.max(0, (end - T) / 0.4);
          m.scale.setScalar(1.5 * s);
          if (s <= 0) this.removeChest();
        } else m.scale.setScalar(1.5);
      }
    }
  }

  // hold: yerde kaç saniye bekleyeceği (sandık ganimeti bir süre görünsün)
  spawnCoin(pos, value, hold = 0) {
    const mesh = cloneDungeon('coin');
    mesh.scale.setScalar(1.6);
    mesh.position.set(pos.x, 1, pos.z);
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2;
    this.coins.push({ mesh, value, v: new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 3, Math.sin(a) * s * 0.6), t: 0, magnet: false, hold });
  }

  updateCoins(dt) {
    const hp = this.hero.pos;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      const m = c.mesh;
      m.rotation.y += dt * 6;
      if (!c.magnet) {
        c.v.y -= 16 * dt;
        m.position.addScaledVector(c.v, dt);
        if (m.position.y < 0.15) { m.position.y = 0.15; c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; }
        if (c.hold ? c.t > c.hold : (c.t > 0.9 || this.phase !== 'combat')) c.magnet = true;
      } else {
        const target = new THREE.Vector3(hp.x, 1.2, hp.z);
        const d = target.sub(m.position);
        const len = d.length();
        const spd = 6 + c.t * 14;
        if (len < 0.5) {
          const got = Economy.addGold(c.value);
          Economy.noteActiveGold(got);
          this.runGold += got;
          this.audio.play('coin');
          this.fx.floater(hp.clone().setY(2.8), `+${got}`, 'gold');
          this.scene.remove(m); this.coins.splice(i, 1);
          continue;
        }
        m.position.addScaledVector(d.normalize(), Math.min(len, spd * dt));
      }
    }
  }

  // ---------- Mermiler ----------
  spawnProjectile(e) {
    const kind = e.def.proj;
    let mesh;
    const color = kind === 'fire' ? 0xff6a1a : kind === 'orb' ? 0xa066ff : kind === 'frost' ? 0x7fd8ff : kind === 'bomb' ? 0x3a3530 : 0xdddddd;
    if (kind === 'bolt') {
      mesh = cloneWeapon('Skeleton_Arrow');
      mesh.scale.setScalar(1.4);
      this.audio.play('bolt');
    } else {
      mesh = new THREE.Mesh(kind === 'fire' ? ORB_BIG : ORB_SMALL, new THREE.MeshBasicMaterial({ color }));
      mesh.userData.ownMat = true;
      this.audio.play('cast');
    }
    const start = e.pos.clone(); start.y = 1.4 * e.scale;
    const dir = e.pos.x > this.hero.pos.x ? -1 : 1;
    start.x += dir * 0.6;
    mesh.position.copy(start);
    this.scene.add(mesh);
    const target = this.hero.pos.clone(); target.y = 1.2;
    const v = target.sub(start).normalize().multiplyScalar(kind === 'bolt' ? 16 : 9);
    if (kind === 'bolt') mesh.lookAt(start.clone().add(v)), mesh.rotateX(Math.PI / 2);
    this.projectiles.push({ mesh, v, dmg: e.dmg, kind, color, life: 3, src: e });
  }

  updateProjectiles(dt) {
    const hp = this.hero.pos;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      // hafif hedef takibi (büyüler)
      if (p.kind !== 'bolt' && !this.hero.dead) {
        const want = new THREE.Vector3(hp.x, 1.2, hp.z).sub(p.mesh.position).normalize().multiplyScalar(p.v.length());
        p.v.lerp(want, Math.min(1, dt * 1.5));
      }
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.kind !== 'bolt' && Math.random() < 0.8) this.fx.burst(p.mesh.position, { count: 1, color: p.color, speed: 0.4, up: 0.3, size: 0.45, life: 0.3, gravity: 0 });
      const d = Math.hypot(p.mesh.position.x - hp.x, p.mesh.position.z - hp.z);
      if (!this.hero.dead && d < 0.7 && Math.abs(p.mesh.position.y - 1.2) < 1.3) {
        this.hero.takeDamage(p.dmg, this, null);
        this.fx.burst(p.mesh.position, { count: 12, color: p.color, speed: 4, size: 0.4 });
        this.audio.play('hurt');
        this._dropProjectile(p); this.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0) { this._dropProjectile(p); this.projectiles.splice(i, 1); }
    }
  }

  onVictory() {
    this.audio.setMusic('menu');
    this.phase = 'victory';
    Economy.data.wins = (Economy.data.wins || 0) + 1;
    Economy.data.resumeWave = 1;
    for (const c of this.coins) { const g = Economy.addGold(c.value); this.runGold += g; this.scene.remove(c.mesh); }
    this.coins = [];
    Economy.save();
    this.audio.play('levelup');
    this.fx.burst(this.hero.pos.clone().setY(1.5), { count: 80, color: 0xffd23a, speed: 6, up: 6, size: 0.6, life: 1.4 });
    setTimeout(() => this.ui.showVictory(this), 1500);
  }

  _dropProjectile(p) { this.scene.remove(p.mesh); if (p.mesh.userData.ownMat) p.mesh.material.dispose(); }
  clearProjectiles() { for (const p of this.projectiles) this._dropProjectile(p); this.projectiles = []; }

  onHeroDeath() {
    this.ults.clear();          // havadaki kaya/meteor/ruh ölü kahraman adına hasar verip ödül kazandırmasın
    this.audio.setMusic(null);
    this.phase = 'dead';
    this.audio.play('defeat');
    this.fx.shake(0.8);
    Economy.recordWave(Math.max(0, this.wave - 1));
    Economy.setResumeAfterDeath(this.wave);
    // yerdeki paraları otomatik topla
    for (const c of this.coins) { const g = Economy.addGold(c.value); this.runGold += g; this.scene.remove(c.mesh); }
    this.coins = [];
    Economy.save();
    setTimeout(() => this.ui.showDeath(this), 1800);
  }

  // ---------- Ana döngü ----------
  // Vuruş anında oyunu çok kısa dondur (hit-stop): darbeye ağırlık verir
  hitStop(sec) { if (!document.hidden) this.hitStopT = Math.max(this.hitStopT || 0, sec); }

  frame() {
    let dt = Math.min(0.05, this.clock.getDelta());
    this._lastRenderDt = dt;
    if (this.paused || !this.hero) { this.render(); return; }
    if (this.hitStopT > 0) { this.hitStopT -= dt; this.render(); this.ui.updateHud(this); return; }
    dt *= Economy.data.settings.speed || 1;
    // 2x/3x hızda simülasyonu küçük adımlarla koştur
    const steps = Math.ceil(dt / 0.034);
    for (let s = 0; s < steps; s++) this.step(dt / steps);
    this.render();
    this.ui.updateHud(this);
  }

  step(dt) {
    this.time += dt;
    Economy.tickActive(dt);
    const hero = this.hero;

    if (this.phase === 'walking') {
      if (hero.pos.x >= this.walkTarget) this.startWave();
    }
    if (this.phase === 'combat') {
      if (Economy.data.settings.auto) Skills.autoCast(this);
      const alive = this.enemies.filter((e) => !e.dead);
      if (alive.length === 0) {
        Economy.recordWave(this.wave);
        if (this.wave >= CONFIG.wave.maxWave) { this.onVictory(); return; }
        Economy.save();
        this.phase = 'loot';
        this.lootT = 0;
        this.clearProjectiles();   // dalga bitti: havada kalan mermi kahramanı vurmasın
        hero.heal(hero.stats.maxHp * 0.15);
        this.ui.waveCleared(this);
        this.audio.setMusic('dungeon');
      }
    }
    if (this.phase === 'gate') {
      // anahtar almak için dükkân/cüzdan açıksa kapı sayacı bekler
      if (!this.ui.isShopOpen() && document.getElementById('screen-wallet').classList.contains('hidden')) this.gateT += dt / (Economy.data.settings.speed || 1);
      if (this.gateT >= CONFIG.v5.gateSeconds) {
        this.ui.hideGate();
        // kapı ekranındayken anahtar aldıysa devam et, yoksa döngüye dön
        if (Economy.enterWave(this.gateWave)) this.wave = this.gateWave - 1;
        else {
          this.wave = Economy.loopWave(this.gateWave) - 1; this.ui.banner(`Back to Wave ${this.wave + 1}`);
          Economy.data.resumeWave = this.wave + 1; Economy.save();   // döngüye girdikten sonra çıkıp girince de buradan devam
        }
        this.phase = 'walking';
        this.walkTarget = hero.pos.x + 4;
      }
    }
    if (this.phase === 'loot') {
      this.lootT += dt;
      if (this.lootT > 1.0 && this.coins.length === 0 && !this.chest) {
        this.phase = 'walking';
        this.walkTarget = hero.pos.x + CONFIG.wave.walkDistance;
      }
    }

    hero.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].removed) { this.enemies[i].dispose(); this.enemies.splice(i, 1); }
    }
    this.updateProjectiles(dt);
    this.updateCoins(dt);
    this.updateChest(dt);
    this.dungeon.update(hero.pos.x, dt);
    this.fx.update(dt);
    this.ults.update(dt);
  }

  render() {
    if (this.hero) {
      // kamera: kahramanı yumuşak takip; savaşta düşman grubunu da kadraja al
      const target = new THREE.Vector3(this.hero.pos.x, 0, 0);
      if (this.phase === 'combat') {
        const alive = this.enemies.filter((e) => !e.dead);
        if (alive.length) {
          const cx = alive.reduce((s, e) => s + e.pos.x, 0) / alive.length;
          target.x = THREE.MathUtils.clamp((this.hero.pos.x * 2 + cx) / 3, this.hero.pos.x - 3, this.hero.pos.x + 4);
        }
      }
      const k = this.bossAlive() ? 1.12 : 1;
      this.zoom += (k - this.zoom) * 0.02;
      if (this.camFocus.distanceTo(target) > 25) this.camFocus.copy(target);
      const dtR = Math.min(0.05, this._lastRenderDt || 0.016);
      this.camFocus.lerp(target, 1 - Math.exp(-dtR * 3.5));
      const cam = this.camFocus.clone().add(this.camOffset.clone().multiplyScalar(this.zoom)).add(this.fx.shakeOffset());
      this.camera.position.copy(cam);
      this.camera.lookAt(this.camFocus.clone().add(this.lookOffset));
      this.moon.position.set(this.camFocus.x - 3, 10, 8);
      this.moon.target.position.set(this.camFocus.x + 2, 0, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Menüde arka planda zindanı göster
  showMenuScene() {
    this.clearWorld();
    this.paused = true;
    this.setFloor(0);
    this.dungeon.rebuild(0);
    this.camera.position.set(-2, 5, 11);
    this.camera.lookAt(4, 1.5, -2);
    this.dungeon.update(0, 0.016);
    const loop = () => {
      if (!this.paused || this.hero) return;
      this.dungeon.update(0, 0.016);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
