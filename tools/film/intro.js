// =====================================================================
//  Açılış filmi "The Taking" — oyun motorunda KayKit karakterleriyle çekilir, sonra videoya kaydedilir.
//  Oyunda bu kod ÇALIŞMAZ; oyun hazır videoyu (assets/story/intro.mp4) oynatır.
//  Çekim: tools/film/record.py  →  window.__game üzerinde build(game) çağrılır, tick(t) kare kare sürülür.
// =====================================================================
import * as THREE from 'three';
import { CONFIG } from '../../src/config.js';
import { cloneEnemy, cloneWeapon, cloneDungeon } from '../../src/core/assets.js';

const ALL_PROPS = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword',
  '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff',
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'];
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const cl = (x) => Math.min(1, Math.max(0, x));
const lerp = THREE.MathUtils.lerp;

// ---------- oyuncular ----------
function actor(type, { show = [], tint = null, tintK = 0.5, dark = false, scale = 1 } = {}) {
  const { scene: model, animations } = cloneEnemy(type);
  const def = CONFIG.enemies[type] || {};
  if (def.skel) {
    const hr = model.getObjectByName('handslot.r'), hl = model.getObjectByName('handslot.l');
    if (def.weapons?.r && hr) hr.add(cloneWeapon(def.weapons.r));
    if (def.weapons?.l && hl) hl.add(cloneWeapon(def.weapons.l));
  } else for (const n of ALL_PROPS) { const o = model.getObjectByName(n); if (o) o.visible = show.includes(n); }
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone(); o.frustumCulled = false;
    if (tint) o.material.color.lerp(new THREE.Color(tint), tintK);
    if (dark) { o.material.color.set(0x16121a); o.material.roughness = 0.9; }
  });
  model.scale.setScalar(scale);
  const g = new THREE.Group(); g.add(model);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6 * scale, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.5, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; g.add(sh);
  const mixer = new THREE.AnimationMixer(model);
  const clip = (n) => THREE.AnimationClip.findByName(animations, n);
  let cur = null, curName = '';
  const a = {
    g, model, mixer, shadow: sh,
    // anim: oynat (loop=false ise son karede kalır)
    play(name, { loop = true, fade = 0.2, speed = 1 } = {}) {
      if (curName === name) return;
      const act = mixer.clipAction(clip(name)); act.reset(); act.timeScale = speed;
      act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); act.clampWhenFinished = !loop;
      if (cur) act.crossFadeFrom(cur, fade, false);
      act.play(); cur = act; curName = name;
    },
  };
  return a;
}

// ---------- efektler ----------
function glowSprite(game, color, size, opacity = 0) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: game.dungeon.flameTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); return s;
}
function dust(count, box, color = 0xffd8a0) {
  const pos = new Float32Array(count * 3), seed = [];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = box.x0 + Math.random() * (box.x1 - box.x0); pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = box.z0 + Math.random() * (box.z1 - box.z0);
    seed.push(Math.random() * 10);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  p.userData.step = (dt, t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < count; i++) { a[i * 3 + 1] += dt * 0.08; a[i * 3] += Math.sin(t * 0.7 + seed[i]) * dt * 0.05; if (a[i * 3 + 1] > 4) a[i * 3 + 1] = 0; }
    geo.attributes.position.needsUpdate = true;
  };
  return p;
}
function burnedText(lines) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 268;
  const g = c.getContext('2d');
  const sc = g.createRadialGradient(512, 134, 20, 512, 134, 520);
  sc.addColorStop(0, 'rgba(10,5,2,0.85)'); sc.addColorStop(0.55, 'rgba(10,5,2,0.55)'); sc.addColorStop(1, 'rgba(10,5,2,0)');
  g.fillStyle = sc; g.fillRect(0, 0, 1024, 268);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 600 62px Georgia, serif';
  lines.forEach((ln, i) => {
    const y = 134 + (i - (lines.length - 1) / 2) * 92;
    g.shadowColor = 'rgba(255,110,30,0.95)'; g.shadowBlur = 26; g.fillStyle = '#ffb060'; g.fillText(ln, 512, y);
    g.shadowBlur = 6; g.fillStyle = '#ffe2b0'; g.fillText(ln, 512, y);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.renderOrder = 5; return m;
}

// Kamera: [t, pos, look] noktaları arasında yumuşak geçiş (aynı çekim içinde)
function camPath(keys, t) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [ta, pa, la] = keys[i], [tb, pb, lb] = keys[i + 1];
  const k = ease(cl((t - ta) / Math.max(0.001, tb - ta)));
  return { pos: new THREE.Vector3(...pa).lerp(new THREE.Vector3(...pb), k), look: new THREE.Vector3(...la).lerp(new THREE.Vector3(...lb), k) };
}

