// 2D sprite kahraman: 3D sahnede kameraya dönük düzlem (billboard).
import * as THREE from 'three';
import { HexShield } from '../fx/hexshield.js';
import { Assets } from '../core/assets.js';
import { CONFIG, F } from '../config.js';
import { Economy } from '../systems/economy.js';

const Z_MIN = -3.0, Z_MAX = 3.2;

export class Hero {
  constructor(id, scene) {
    this.id = id;
    this.def = CONFIG.heroes[id];
    this.scene = scene;
    this.meta = Assets.heroes[id].meta;
    this.textures = {};
    // her animasyon için kendi texture kopyası (offset bağımsız olsun)
    for (const [a, t] of Object.entries(Assets.heroes[id].textures)) {
      const c = t.clone(); c.needsUpdate = true;
      c.repeat.set(1 / this.meta[a].n, 1);
      this.textures[a] = c;
    }
    const [fw, fh] = this.meta._size;
    const h = this.def.height, w = h * fw / fh;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    this.mat = new THREE.MeshLambertMaterial({
      map: this.textures.idle, emissiveMap: this.textures.idle, emissive: 0xffffff, emissiveIntensity: 0.55,
      transparent: true, alphaTest: 0.2, side: THREE.DoubleSide,
    });
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    this.pivot.add(this.mesh);
    // düşmanların arkasında kalınca görünen silüet (x-ray)
    this.xrayMat = new THREE.MeshBasicMaterial({
      map: this.textures.idle, color: 0x9fd0ff, transparent: true, opacity: 0.5, alphaTest: 0.3,
      depthFunc: THREE.GreaterDepth, depthWrite: false, side: THREE.DoubleSide,
    });
    this.xray = new THREE.Mesh(geo, this.xrayMat);
    this.xray.renderOrder = 5;
    this.pivot.add(this.xray);
    this.group.add(this.pivot);
    // yumuşak gölge
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.94, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06; sh.scale.set(1.2, 0.7, 1);
    this.group.add(sh);
    // kahramanın etrafını aydınlatan sıcak ışık
    this.light = new THREE.PointLight(0xffc488, 10, 9, 1.6);
    this.light.position.set(0.5, 2.5, 2);
    this.group.add(this.light);
    // koruma kalkanı: altıgen petekli enerji kalkanı (Iron Stance)
    this.shield = new HexShield(1.8);
    this.shield.mesh.position.y = 1.45;
    this.group.add(this.shield.mesh);
    // kılıç izi rengi: Warrior beyaz-mavi, Lion beyaz-altın
    this.slashColor = this.id === 'lion' ? 0xffc860 : 0x8fc8ff;
    scene.add(this.group);

    this.pos = this.group.position;
    this.facing = 1;
    this.anim = 'idle'; this.frame = 0; this.frameT = 0; this.animSpeed = 1;
    this.animOnce = null;
    this.reset();
  }

  reset() {
    this.stats = F.heroStats(this.id, Economy.data);
    this.hp = this.stats.maxHp;
    this.dead = false;
    this.attackCd = 0;
    this.attacking = false;
    this.hitDone = false;
    this.target = null;
    this.buffs = { guard: 0, rage: 0 };
    this.dash = null;
    this.flash = 0;
    this.deathT = 0;
    this.pivot.rotation.set(0, 0, 0);
    if (this.xray) this.xray.visible = true;
    this.mat.opacity = 1;
    this.skillCds = [0, 0, 0];
    this.ultCd = (this.def.ultimate?.cd || 0) * 0.35;   // ilk dalgalarda hemen değil, kısa bir süre sonra hazır
    this.casting = 0;                                    // ultimate hazırlanırken kahraman yerinde durur
    this.play('idle');
  }

  refreshStats() {
    const ratio = this.hp / this.stats.maxHp;
    this.stats = F.heroStats(this.id, Economy.data);
    this.hp = Math.min(this.stats.maxHp, this.stats.maxHp * ratio);
  }

  get moveAnim() { return this.meta.run ? 'run' : 'walk'; }

  play(anim, once = false, speed = 1) {
    if (!this.meta[anim]) anim = anim === 'run' ? 'walk' : 'idle';
    if (this.anim === anim && !once) { this.animSpeed = speed; return; }
    this.anim = anim; this.frame = 0; this.frameT = 0; this.animSpeed = speed;
    this.animOnce = once ? anim : null;
    this.mat.map = this.textures[anim]; this.mat.emissiveMap = this.textures[anim];
    this.mat.needsUpdate = true;
    if (this.xrayMat) { this.xrayMat.map = this.textures[anim]; this.xrayMat.needsUpdate = true; }
    this._applyFrame();
  }

