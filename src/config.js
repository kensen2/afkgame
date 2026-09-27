// =====================================================================
//  ZİNDAN DALGALARI — Tüm denge (balance) sayıları burada.
//  Oyunu zorlaştırmak / kolaylaştırmak için sadece bu dosyayı değiştir.
//  Bu dosya Three.js'e bağlı değildir; denge simülasyonu (sim/) da kullanır.
// =====================================================================

export const CONFIG = {
  // ---- Dalga / zorluk ----
  wave: {
    hpGrowth: 1.14,          // düşman canı  = taban × hpGrowth^(dalga-1)
    dmgGrowth: 1.085,         // düşman hasarı = taban × dmgGrowth^(dalga-1)
    goldGrowth: 1.13,        // gold düşüşü  = taban × goldGrowth^(dalga-1)
    xpGrowth: 1.10,
    baseCount: 3,            // ilk dalgadaki düşman sayısı
    countPerWave: 0.45,      // her dalgada eklenen düşman
    maxCount: 12,
    eliteEvery: 5,           // her 5. dalga elit
    bossEvery: 10,           // her 10. dalga boss
    wavesPerFloor: 10,       // her 10 dalgada kat değişir
    walkDistance: 16,        // dalgalar arası yürüme mesafesi (birim)
    spawnAhead: 11,          // düşmanların kahramanın ne kadar önünde doğacağı
    maxWave: 100,
    lateStart: 30,           // bu dalgadan sonra düşmanlar daha yavaş güçlenir
    lateHpGrowth: 1.085,
    lateDmgGrowth: 1.055,            // son dalga: 100. dalgadaki final boss yenilince oyun kazanılır
  },
  elite: { hp: 3, dmg: 1.5, gold: 3, xp: 3, scale: 1.25 },
  boss:  { hp: 9, dmg: 1.7, gold: 12, xp: 12, scale: 1.6 },

  // Düşmanların genel güç çarpanı (can ve hasar). 0.75 = %25 daha zayıf
  enemyPower: 0.75,

  // Ölünce: geri sayım (sn) sonra öldüğün dalganın 1 altından otomatik yeniden başlar
  respawnCountdown: 20,
  respawnWavesBack: 1,

  // ---- Genel (hesap) seviyesi ----
  account: {
    xpBase: 40,              // level 1→2 için gereken XP
    xpGrowth: 1.28,          // her level için gereken XP çarpanı
    hpPerLevel: 0.02,        // her level +%2 can
    atkPerLevel: 0.02,       // her level +%2 hasar
    skillPointsPerLevel: 1,
  },

  // ---- Zırh formülü: alınan hasar = hasar × (1 - zırh/(zırh + armorK)) ----
  armorK: 40,

  // ---- Gold ile geliştirmeler (her kahraman için ayrı) ----
  // maliyet = baseCost × costGrowth^(seviye)
  upgrades: {
    // kind 'mult': her seviye bir öncekinin üstüne katlanır (1+per)^seviye
    atk:     { name: 'Saldırı',       icon: '⚔️', baseCost: 15, costGrowth: 1.27, per: 0.07, kind: 'mult', desc: 'Hasar ×1.07 (katlanarak)' },
    hp:      { name: 'Can',           icon: '❤️', baseCost: 15, costGrowth: 1.27, per: 0.07, kind: 'mult', desc: 'Maksimum can ×1.07 (katlanarak)' },
    armor:   { name: 'Zırh',          icon: '🛡️', baseCost: 25, costGrowth: 1.30, per: 3,    kind: 'flat', desc: 'Zırh +3' },
    atkSpd:  { name: 'Saldırı Hızı',  icon: '💨', baseCost: 45, costGrowth: 1.45, per: 0.05, kind: 'pct',  desc: 'Saldırı hızı +%5', max: 20 },
    crit:    { name: 'Kritik Şansı',  icon: '🎯', baseCost: 45, costGrowth: 1.45, per: 0.015,kind: 'flat', desc: 'Kritik şansı +%1.5', max: 25 },
    goldBon: { name: 'Gold Bonusu',   icon: '💰', baseCost: 60, costGrowth: 1.50, per: 0.08, kind: 'pct',  desc: 'Düşen gold +%8', max: 30 },
    regen:   { name: 'Yenilenme',     icon: '✨', baseCost: 50, costGrowth: 1.45, per: 0.004,kind: 'flat', desc: 'Saniyede canın %0.4\'ü', max: 15 },
  },

  // ---- Yetenek geliştirme ----
  skillUpgrade: {
    baseCost: 60, costGrowth: 1.6,  // gold maliyeti
    pointCost: 1,                   // yetenek puanı maliyeti
    powerPer: 0.20,                 // her seviye etki +%20
    cdReducePer: 0.04,              // her seviye bekleme süresi -%4
    minCdMult: 0.5,
    maxLevel: 10,
  },

  // ---- Kahramanlar ----
  heroes: {
    warrior: {
      name: 'Sarı-Mavi Varior',
      role: 'Tank',
      desc: 'Kalkanı ve ağır zırhıyla dalgaları göğüsleyen şövalye.',
      hp: 220, atk: 13, armor: 8, atkSpd: 1.0, crit: 0.05, critDmg: 1.5,
      speed: 3.4, range: 1.9, hitFrame: 4, height: 2.35,
      skills: [
        { id: 'bash',   name: 'Kalkan Darbesi', icon: '🛡️', cd: 6,  power: 1.6, stun: 1.6,
          desc: 'Hedefe kalkanla vurur (%160 hasar), 1.6 sn sersemletir.' },
        { id: 'guard',  name: 'Savunma Duruşu', icon: '🔰', cd: 14, power: 0.5, dur: 4,
          desc: '4 sn boyunca alınan hasar %50 azalır, vuranlara %30 geri yansır.' },
        { id: 'charge', name: 'Hücum',          icon: '💥', cd: 10, power: 2.0, dist: 7,
          desc: 'İleri atılır, yolundaki herkese %200 hasar verip geri iter.' },
      ],
    },
    lion: {
      name: 'Aslan Kılıçlı',
      role: 'Saldırı',
      desc: 'Hızlı ve ölümcül kılıç ustası. Az can, çok hasar.',
      hp: 150, atk: 21, armor: 3, atkSpd: 1.15, crit: 0.15, critDmg: 2.0,
      speed: 3.8, range: 2.0, hitFrame: 2, height: 2.45,
      skills: [
        { id: 'spin',  name: 'Döner Kılıç', icon: '🌀', cd: 7,  power: 1.8, radius: 3.0,
          desc: 'Etrafındaki tüm düşmanlara %180 hasar.' },
        { id: 'roar',  name: 'Kükreme',     icon: '🦁', cd: 12, power: 0.6, radius: 4.5, fear: 2.2,
          desc: 'Yakındakileri geri iter, %60 hasar verir ve 2.2 sn korkutur.' },
        { id: 'rage',  name: 'Öfke',        icon: '🔥', cd: 16, power: 0.6, dur: 5,
          desc: '5 sn boyunca saldırı hızı +%60, kritik şansı +%20.' },
      ],
    },
  },

  // ---- Düşmanlar (KayKit) ----
  // unlock: hangi dalgadan itibaren çıkar, weight: çıkma ağırlığı
  enemies: {
    Skeleton_Minion:  { name: 'İskelet Er',        hp: 30,  dmg: 5,  armor: 0, speed: 2.4, range: 1.6, atkCd: 1.3, gold: 3, xp: 3, unlock: 1,  weight: 10, kind: 'melee',
                        weapons: { r: 'Skeleton_Blade' }, attack: '1H_Melee_Attack_Chop', skel: true },
    Skeleton_Warrior: { name: 'İskelet Savaşçı',   hp: 62,  dmg: 8,  armor: 4, speed: 1.8, range: 1.7, atkCd: 1.6, gold: 5, xp: 5, unlock: 3,  weight: 7,  kind: 'melee',
                        weapons: { r: 'Skeleton_Axe', l: 'Skeleton_Shield_Large_A' }, attack: '1H_Melee_Attack_Slice_Diagonal', skel: true },
    Skeleton_Rogue:   { name: 'İskelet Suikastçı', hp: 26,  dmg: 7,  armor: 0, speed: 3.6, range: 1.5, atkCd: 0.9, gold: 4, xp: 4, unlock: 4,  weight: 6,  kind: 'melee',
                        weapons: { r: 'Skeleton_Blade', l: 'Skeleton_Blade' }, attack: 'Dualwield_Melee_Attack_Stab', skel: true },
    Skeleton_Mage:    { name: 'İskelet Büyücü',    hp: 24,  dmg: 9,  armor: 0, speed: 2.0, range: 7.0, atkCd: 2.2, gold: 6, xp: 6, unlock: 6,  weight: 5,  kind: 'ranged', proj: 'orb',
                        weapons: { r: 'Skeleton_Staff' }, attack: 'Spellcast_Shoot', skel: true },
    Rogue:            { name: 'Haydut Nişancı',    hp: 32,  dmg: 8,  armor: 1, speed: 2.4, range: 8.0, atkCd: 2.0, gold: 7, xp: 7, unlock: 8,  weight: 5,  kind: 'ranged', proj: 'bolt',
                        show: ['1H_Crossbow'], attack: '1H_Ranged_Shoot', tint: 0x7a6a8a },
    Rogue_Hooded:     { name: 'Gölge Suikastçı',   hp: 38,  dmg: 10, armor: 1, speed: 3.8, range: 1.5, atkCd: 0.8, gold: 8, xp: 8, unlock: 11, weight: 5,  kind: 'melee',
                        show: ['Knife', 'Knife_Offhand'], attack: 'Dualwield_Melee_Attack_Slice', tint: 0x6a5a7a },
    Barbarian:        { name: 'Yozlaşmış Barbar',  hp: 95,  dmg: 15, armor: 3, speed: 2.0, range: 1.9, atkCd: 2.0, gold: 10, xp: 10, unlock: 13, weight: 4, kind: 'melee',
                        show: ['2H_Axe'], attack: '2H_Melee_Attack_Chop', tint: 0x8a6a6a },
    Knight:           { name: 'Kara Şövalye',      hp: 120, dmg: 11, armor: 12, speed: 1.9, range: 1.8, atkCd: 1.5, gold: 12, xp: 12, unlock: 16, weight: 4, kind: 'melee',
                        show: ['1H_Sword', 'Badge_Shield'], attack: '1H_Melee_Attack_Slice_Diagonal', tint: 0x55556a },
    Mage:             { name: 'Kara Büyücü',       hp: 45,  dmg: 14, armor: 1, speed: 2.0, range: 8.0, atkCd: 2.4, gold: 12, xp: 12, unlock: 18, weight: 4, kind: 'ranged', proj: 'fire',
                        show: ['2H_Staff'], attack: 'Spellcast_Shoot', tint: 0x6a5a8a },
  },

  // Boss sırası (dalga 10, 20, 30...). Liste bitince başa döner.
  // 100. dalgadaki final boss
  finalBoss: { type: 'Knight', name: 'Zindan Efendisi Malakor', summon: true, hpMult: 1.5 },

  bosses: [
    { type: 'Skeleton_Warrior', name: 'Kemik Lordu' },
    { type: 'Barbarian',        name: 'Kasap Grom' },
    { type: 'Skeleton_Mage',    name: 'Nekromant Morth', summon: true },
    { type: 'Knight',           name: 'Kara Şövalye Valdor' },
    { type: 'Mage',             name: 'Alev Cadısı Ysra', summon: true },
  ],

  // Kat temaları (her 10 dalgada bir sıradakine geçilir)
  floors: [
    { name: 'Kemik Mahzeni',     fog: 0x0a0c12, torch: 0xff8a3d, ambient: 0x3a3f55, tile: 'floor_tile_large' },
    { name: 'Unutulmuş Zindan',  fog: 0x0c0914, torch: 0xb57bff, ambient: 0x3a3055, tile: 'floor_tile_large' },
    { name: 'Kan Salonu',        fog: 0x120707, torch: 0xff4a2a, ambient: 0x4a2a2a, tile: 'floor_tile_large' },
    { name: 'Zümrüt Mahzen',     fog: 0x06110e, torch: 0x4dffa0, ambient: 0x2a4a40, tile: 'floor_tile_large' },
  ],
};