export function build(game) {
  game.clearWorld();
  game.setFloor(0);
  game.dungeon.rebuild(0);
  const scene = game.scene, root = new THREE.Group(); scene.add(root);
  const hemi0 = game.hemi.intensity;

  // --- oyuncular ---
  const lyra = actor('Knight', { show: ['1H_Sword', 'Badge_Shield'], tint: 0xe8eef8, tintK: 0.45 });
  lyra.g.position.set(6, 0, 0.4); lyra.g.rotation.y = Math.PI / 2;      // +x'e (karanlığa) bakar
  const lamp = new THREE.PointLight(0xffa04a, 2.6, 7, 1.6); lamp.position.set(6.25, 1.0, 1.0);
  const lampGlow = glowSprite(game, 0xffa04a, 0.55, 0.8); lampGlow.position.copy(lamp.position);
  const skels = [
    { a: actor('Skeleton_Warrior'), x: 10.5, z: -0.6 }, { a: actor('Skeleton_Minion'), x: 11.4, z: 1.3 },
    { a: actor('Skeleton_Minion'), x: 12.6, z: -1.6 }, { a: actor('Skeleton_Warrior'), x: 13.4, z: 0.6 },
  ];
  for (const s of skels) { s.a.g.position.set(s.x, -3, s.z); s.a.g.rotation.y = -Math.PI / 2; s.a.g.visible = false; root.add(s.a.g); }
  const mal = actor('Knight', { show: ['2H_Sword'], dark: true, scale: 2.3 });
  mal.g.position.set(19, 0, -0.2); mal.g.rotation.y = -Math.PI / 2; mal.g.visible = false;
  const eyeL = glowSprite(game, 0xff2010, 0.35, 0), eyeR = glowSprite(game, 0xff2010, 0.35, 0);
  const redLight = new THREE.PointLight(0xff2a14, 0, 14, 1.4);
  mal.g.add(eyeL, eyeR, redLight); eyeL.position.set(-0.32, 4.55, 0.13); eyeR.position.set(-0.32, 4.55, -0.13); redLight.position.set(-1, 3.5, 0);
  root.add(lyra.g, lamp, lampGlow, mal.g);

  // mühür kırılması: 8 kıvılcım
  const shards = Array.from({ length: 8 }, (_, i) => {
    const s = glowSprite(game, 0xffb24a, 0.5, 0); root.add(s);
    return { s, dir: new THREE.Vector3(Math.cos(i / 8 * Math.PI * 2) * 0.8 + 1.4, 0.6 + Math.sin(i * 1.7) * 0.5, Math.sin(i / 8 * Math.PI * 2)).normalize(), sp: 4 + (i % 3) };
  });
  const burst = glowSprite(game, 0xffc070, 3.5, 0); root.add(burst);

  // bugün: sancak, kırık kalkan, duvar yazısı
  const banner = cloneDungeon('banner_shield_blue'); banner.rotation.set(-Math.PI / 2 + 0.12, 0, 0.5); banner.position.set(6.2, 0.06, 0.9); banner.visible = false;
  const broken = cloneDungeon('sword_shield_broken'); broken.position.set(7.2, 0, 1.5); broken.rotation.y = -0.8; broken.visible = false;
  const text = burnedText(['They took the Sigil.', 'They took me.']); text.position.set(6.6, 2.7, -3.25);
  const warm = new THREE.PointLight(0xffa860, 0, 6, 1.8); warm.position.set(6.4, 1.4, 1.6);
  root.add(banner, broken, text, warm);
  const motes = dust(260, { x0: 1, x1: 16, z0: -3.5, z1: 3 }); root.add(motes);

  // --- çekimler (s) ---
  const SHOTS = [
    { from: 0, to: 3.4, cam: [[0, [9.6, 1.9, 5.2], [6.2, 1.2, 0.2]], [3.4, [8.8, 1.5, 3.9], [6.4, 1.3, 0.2]]] },          // Lyra kapıda
    { from: 3.4, to: 6.6, cam: [[3.4, [6.4, 1.3, 5.6], [11.8, 0.5, -0.2]], [6.6, [5.4, 1.4, 5.2], [9.0, 0.9, 0]]] },          // iskeletler yerden
    { from: 6.6, to: 9.8, cam: [[6.6, [3.0, 1.2, 4.2], [12, 3.0, 0]], [9.8, [2.6, 1.0, 3.6], [9, 2.2, 0]]] },              // Malakor
    { from: 9.8, to: 13.0, cam: [[9.8, [5.0, 3.6, 6.0], [10, 0.6, 0]], [13.0, [4.0, 3.2, 5.0], [14, 0.6, -0.4]]] },        // mühür + sürükleme
    { from: 13.0, to: 17.0, cam: [[13.0, [4.2, 1.9, 5.4], [6.5, 0.3, 0.9]], [15.0, [5.6, 2.2, 3.4], [6.6, 2.6, -3.3]], [17.0, [4.6, 2.0, 2.6], [20, 0.9, -1]]] }, // bugün
  ];
  const DUR = 17.0;
  let last = 0;

  function shake(t, from, len, amp) { const k = cl(1 - (t - from) / len); return t >= from ? new THREE.Vector3(Math.sin(t * 61) * amp * k, Math.sin(t * 47) * amp * k, 0) : new THREE.Vector3(); }

  return {
    duration: DUR,
    // yeniden üretilebilir: t'yi her zaman ileri sür (kare kare)
    tick(t) {
      const dt = Math.max(0, t - last); last = t;
      const shot = SHOTS.find((s) => t >= s.from && t < s.to) || SHOTS[SHOTS.length - 1];
      const c = camPath(shot.cam, t);
      // çarpışma sarsıntıları
      c.pos.add(shake(t, 5.0, 0.35, 0.06)).add(shake(t, 8.4, 0.5, 0.12)).add(shake(t, 10.0, 0.6, 0.18));
      game.camera.position.copy(c.pos); game.camera.lookAt(c.look);
      game.dungeon.update(6, dt);
      motes.userData.step(dt, t);

      const past = t < 13.0;
      // ışık: Malakor geldikçe meşaleler söner, kırmızı ışık büyür; bugün sıcak ve sakin
      const dim = past ? 1 - 0.75 * cl((t - 6.8) / 2.2) : 0.55 + 0.15 * cl((t - 13) / 1.5);
      for (const l of game.dungeon.lights) l.intensity *= dim;
      for (const tr of game.dungeon.torches) tr.flame.material.opacity = dim;
      game.hemi.intensity = hemi0 * (past ? lerp(1, 0.45, cl((t - 6.8) / 2.2)) : 0.8);

      // Lyra
      lyra.g.visible = past;
      if (t < 4.6) lyra.play('Idle');
      else if (t < 5.6) lyra.play('1H_Melee_Attack_Slice_Diagonal', { loop: false });
      else if (t < 8.2) lyra.play('Idle');
      if (t >= 6.0 && t < 6.6) lyra.play('1H_Melee_Attack_Chop', { loop: false });
      if (t >= 8.2 && t < 8.9) lyra.play('Hit_A', { loop: false });
      if (t >= 8.9) lyra.play('Death_A', { loop: false, speed: 0.8 });
      // sürüklenme: 11.2'den sonra yerde +x'e doğru kayar
      lyra.g.position.x = 6 + (t > 11.2 ? (t - 11.2) * 2.0 : 0);
      lyra.g.position.z = 0.4 - (t > 11.2 ? (t - 11.2) * 0.25 : 0);
      // fener: düşer ve söner
      const fall = cl((t - 8.6) / 0.5);
      lamp.position.set(6.25 + fall * 0.4, lerp(1.0, 0.15, fall * fall), 1.0 + fall * 0.4);
      const lampOn = past ? (t < 8.6 ? 1 : 1 - cl((t - 9.4) / 1.2)) : 0;
      const fl = 0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 41) * 0.05;
      lamp.intensity = 2.6 * lampOn * fl; lampGlow.position.copy(lamp.position); lampGlow.material.opacity = 0.8 * lampOn * fl;

      // iskeletler: 3.6'dan itibaren sırayla yerden çıkar, koşar, saldırır; 11.2'de Lyra'yı sürükler
      skels.forEach((s, i) => {
        const a = s.a, rise = 3.6 + i * 0.35;
        a.g.visible = past && t >= rise;
        if (t < rise) return;
        const k = cl((t - rise) / 1.0);
        if (t < rise + 1.1) { a.play('Spawn_Ground_Skeletons', { loop: false }); a.g.position.set(s.x, lerp(-1.2, 0, k), s.z); }
        else if (t < 7.8) { a.play('Running_A'); const run = cl((t - rise - 1.1) / 1.6); a.g.position.set(lerp(s.x, 7.6 + i * 0.5, run), 0, lerp(s.z, s.z * 0.6, run)); if (run >= 1) a.play('1H_Melee_Attack_Chop'); }
        else if (t < 11.2) { a.play(i % 2 ? 'Cheer' : 'Idle_Combat'); }
        else { a.play('Walking_A'); a.g.rotation.y = Math.PI / 2; a.g.position.x = 7.6 + i * 0.5 + (t - 11.2) * 2.0; }
        if (i === 1 && t >= 5.0) { a.play('Death_C_Skeletons', { loop: false }); if (t >= 11.2) a.g.position.x -= (t - 11.2) * 2.0; }   // Lyra birini devirir, yerde kalır
      });

      // Malakor: 6.8'de karanlıktan çıkar, yaklaşır, kılıcını kaldırır
      mal.g.visible = past && t >= 6.6;
      if (t >= 6.6) {
        const w = cl((t - 6.8) / 1.6);
        mal.g.position.x = lerp(19, 10.2, ease(w));
        mal.play(t < 8.4 ? 'Walking_A' : t < 9.4 ? '2H_Melee_Attack_Chop' : t < 11.2 ? 'Idle' : 'Walking_A', { loop: !(t >= 8.4 && t < 9.4) });
        if (t >= 11.2) { mal.g.rotation.y = Math.PI / 2; mal.g.position.x = 10.2 + (t - 11.2) * 1.6; }
        const eyes = cl((t - 6.7) / 0.6) * (0.85 + Math.sin(t * 9) * 0.15);
        eyeL.material.opacity = eyeR.material.opacity = eyes; redLight.intensity = 6 * eyes;
      }

      // mühür kırılır (9.9): parlama + 8 parça koridora dağılır
      const bt = t - 9.9;
      burst.position.set(6.4, 1.0, 0.4); burst.material.opacity = bt > 0 ? cl(1 - bt / 0.9) * 0.95 : 0; burst.scale.setScalar(2 + cl(bt) * 3);
      for (const sh of shards) {
        const on = bt > 0 && past;
        sh.s.material.opacity = on ? cl(1 - bt / 3.0) : 0;
        if (on) sh.s.position.set(6.4, 1.0, 0.4).addScaledVector(sh.dir, bt * sh.sp);
      }

      // bugün
      banner.visible = broken.visible = !past;
      text.material.opacity = past ? 0 : cl((t - 14.2) / 0.9) * (0.88 + Math.sin(t * 7) * 0.06);
      warm.intensity = past ? 0 : 2.0 + Math.sin(t * 9) * 0.2;

      for (const a of [lyra, mal, ...skels.map((s) => s.a)]) a.mixer.update(dt);
    },
    // ekran kararmaları (çekim geçişleri)
    fade(t) { return Math.max(cl(1 - t / 0.6), cl((t - 12.6) / 0.4) * cl((13.4 - t) / 0.4), cl((t - (DUR - 0.6)) / 0.6)); },
    dispose() { scene.remove(root); game.hemi.intensity = hemi0; },
  };
}