  _applyFrame() {
    const t = this.textures[this.anim];
    t.offset.x = this.frame / this.meta[this.anim].n;
  }

  // animasyon karesi ilerlet; saldırının vuruş karesine gelince true döner
  _stepAnim(dt) {
    const m = this.meta[this.anim];
    this.frameT += dt * 1000 * this.animSpeed;
    let hit = false;
    while (this.frameT >= m.durs[this.frame]) {
      this.frameT -= m.durs[this.frame];
      this.frame++;
      if (this.anim === 'attack' && this.frame === this.def.hitFrame) hit = true;
      if (this.frame >= m.n) {
        if (this.animOnce) { this.frame = m.n - 1; this.animOnce = null; this.onAnimEnd?.(); break; }
        this.frame = 0;
      }
    }
    this._applyFrame();
    return hit;
  }

  get atkSpeed() {
    return this.stats.atkSpd * (this.buffs.rage > 0 ? 1 + this.rageBonus : 1);
  }
  get critChance() {
    return this.stats.crit + (this.buffs.rage > 0 ? 0.2 : 0);
  }

  setFacing(dir) {
    if (dir === 0) return;
    this.facing = dir > 0 ? 1 : -1;
    this.mesh.scale.x = this.facing;
    this.xray.scale.x = this.facing;
  }

  takeDamage(amount, game, source) {
    if (this.dead) return 0;
    let dmg = amount * F.armorMult(this.stats.armor);
    if (this.buffs.guard > 0) {
      dmg *= 1 - this.guardReduce;
      // darbe kalkanda dalga yaratır
      const from = source?.pos ? source.pos.clone().setY(1.3) : this.pos.clone().add(new THREE.Vector3(this.facing * 2, 1.3, 0));
      this.shield.hit(from);
      if (source && !source.dead) source.takeDamage(amount * 0.3, game, false, true);
    }
    this.hp -= dmg;
    this.flash = 0.15;
    game.fx.floater(this.pos.clone().add(new THREE.Vector3(0, 3.2, 0)), Math.round(dmg), 'hurt');
    if (this.hp <= 0) { this.hp = 0; this.die(game); }
    return dmg;
  }

  heal(n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }

  die(game) {
    this.dead = true;
    this.deathT = 0;
    this.play('idle');
    game.onHeroDeath();
  }

  update(dt, game) {
    const camQ = game.camera.quaternion;
    this.pivot.quaternion.copy(camQ);
    if (this.flash > 0) {
      this.flash -= dt;
      this.mat.emissive.setRGB(1, 0.35, 0.35); this.mat.emissiveIntensity = 1.2;
    } else if (this.buffs.rage > 0) {
      this.mat.emissive.setRGB(1, 0.55, 0.3); this.mat.emissiveIntensity = 0.85 + Math.sin(game.time * 12) * 0.15;
    } else {
      this.mat.emissive.setRGB(1, 1, 1); this.mat.emissiveIntensity = 0.55;
    }
    if (this.buffs.guard > 0 && !this.dead) this.shield.open(); else this.shield.close();
    this.shield.update(dt, game.time);

    if (this.dead) {
      this.deathT += dt;
      // yere düşme
      this.pivot.rotateZ(-Math.min(1, this.deathT * 3) * Math.PI / 2 * this.facing);
      this.xray.visible = false;
      this.mat.opacity = Math.max(0.3, 1 - this.deathT * 0.4);
      return;
    }

    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    for (let i = 0; i < 3; i++) this.skillCds[i] = Math.max(0, this.skillCds[i] - dt);
    this.ultCd = Math.max(0, this.ultCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.stats.regen > 0) this.heal(this.stats.maxHp * this.stats.regen * dt);

    // Hücum (dash)
    if (this.dash) {
      const d = this.dash;
      const step = Math.min(d.remaining, d.speed * dt);
      this.pos.addScaledVector(d.dir, step);
      d.remaining -= step;
      d.onStep?.(this);
      this.play(this.moveAnim, false, 2.2);
      this._stepAnim(dt);
      if (d.remaining <= 0.001) this.dash = null;
      this._clamp();
      return;
    }

    // Ultimate hazırlığı: yerinde durur, saldırmaz
    if (this.casting > 0) {
      this.casting -= dt;
      this.attacking = false;
      if (this.anim !== 'attack') this.play('idle');
      this._stepAnim(dt);
      this._clamp();
      return;
    }

    if (game.phase === 'walking' || game.phase === 'loot') {
      // otomatik ileri yürüyüş
      this.setFacing(1);
      const spd = this.stats.speed * 0.8;
      this.pos.x += spd * dt;
      this.pos.z += (0 - this.pos.z) * Math.min(1, dt * 1.5);
      this.play(this.moveAnim, false, 1);
      this.attacking = false;
    } else if (game.phase === 'combat') {
      this._combat(dt, game);
    } else {
      this.play('idle');
    }
    const hit = this._stepAnim(dt);
    if (hit && this.anim === 'attack') this._applyHit(game);
    this._clamp();
  }