// ------- Yardımcı formüller (oyun ve simülasyon ortak kullanır) -------
export const F = {
  isBoss: (w) => w % CONFIG.wave.bossEvery === 0,
  isElite: (w) => !F.isBoss(w) && w % CONFIG.wave.eliteEvery === 0,
  floorOf: (w) => Math.floor((w - 1) / CONFIG.wave.wavesPerFloor),
  // dalga lateStart'a kadar hızlı, sonrasında daha yavaş büyüme
  _grow: (g, late, w) => {
    const L = CONFIG.wave.lateStart;
    return w <= L ? Math.pow(g, w - 1) : Math.pow(g, L - 1) * Math.pow(late, w - L);
  },
  enemyHp: (base, w) => base * CONFIG.enemyPower * F._grow(CONFIG.wave.hpGrowth, CONFIG.wave.lateHpGrowth, w),
  enemyDmg: (base, w) => base * CONFIG.enemyPower * F._grow(CONFIG.wave.dmgGrowth, CONFIG.wave.lateDmgGrowth, w),
  enemyGold: (base, w) => base * Math.pow(CONFIG.wave.goldGrowth, w - 1),
  enemyXp: (base, w) => base * Math.pow(CONFIG.wave.xpGrowth, w - 1),
  waveCount: (w) => Math.min(CONFIG.wave.maxCount, Math.floor(CONFIG.wave.baseCount + (w - 1) * CONFIG.wave.countPerWave)),
  xpToNext: (lvl) => Math.round(CONFIG.account.xpBase * Math.pow(CONFIG.account.xpGrowth, lvl - 1)),
  upgradeCost: (key, lvl) => {
    const u = CONFIG.upgrades[key];
    return Math.round(u.baseCost * Math.pow(u.costGrowth, lvl));
  },
  skillCost: (lvl) => Math.round(CONFIG.skillUpgrade.baseCost * Math.pow(CONFIG.skillUpgrade.costGrowth, lvl - 1)),
  armorMult: (armor) => 1 - armor / (armor + CONFIG.armorK),

  // Kahramanın tüm bonuslar dahil istatistikleri
  heroStats(heroId, save) {
    const h = CONFIG.heroes[heroId];
    const up = save.heroes[heroId].upgrades;
    const U = CONFIG.upgrades;
    const lv = save.level - 1;
    return {
      maxHp: h.hp * Math.pow(1 + U.hp.per, up.hp || 0) * (1 + lv * CONFIG.account.hpPerLevel),
      atk: h.atk * Math.pow(1 + U.atk.per, up.atk || 0) * (1 + lv * CONFIG.account.atkPerLevel),
      armor: h.armor + (up.armor || 0) * U.armor.per,
      atkSpd: h.atkSpd * (1 + (up.atkSpd || 0) * U.atkSpd.per),
      crit: Math.min(0.9, h.crit + (up.crit || 0) * U.crit.per),
      critDmg: h.critDmg,
      goldMult: 1 + (up.goldBon || 0) * U.goldBon.per,
      regen: (up.regen || 0) * U.regen.per,
      speed: h.speed, range: h.range,
    };
  },
  skillPower(skillDef, lvl) {
    return skillDef.power * (1 + (lvl - 1) * CONFIG.skillUpgrade.powerPer);
  },
  skillCd(skillDef, lvl) {
    return skillDef.cd * Math.max(CONFIG.skillUpgrade.minCdMult, 1 - (lvl - 1) * CONFIG.skillUpgrade.cdReducePer);
  },
};
