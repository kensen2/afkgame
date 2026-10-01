// Kahraman yetenekleri: kullanım, otomatik kullanım kararları.
import * as THREE from 'three';
import { F } from '../config.js';
import { Economy } from './economy.js';

function enemiesWithin(game, pos, r) {
  return game.enemies.filter((e) => !e.dead && e.active && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) <= r + e.radius);
}

const IMPL = {
  // ---------- Sarı-Mavi Varior ----------
  bash: {
    ready(h, g) { const t = g.nearestEnemy(h.pos); return t && Math.hypot(t.pos.x - h.pos.x, t.pos.z - h.pos.z) <= h.stats.range + t.radius + 0.4; },
    cast(h, g, def, lvl) {
      const t = g.nearestEnemy(h.pos); if (!t) return false;
      h.setFacing(Math.sign(t.pos.x - h.pos.x));
      h.play('attack', true, 2.2); h.attacking = true; h.onAnimEnd = () => { h.attacking = false; };
      const { dmg, crit } = h.rollDamage(F.skillPower(def, lvl));
      t.takeDamage(dmg, g, crit);
      t.applyStun(def.stun);
      const dir = new THREE.Vector3(Math.sign(t.pos.x - h.pos.x) || 1, 0, 0);
      t.knockback(dir, 1.2);
      const p = t.pos.clone(); p.y = 1.3;
      g.fx.burst(p, { count: 18, color: 0x66aaff, speed: 5, size: 0.45 });
      g.fx.slash(h.pos.clone().add(new THREE.Vector3(h.facing * 1.0, 1.3, 0.3)), { facing: h.facing, color: 0x66b8ff, radius: 1.7, width: 0.8, dur: 0.24, a0: 1.6, a1: -1.2 });
      g.fx.impact(p, { color: 0x9fd0ff, size: 2.2, life: 0.12 });
      g.hitStop(0.08);
      g.fx.shake(0.4); g.audio.play('shield');
      return true;
    },
  },
  guard: {
    ready(h, g) { return h.hp / h.stats.maxHp < 0.7 || enemiesWithin(g, h.pos, 3).length >= 3 || g.bossAlive(); },
    cast(h, g, def, lvl) {
      h.buffs.guard = def.dur;
      h.guardReduce = Math.min(0.85, F.skillPower(def, lvl));
      g.fx.ring(h.pos, { color: 0x55aaff, radius: 3, life: 0.5 });
      g.fx.burst(h.pos.clone().setY(1.2), { count: 20, color: 0x55aaff, speed: 3, up: 3 });
      g.audio.play('shield');
      return true;
    },
  },
  charge: {
    ready(h, g) { const e = g.enemies.filter((e) => !e.dead && e.active); return e.length > 0 && e.some((x) => Math.abs(x.pos.x - h.pos.x) > 2.5); },
    cast(h, g, def, lvl) {
      const alive = g.enemies.filter((e) => !e.dead && e.active);
      if (!alive.length) return false;
      // en kalabalık yöne atıl
      const tgt = alive.reduce((a, b) => (Math.abs(b.pos.x - h.pos.x) > Math.abs(a.pos.x - h.pos.x) ? b : a));
      const dir = new THREE.Vector3(tgt.pos.x - h.pos.x, 0, tgt.pos.z - h.pos.z);
      const len = Math.min(def.dist, dir.length() + 0.5); dir.normalize();
      h.setFacing(Math.sign(dir.x));
      const hitSet = new Set();
      const mult = F.skillPower(def, lvl);
      h.dash = {
        dir, remaining: len, speed: 22,
        onStep: (hero) => {
          for (const e of enemiesWithin(g, hero.pos, 1.3)) {
            if (hitSet.has(e)) continue; hitSet.add(e);
            const { dmg, crit } = hero.rollDamage(mult);
            e.takeDamage(dmg, g, crit);
            e.knockback(new THREE.Vector3(dir.x, 0, (Math.random() - 0.5)), 2.2);
            g.fx.burst(e.pos.clone().setY(1.2), { count: 12, color: 0xffcc55, speed: 5 });
            g.fx.impact(e.pos.clone().setY(1.3), { color: 0xffe08a, size: 1.5 });
            g.hitStop(0.035);
          }
          g.fx.burst(hero.pos.clone().setY(0.3), { count: 2, color: 0xaaaaaa, speed: 1, up: 1, size: 0.5, life: 0.4 });
        },
      };
      g.fx.shake(0.5); g.audio.play('skill');
      return true;
    },
  },
  // ---------- Aslan Kılıçlı ----------
  spin: {
    ready(h, g) { return enemiesWithin(g, h.pos, 3).length >= 2 || (g.bossAlive() && enemiesWithin(g, h.pos, 3).length >= 1); },
    cast(h, g, def, lvl) {
      const list = enemiesWithin(g, h.pos, def.radius);
      h.play('attack', true, 2.5); h.attacking = true; h.onAnimEnd = () => { h.attacking = false; };
      const mult = F.skillPower(def, lvl);
      for (const e of list) {
        const { dmg, crit } = h.rollDamage(mult);
        e.takeDamage(dmg, g, crit);
        const d = new THREE.Vector3(e.pos.x - h.pos.x, 0, e.pos.z - h.pos.z).normalize();
        e.knockback(d, 0.8);
      }
      g.fx.slash(h.pos.clone().setY(0.9), { ground: true, full: true, color: 0xffc860, radius: def.radius * 0.8, width: 0.9, dur: 0.32 });
      g.fx.slash(h.pos.clone().setY(1.4), { ground: true, full: true, color: 0xffffff, radius: def.radius * 0.55, width: 0.5, dur: 0.26 });
      if (list.length) g.hitStop(0.06);
      g.fx.ring(h.pos, { color: 0xff9a2a, radius: def.radius, life: 0.35 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.fx.burst(new THREE.Vector3(h.pos.x + Math.cos(a) * 2, 1, h.pos.z + Math.sin(a) * 2), { count: 1, color: 0xffaa33, speed: 2, up: 1 });
      }
      g.fx.shake(0.4); g.audio.play('skill');
      return true;
    },
  },
  // Inferno: alev sütunu + yanan zemin (görsel ve hasar mantığı ultimates.js içinde)
  inferno: {
    ready(h, g) { return g.ults.ready(h, { id: 'inferno', radius: 3.2 }); },
    cast(h, g, def, lvl) {
      const k = F.skillPower(def, lvl) / def.power;          // seviye atladıkça hem patlama hem yanma güçlenir
      return g.ults.cast(h, { ...def, power: def.power * k, burn: def.burn * k });
    },
  },
  rage: {
    ready(h, g) { return enemiesWithin(g, h.pos, 4).length >= 2 || g.bossAlive(); },
    cast(h, g, def, lvl) {
      h.buffs.rage = def.dur;
      h.rageBonus = F.skillPower(def, lvl);
      g.fx.burst(h.pos.clone().setY(1.2), { count: 30, color: 0xff4a1a, speed: 4, up: 4, size: 0.5 });
      g.audio.play('roar');
      return true;
    },
  },
};

export const Skills = {
  // i: 0,1,2 — manual: oyuncu bastı mı
  tryCast(game, i, manual = false) {
    const h = game.hero;
    if (!h || h.dead || game.phase !== 'combat' || h.dash || h.casting > 0) return false;
    if (h.skillCds[i] > 0) { if (manual) game.audio.play('denied'); return false; }
    const def = h.def.skills[i];
    const impl = IMPL[def.id];
    if (!manual && !impl.ready(h, game)) return false;
    if (manual && !game.enemies.some((e) => !e.dead && e.active)) return false;
    const lvl = Economy.skillLevel(h.id, i);
    if (!impl.cast(h, game, def, lvl)) return false;
    h.skillCds[i] = F.skillCd(def, lvl);
    game.ui.skillCast(i);
    return true;
  },
  // Ultimate (4. yetenek): uzun bekleme süresi, AUTO açıksa uygun anı kendisi seçer
  tryUlt(game, manual = false) {
    const h = game.hero;
    if (!h || h.dead || game.phase !== 'combat' || h.dash || h.casting > 0) return false;
    const def = h.def.ultimate;
    if (!def) return false;
    if (h.ultCd > 0) { if (manual) game.audio.play('denied'); return false; }
    if (!manual && !game.ults.ready(h, def)) return false;
    if (manual && !game.enemies.some((e) => !e.dead && e.active)) return false;
    if (!game.ults.cast(h, def)) return false;
    h.ultCd = def.cd;
    game.ui.skillCast('ult');
    return true;
  },
  autoCast(game) {
    if (game.hero?.casting > 0) return;
    if (this.tryUlt(game, false)) return;
    for (let i = 0; i < 3; i++) if (this.tryCast(game, i, false)) return;
  },
};