  _clamp() {
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, Z_MIN, Z_MAX);
  }

  _combat(dt, game) {
    if (this.attacking) {
      if (this.anim !== 'attack') this.attacking = false;
      return; // saldırı animasyonu bitene kadar bekle
    }
    const t = game.nearestEnemy(this.pos);
    this.target = t;
    if (!t) { this.play('idle'); return; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.setFacing(Math.sign(dx));
    const reach = this.stats.range + t.radius;
    if (dist > reach) {
      const spd = this.stats.speed;
      this.pos.x += (dx / dist) * spd * dt;
      this.pos.z += (dz / dist) * spd * dt;
      this.play(this.moveAnim, false, 1.1);
    } else if (this.attackCd <= 0) {
      // saldırı: animasyon hızı saldırı hızına göre
      const baseDur = this.meta.attack.durs.reduce((a, b) => a + b, 0) / 1000;
      const interval = 1 / this.atkSpeed;
      const spd = Math.max(1, baseDur / (interval * 0.9));
      this.play('attack', true, spd);
      this.attacking = true;
      this.hitDone = false;
      this.attackCd = interval;
      this.onAnimEnd = () => { this.attacking = false; this.play('idle'); };
      game.audio.play('swing');
    } else {
      this.play('idle');
    }
  }

  rollDamage(mult = 1) {
    const crit = Math.random() < this.critChance;
    const dmg = this.stats.atk * mult * (crit ? this.stats.critDmg : 1) * (0.9 + Math.random() * 0.2);
    return { dmg, crit };
  }

  _applyHit(game) {
    const t = this.target;
    if (!t || t.dead) return;
    const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    if (dist > this.stats.range + t.radius + 0.6) return;
    const { dmg, crit } = this.rollDamage(1);
    const facing = this.facing;
    // kılıç dalgası: kılıçtan çıkar, hedefe uçar; hasar ve darbe efekti çarptığı anda
    const from = this.pos.clone().add(new THREE.Vector3(facing * 0.6, 1.35, 0.3));
    const to = t.pos.clone(); to.y = 1.3; to.z += 0.2;
    game.fx.slashWave(from, to, {
      facing, color: crit ? 0xfff0a0 : this.slashColor, size: crit ? 1.45 : 1.1,
      onArrive: () => {
        if (t.dead) return;
        t.takeDamage(dmg, game, crit);
        const ip = t.pos.clone(); ip.y = 1.3;
        game.fx.impact(ip, { color: crit ? 0xffe27a : 0xffffff, size: crit ? 1.8 : 1.1 });
        game.fx.burst(ip, { count: crit ? 16 : 8, color: crit ? 0xffdd44 : t.def.skel ? 0xe8e0c8 : 0xff6a4a, speed: crit ? 6 : 4, size: crit ? 0.5 : 0.35, life: 0.35 });
        t.knockback(new THREE.Vector3(facing, 0, 0), crit ? 0.35 : 0.12);
        game.hitStop(crit ? 0.075 : 0.04);
        game.audio.play(crit ? 'crit' : 'hit');
        if (crit) game.fx.shake(0.35);
        // dalga yanındaki bir düşmana daha sıçrayabilir (%35 hasar)
        const other = game.enemies.find((e) => e !== t && !e.dead && e.active && Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z) < 1.6);
        if (other) { other.takeDamage(dmg * 0.35, game, false); game.fx.impact(other.pos.clone().setY(1.3), { color: this.slashColor, size: 0.8 }); }
      },
    });
  }

  dispose() {
    this.shield.dispose();
    this.scene.remove(this.group);
  }
}
