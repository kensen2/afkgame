// Tüm modelleri ve sprite'ları yükler, önbellekte tutar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';

const gltfLoader = new GLTFLoader();
// Yayınlanan web sürümü .glb yerine .gltf.json kullanır (window.__ASSET_EXT)
const EXT = window.__ASSET_EXT || '.glb';
const texLoader = new THREE.TextureLoader();

export const Assets = {
  enemies: {},   // name -> { scene, animations }
  weapons: {},   // name -> scene
  dungeon: {},   // name -> scene
  heroes: {},    // heroId -> { meta, textures: {anim: Texture} }
  spriteMeta: null,
};

const DUNGEON = ['floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_big_spikes', 'wall', 'wall_arched', 'wall_cracked',
  'wall_broken', 'wall_pillar', 'wall_doorway', 'wall_gated', 'wall_window_closed', 'pillar', 'pillar_decorated', 'column',
  'torch_mounted', 'torch_lit', 'barrel_large', 'barrel_small_stack', 'crates_stacked', 'keg_decorated', 'chest', 'chest_gold',
  'coin', 'coin_stack_small', 'coin_stack_large', 'rubble_half', 'banner_patternA_red', 'banner_thin_red', 'banner_patternC_brown',
  'banner_shield_red', 'sword_shield_broken', 'candle_triple', 'table_medium_broken', 'trunk_large_A', 'keyring_hanging'];
const WEAPONS = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Crossbow', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A', 'Skeleton_Arrow'];

function loadGLB(url) {
  return new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
}
function loadTex(url) {
  return new Promise((res, rej) => texLoader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, rej));
}

export async function loadAll(onProgress) {
  const jobs = [];
  let done = 0;
  const track = (p) => p.then((v) => { done++; onProgress?.(done / jobs.length); return v; });

  jobs.push(track(fetch('assets/heroes/sprites.json').then((r) => r.json()).then((m) => { Assets.spriteMeta = m; })));
  for (const name of Object.keys(CONFIG.enemies)) {
    jobs.push(track(loadGLB(`assets/enemies/${name}${EXT}`).then((g) => { Assets.enemies[name] = g; })));
  }
  for (const name of WEAPONS) {
    jobs.push(track(loadGLB(`assets/weapons/${name}${EXT}`).then((g) => { Assets.weapons[name] = g.scene; })));
  }
  for (const name of DUNGEON) {
    jobs.push(track(loadGLB(`assets/dungeon/${name}${EXT}`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      Assets.dungeon[name] = g.scene;
    })));
  }
  const heroAnims = { warrior: ['idle', 'walk', 'run', 'attack'], lion: ['idle', 'walk', 'attack'] };
  for (const [hid, anims] of Object.entries(heroAnims)) {
    Assets.heroes[hid] = { textures: {} };
    for (const a of anims) {
      jobs.push(track(loadTex(`assets/heroes/${hid}_${a}.png`).then((t) => {
        t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        Assets.heroes[hid].textures[a] = t;
      })));
    }
  }
  await Promise.all(jobs);
  for (const hid of Object.keys(heroAnims)) Assets.heroes[hid].meta = Assets.spriteMeta[hid];
}

export function cloneDungeon(name) {
  const src = Assets.dungeon[name];
  if (!src) { console.warn('missing dungeon piece', name); return new THREE.Object3D(); }
  return src.clone(true);
}

export function cloneEnemy(name) {
  const g = Assets.enemies[name];
  return { scene: SkeletonUtils.clone(g.scene), animations: g.animations };
}

export function cloneWeapon(name) {
  return Assets.weapons[name].clone(true);
}
