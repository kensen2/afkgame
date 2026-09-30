// KayKit 3D düşman: animasyonlu model + yapay zeka.
import * as THREE from 'three';
import { cloneEnemy, cloneWeapon } from '../core/assets.js';
import { CONFIG, F } from '../config.js';

const ALL_PROPS = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword',
  '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff',
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'];

const barGeo = new THREE.PlaneGeometry(1, 0.12);

export class Enemy {
  constructor(type, wave, scene, rank = 'normal', bossDef = null) {
    this.type = type;
    this.def = CONFIG.enemies[type];
    this.rank = rank;
    this.scene = scene;
    this.bossDef = bossDef;
    const R = rank === 'boss' ? CONFIG.boss : rank === 'elite' ? CONFIG.elite : { hp: 1, dmg: 1, gold: 1, xp: 1, scale: 1 };
    this.maxHp = F.enemyHp(this.def.hp, wave) * R.hp * (bossDef?.hpMult || 1) * (rank === 'boss' ? F.bossHpScale(wave) : 1);
    this.hp = this.maxHp;
    this.dmg = F.enemyDmg(this.def.dmg, wave) * R.dmg;
    this.armor = this.def.armor * (1 + wave * 0.05);
    this.gold = F.enemyGold(this.def.gold, wave) * R.gold;
    this.xp = F.enemyXp(this.def.xp, wave) * R.xp;
    this.speed = this.def.speed * (rank === 'boss' ? 0.85 : 1) * (0.92 + Math.random() * 0.16);
    this.range = this.def.range;
    this.scale = R.scale * (this.def.scale || 1);
    this.radius = 0.5 * this.scale;
    this.name = bossDef?.name || this.def.name;

    const { scene: model, animations } = cloneEnemy(this.def.model || type);
    this.model = model;
    this.group = new THREE.Group();
    this.group.add(model);
    model.scale.setScalar(this.scale);
    this.pos = this.group.position;

    // silahları ayarla
    if (this.def.skel) {
      const hr = model.getObjectByName('handslot.r'), hl = model.getObjectByName('handslot.l');
      if (this.def.weapons?.r && hr) hr.add(cloneWeapon(this.def.weapons.r));
      if (this.def.weapons?.l && hl) hl.add(cloneWeapon(this.def.weapons.l));
    } else {
      for (const n of ALL_PROPS) {
        const o = model.getObjectByName(n);
        if (o) o.visible = (this.def.show || []).includes(n);
      }
    }
    // materyalleri kopyala (vuruş parlaması ve renk tonu için)
    this.mats = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (this.def.tint) o.material.color.multiply(new THREE.Color(0xffffff).lerp(new THREE.Color(this.def.tint), 0.45));
        if (rank === 'boss') o.material.color.multiply(new THREE.Color(0xffb0a0));
        o.material.emissive = new THREE.Color(0x000000);
        o.frustumCulled = false;
        this.mats.push(o.material);
      }
    });

    // gölge
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.7 * this.scale, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.05;
    this.group.add(sh);
    // elit / boss aurası
    if (rank !== 'normal') {
      const col = rank === 'boss' ? 0xff2a2a : 0xffa020;
      this.aura = new THREE.Mesh(new THREE.RingGeometry(0.75 * this.scale, 1.0 * this.scale, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.07;
      this.group.add(this.aura);
      this.auraColor = col;
    }
    // can barı (boss'un barı ekranın üstünde)
    if (rank !== 'boss') {
      this.bar = new THREE.Group();
      const bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthTest: false }));
      bg.scale.set(1.04, 1.5, 1);
      this.barFill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: rank === 'elite' ? 0xffa020 : 0xe0303a, depthTest: false }));
      bg.renderOrder = 10; this.barFill.renderOrder = 11;
      this.bar.add(bg, this.barFill);
      this.bar.position.y = 2.6 * this.scale;
      this.bar.visible = false;
      this.group.add(this.bar);
    }

    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    for (const c of animations) this.clips[c.name] = c;
    this.actions = {};
    this.current = null;

    this.state = 'spawn';
    this.stateT = 0;
    this.atkCd = 1 + Math.random();
    this.dead = false;
    this.active = false;   // doğma animasyonu bitene kadar hedef alınmaz
    this.stun = 0; this.fear = 0;
    this.flash = 0;
    this.knock = new THREE.Vector3();
    this.deathT = 0;
    this.removed = false;
    scene.add(this.group);
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips[name];
      if (!clip) return null;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }

  play(name, { once = false, fade = 0.15, speed = 1, force = false } = {}) {
    const a = this.action(name) || this.action('Idle');
    if (this.current === a && !force) { a.timeScale = speed; return a; }
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    a.enabled = true;
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    a.play();
    this.current = a;
    return a;
  }

  get idleAnim() { return this.clips.Idle_Combat ? 'Idle_Combat' : 'Idle'; }
  get moveAnim() { return this.speed > 3 ? 'Running_A' : 'Walking_A'; }

  spawn() {
    if (this.def.skel && this.clips.Spawn_Ground_Skeletons) {
      this.play('Spawn_Ground_Skeletons', { once: true, speed: 1.3 });
      this.spawnDur = this.clips.Spawn_Ground_Skeletons.duration / 1.3;
    } else {
      this.play(this.moveAnim);
      this.spawnDur = 0.2;
    }
    this.state = 'spawn'; this.stateT = 0;
  }

  takeDamage(amount, game, crit = false, reflected = false) {
    if (this.dead) return 0;
    const dmg = amount * F.armorMult(this.armor);
    this.hp -= dmg;
    this.flash = crit ? 0.2 : 0.16;
    this.squash = 0.14;
    const p = this.pos.clone(); p.y = 2.3 * this.scale;
    game.fx.floater(p, crit ? `CRIT ${Math.round(dmg)}` : Math.round(dmg), crit ? 'crit' : reflected ? 'reflect' : 'dmg');
    if (this.bar) this.bar.visible = true;
    if (this.hp <= 0) { this.die(game); return dmg; }
    // küçük sersemleme / vuruş tepkisi (boss hariç)
    if (this.rank === 'normal' && this.state !== 'attack' && this.state !== 'spawn' && Math.random() < 0.5) {
      this.play('Hit_A', { once: true, force: true, speed: 1.4 });
      this.state = 'hit'; this.stateT = 0;
    }
    return dmg;
  }

  applyStun(t) { if (!this.dead && this.rank !== 'boss') { this.stun = Math.max(this.stun, t); } else if (!this.dead) this.stun = Math.max(this.stun, t * 0.4); }
  applyFear(t) { if (!this.dead && this.rank !== 'boss') this.fear = Math.max(this.fear, t); }
  knockback(dir, force) { this.knock.addScaledVector(dir, force * (this.rank === 'boss' ? 0.2 : this.rank === 'elite' ? 0.6 : 1)); }

  die(game) {
    this.dead = true; this.hp = 0;
    this.state = 'dead'; this.deathT = 0;
    const deathClip = this.def.skel && this.clips.Death_C_Skeletons ? 'Death_C_Skeletons' : 'Death_A';
    this.play(deathClip, { once: true, force: true });
    if (this.bar) this.bar.visible = false;
    game.onEnemyDeath(this);
  }

  update(dt, game) {
    this.mixer.update(dt);
    // parlama
    const fl = this.flash > 0, flWhite = this.flash > 0.1;
    this.flash -= dt;
    if (this.dead) { this.stun = 0; this.fear = 0; }
    // vurulunca kısa ezilip esneme
    if (this.squash > 0) {
      this.squash -= dt;
      const k = Math.max(0, this.squash / 0.14);
      const s = Math.sin(k * Math.PI);
      this.model.scale.set(this.scale * (1 + 0.14 * s), this.scale * (1 - 0.16 * s), this.scale * (1 + 0.14 * s));
    } else if (this.squash !== undefined && this.squash !== null) { this.model.scale.setScalar(this.scale); this.squash = null; }
    for (const m of this.mats) {
      if (flWhite) m.emissive.setRGB(1.2, 1.2, 1.2);       // önce beyaz parlama
      else if (fl) m.emissive.setRGB(0.75, 0.1, 0.08);     // sonra kısa kırmızı ton
      else if (this.stun > 0) m.emissive.setRGB(0.15, 0.15, 0.45);
      else if (this.fear > 0) m.emissive.setRGB(0.35, 0.1, 0.35);
      else m.emissive.setRGB(0, 0, 0);
    }
    if (this.aura) {
      this.aura.rotation.z += dt;
      this.aura.material.opacity = 0.5 + Math.sin(game.time * 6) * 0.2;
      if (Math.random() < dt * 8) game.fx.aura(this.pos, this.auraColor, 1, 0.7 * this.scale);
    }
    if (this.bar) {
      this.bar.quaternion.copy(game.camera.quaternion);
      const k = Math.max(0, this.hp / this.maxHp);
      this.barFill.scale.x = k; this.barFill.position.x = -(1 - k) / 2;
    }

    if (this.dead) {
      this.deathT += dt;
      if (this.deathT > 1.6) {
        this.pos.y -= dt * 0.8;
        if (this.deathT > 3) this.removed = true;
      }
      return;
    }

    // geri itilme
    if (this.knock.lengthSq() > 0.0001) {
      this.pos.addScaledVector(this.knock, dt * 6);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    }
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -3.2, 3.4);

    this.stateT += dt;
    const hero = game.hero;
    const dx = hero.pos.x - this.pos.x, dz = hero.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    if (this.state === 'spawn') {
      if (!this.def.skel) this.pos.x -= this.speed * dt; // koşarak gelir
      if (this.stateT >= this.spawnDur) { this.active = true; this.state = 'chase'; }
      this.group.rotation.y = Math.atan2(dx, dz);
      return;
    }
    if (hero.dead) { this.play(this.clips.Cheer ? 'Cheer' : this.idleAnim); return; }

    if (this.stun > 0) {
      this.stun -= dt;
      this.play(this.idleAnim, { speed: 0.2 });
      return;
    }
    if (this.fear > 0) {
      this.fear -= dt;
      this.pos.x += Math.sign(-dx || 1) * this.speed * 0.7 * dt;
      this.pos.z += Math.sign(-dz || 1) * this.speed * 0.3 * dt;
      this.group.rotation.y = Math.atan2(-dx, -dz);
      this.play('Running_A', { speed: 1.2 });
      return;
    }
    if (this.state === 'hit') {
      if (this.stateT > 0.35) this.state = 'chase';
      return;
    }

    this.atkCd -= dt;
    this.group.rotation.y = Math.atan2(dx, dz);
    const reach = this.range + (this.def.kind === 'melee' ? hero_radius() : 0);

    if (this.state === 'attack') {
      const clip = this.clips[this.def.attack];
      const dur = (clip?.duration || 1) / this.atkSpeedMult;
      if (!this.attackHit && this.stateT >= dur * 0.45) {
        this.attackHit = true;
        if (this.def.kind === 'ranged') game.spawnProjectile(this);
        else if (dist <= reach + 0.8) hero.takeDamage(this.dmg, game, this);
        if (this.bossDef?.summon && Math.random() < 0.35) game.bossSummon(this);
      }
      if (this.stateT >= dur) { this.state = 'chase'; }
      return;
    }

    // ayrışma: diğer düşmanlarla üst üste binme
    const sep = new THREE.Vector3();
    for (const e of game.enemies) {
      if (e === this || e.dead) continue;
      const ex = this.pos.x - e.pos.x, ez = this.pos.z - e.pos.z;
      const d = Math.hypot(ex, ez), min = this.radius + e.radius + 0.3;
      if (d < min && d > 0.001) sep.x += (ex / d) * (min - d), sep.z += (ez / d) * (min - d);
    }
    this.pos.addScaledVector(sep, Math.min(1, dt * 5));

    const want = this.def.kind === 'ranged' ? this.range * 0.85 : reach;
    if (dist > want) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
      this.play(this.moveAnim, { speed: this.speed / (this.moveAnim === 'Running_A' ? 3.5 : 2.2) });
    } else if (this.atkCd <= 0) {
      this.state = 'attack'; this.stateT = 0; this.attackHit = false;
      this.atkSpeedMult = this.rank === 'boss' ? 0.8 : 1;
      this.play(this.def.attack, { once: true, force: true, speed: this.atkSpeedMult });
      this.atkCd = this.def.atkCd * (0.85 + Math.random() * 0.3);
    } else {
      this.play(this.idleAnim);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.mixer.stopAllAction();
    for (const m of this.mats) m.dispose();
  }
}

function hero_radius() { return 0.45; }
