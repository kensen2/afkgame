// =====================================================================
//  ZİNDAN DALGALARI — Tüm denge (balance) sayıları burada.
//  Oyunu zorlaştırmak / kolaylaştırmak için sadece bu dosyayı değiştir.
//  Bu dosya Three.js'e bağlı değildir; denge simülasyonu (sim/) da kullanır.
// =====================================================================

export const CONFIG = {
  // ---- Dalga / zorluk ----
  wave: {
    hpGrowth: 1.12,          // düşman canı  = taban × hpGrowth^(dalga-1)
    dmgGrowth: 1.07,         // düşman hasarı = taban × dmgGrowth^(dalga-1)
    // Ekonomi DOĞRUSAL büyür (kripto için sayılar küçük ve öngörülebilir kalsın):
    // gold = taban × (1 + goldPerWave × (dalga-1))
    goldPerWave: 0.15,
    xpPerWave: 0.06,
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
    lateHpGrowth: 1.065,
    lateDmgGrowth: 1.04,            // son dalga: 100. dalgadaki final boss yenilince oyun kazanılır
  },
  elite: { hp: 3, dmg: 1.5, gold: 3, xp: 3, scale: 1.25 },
  boss:  { hp: 9, dmg: 1.7, gold: 12, xp: 12, scale: 1.6 },

  // Düşmanların genel güç çarpanı (can ve hasar). 0.75 = %25 daha zayıf
  enemyPower: 0.75,

  // Ölünce: geri sayım (sn) sonra öldüğün dalganın 1 altından otomatik yeniden başlar
  respawnCountdown: 20,
  respawnWavesBack: 1,

  // Çevrimdışı (AFK) kazanç: oyun kapalıyken kahraman savaşmaya devam eder
  offline: {
    maxHours: 12,        // en fazla bu kadar saat birikir
    minSeconds: 60,      // bundan kısa aralarda rapor gösterilmez
    efficiency: 0.1,     // aktif oynamaya göre verim (%10)
    waveSeconds: 20,     // bir dalganın ortalama süresi (yürüme + savaş)
  },

  // ---- Genel (hesap) seviyesi ----
  account: {
    xpBase: 20,              // gereken XP = xpBase × seviye^xpExp
    xpExp: 1.6,
    hpPerLevel: 0.02,        // her level +%2 can
    atkPerLevel: 0.02,       // her level +%2 hasar
    skillPointsPerLevel: 1,
  },

  // ---- Zırh formülü: alınan hasar = hasar × (1 - zırh/(zırh + armorK)) ----
  armorK: 40,

  // ---- Gold ile geliştirmeler (her kahraman için ayrı) ----
  // maliyet = baseCost × (seviye+1)^costExp   (üstel değil, polinom: sayılar küçük kalır)
  upgrades: {
    // kind 'mult': her seviye bir öncekinin üstüne katlanır (1+per)^seviye
    atk:     { name: 'Attack',        icon: '⚔️', baseCost: 4,  costExp: 1.35, per: 0.07, kind: 'mult', desc: 'Damage ×1.07 (stacks)' },
    hp:      { name: 'Health',        icon: '❤️', baseCost: 4,  costExp: 1.35, per: 0.07, kind: 'mult', desc: 'Max health ×1.07 (stacks)' },
    armor:   { name: 'Armor',         icon: '🛡️', baseCost: 6,  costExp: 1.35, per: 3,    kind: 'flat', desc: 'Armor +3' },
    atkSpd:  { name: 'Attack Speed',  icon: '💨', baseCost: 10, costExp: 1.9, per: 0.05, kind: 'pct',  desc: 'Attack speed +5%', max: 20 },
    crit:    { name: 'Crit Chance',   icon: '🎯', baseCost: 10, costExp: 1.9, per: 0.015,kind: 'flat', desc: 'Crit chance +1.5%', max: 25 },
    goldBon: { name: 'Gold Bonus',    icon: '💰', baseCost: 15, costExp: 2.0, per: 0.08, kind: 'pct',  desc: 'Gold drops +8%', max: 30 },
    regen:   { name: 'Regeneration',  icon: '✨', baseCost: 12, costExp: 1.9, per: 0.004,kind: 'flat', desc: 'Heal 0.4% of max health per second', max: 15 },
  },

  // ---- Yetenek geliştirme ----
  skillUpgrade: {
    baseCost: 12, costExp: 2.0,     // gold maliyeti = baseCost × seviye^costExp
    pointCost: 1,                   // yetenek puanı maliyeti
    powerPer: 0.20,                 // her seviye etki +%20
    cdReducePer: 0.04,              // her seviye bekleme süresi -%4
    minCdMult: 0.5,
    maxLevel: 10,
  },

  // ---- Kahramanlar ----
  heroes: {
    warrior: {
      name: 'Blue-Gold Warrior',
      role: 'Tank',
      desc: 'A knight who weathers every wave behind shield and heavy armor.',
      hp: 220, atk: 13, armor: 8, atkSpd: 1.0, crit: 0.05, critDmg: 1.5,
      speed: 3.4, range: 1.9, hitFrame: 4, height: 2.35,
      skills: [
        { id: 'bash',   name: 'Shield Bash', icon: '🛡️', cd: 6,  power: 1.6, stun: 1.6,
          desc: 'Slams the target with the shield (160% damage) and stuns for 1.6s.' },
        { id: 'guard',  name: 'Iron Stance', icon: '🔰', cd: 14, power: 0.5, dur: 4,
          desc: 'Takes 50% less damage for 4s and reflects 30% back to attackers.' },
        { id: 'charge', name: 'Charge',         icon: '💥', cd: 10, power: 2.0, dist: 7,
          desc: 'Dashes forward, dealing 200% damage and knocking back everything in the way.' },
      ],
    },
    lion: {
      name: 'Lion Blade',
      role: 'Damage',
      desc: 'A fast, deadly swordsman. Low health, high damage.',
      hp: 150, atk: 21, armor: 3, atkSpd: 1.15, crit: 0.15, critDmg: 2.0,
      speed: 3.8, range: 2.0, hitFrame: 2, height: 2.45,
      skills: [
        { id: 'spin',  name: 'Whirlwind',   icon: '🌀', cd: 7,  power: 1.8, radius: 3.0,
          desc: 'Deals 180% damage to every enemy around him.' },
        { id: 'roar',  name: 'Roar',        icon: '🦁', cd: 12, power: 0.6, radius: 4.5, fear: 2.2,
          desc: 'Knocks back nearby enemies, deals 60% damage and makes them flee for 2.2s.' },
        { id: 'rage',  name: 'Rage',        icon: '🔥', cd: 16, power: 0.6, dur: 5,
          desc: '+60% attack speed and +20% crit chance for 5s.' },
      ],
    },
  },

  // ---- Düşmanlar (KayKit) ----
  // unlock: hangi dalgadan itibaren çıkar, weight: çıkma ağırlığı
  enemies: {
    Skeleton_Minion:  { name: 'Skeleton Grunt',    hp: 30,  dmg: 5,  armor: 0, speed: 2.4, range: 1.6, atkCd: 1.3, gold: 1, xp: 3, unlock: 1,  weight: 10, kind: 'melee',
                        weapons: { r: 'Skeleton_Blade' }, attack: '1H_Melee_Attack_Chop', skel: true },
    Skeleton_Warrior: { name: 'Skeleton Warrior',  hp: 62,  dmg: 8,  armor: 4, speed: 1.8, range: 1.7, atkCd: 1.6, gold: 2, xp: 5, unlock: 3,  weight: 7,  kind: 'melee',
                        weapons: { r: 'Skeleton_Axe', l: 'Skeleton_Shield_Large_A' }, attack: '1H_Melee_Attack_Slice_Diagonal', skel: true },
    Skeleton_Rogue:   { name: 'Skeleton Assassin', hp: 26,  dmg: 7,  armor: 0, speed: 3.6, range: 1.5, atkCd: 0.9, gold: 1, xp: 4, unlock: 4,  weight: 6,  kind: 'melee',
                        weapons: { r: 'Skeleton_Blade', l: 'Skeleton_Blade' }, attack: 'Dualwield_Melee_Attack_Stab', skel: true },
    Skeleton_Mage:    { name: 'Skeleton Mage',     hp: 24,  dmg: 9,  armor: 0, speed: 2.0, range: 7.0, atkCd: 2.2, gold: 2, xp: 6, unlock: 6,  weight: 5,  kind: 'ranged', proj: 'orb',
                        weapons: { r: 'Skeleton_Staff' }, attack: 'Spellcast_Shoot', skel: true },
    Rogue:            { name: 'Bandit Marksman',   hp: 32,  dmg: 8,  armor: 1, speed: 2.4, range: 8.0, atkCd: 2.0, gold: 2, xp: 7, unlock: 8,  weight: 5,  kind: 'ranged', proj: 'bolt',
                        show: ['1H_Crossbow'], attack: '1H_Ranged_Shoot', tint: 0x7a6a8a },
    Rogue_Hooded:     { name: 'Shadow Assassin',   hp: 38,  dmg: 10, armor: 1, speed: 3.8, range: 1.5, atkCd: 0.8, gold: 2, xp: 8, unlock: 11, weight: 5,  kind: 'melee',
                        show: ['Knife', 'Knife_Offhand'], attack: 'Dualwield_Melee_Attack_Slice', tint: 0x6a5a7a },
    Barbarian:        { name: 'Corrupted Barbarian', hp: 95,  dmg: 15, armor: 3, speed: 2.0, range: 1.9, atkCd: 2.0, gold: 3, xp: 10, unlock: 13, weight: 4, kind: 'melee',
                        show: ['2H_Axe'], attack: '2H_Melee_Attack_Chop', tint: 0x8a6a6a },
    Knight:           { name: 'Dark Knight',       hp: 120, dmg: 11, armor: 12, speed: 1.9, range: 1.8, atkCd: 1.5, gold: 3, xp: 12, unlock: 16, weight: 4, kind: 'melee',
                        show: ['1H_Sword', 'Badge_Shield'], attack: '1H_Melee_Attack_Slice_Diagonal', tint: 0x55556a },
    Mage:             { name: 'Dark Mage',         hp: 45,  dmg: 14, armor: 1, speed: 2.0, range: 8.0, atkCd: 2.4, gold: 3, xp: 12, unlock: 18, weight: 4, kind: 'ranged', proj: 'fire',
                        show: ['2H_Staff'], attack: 'Spellcast_Shoot', tint: 0x6a5a8a },
  },

  // Boss sırası (dalga 10, 20, 30...). Liste bitince başa döner.
  // 100. dalgadaki final boss
  finalBoss: { type: 'Knight', name: 'Malakor, Lord of the Dungeon', summon: true, hpMult: 1.5 },

  bosses: [
    { type: 'Skeleton_Warrior', name: 'The Bone Lord' },
    { type: 'Barbarian',        name: 'Grom the Butcher' },
    { type: 'Skeleton_Mage',    name: 'Morth the Necromancer', summon: true },
    { type: 'Knight',           name: 'Valdor the Black Knight' },
    { type: 'Mage',             name: 'Ysra the Flame Witch', summon: true },
  ],

  // Kat temaları (her 10 dalgada bir sıradakine geçilir)
  floors: [
    { name: 'Bone Crypt',        fog: 0x0a0c12, torch: 0xff8a3d, ambient: 0x3a3f55, tile: 'floor_tile_large' },
    { name: 'Forgotten Halls',   fog: 0x0c0914, torch: 0xb57bff, ambient: 0x3a3055, tile: 'floor_tile_large' },
    { name: 'Blood Hall',        fog: 0x120707, torch: 0xff4a2a, ambient: 0x4a2a2a, tile: 'floor_tile_large' },
    { name: 'Emerald Vault',     fog: 0x06110e, torch: 0x4dffa0, ambient: 0x2a4a40, tile: 'floor_tile_large' },
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
  enemyGold: (base, w) => base * (1 + CONFIG.wave.goldPerWave * (w - 1)),
  enemyXp: (base, w) => base * (1 + CONFIG.wave.xpPerWave * (w - 1)),
  waveCount: (w) => Math.min(CONFIG.wave.maxCount, Math.floor(CONFIG.wave.baseCount + (w - 1) * CONFIG.wave.countPerWave)),
  xpToNext: (lvl) => Math.round(CONFIG.account.xpBase * Math.pow(lvl, CONFIG.account.xpExp)),
  upgradeCost: (key, lvl) => {
    const u = CONFIG.upgrades[key];
    return Math.round(u.baseCost * Math.pow(lvl + 1, u.costExp));
  },
  skillCost: (lvl) => Math.round(CONFIG.skillUpgrade.baseCost * Math.pow(lvl, CONFIG.skillUpgrade.costExp)),
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
  // Bir dalgada düşen ortalama gold (elit/boss payı dahil yaklaşık)
  waveGold(w) {
    const pool = Object.values(CONFIG.enemies).filter((d) => d.unlock <= w);
    const tw = pool.reduce((s, d) => s + d.weight, 0);
    const avg = pool.reduce((s, d) => s + d.gold * d.weight, 0) / tw;
    return F.enemyGold(avg, w) * F.waveCount(w) * 1.2;
  },
  // Çevrimdışı saniye başına gold: devam edeceğin dalgayı farm ediyormuş gibi
  offlineGoldPerSec(save) {
    const w = Math.max(1, save.resumeWave || 1);
    const heroId = save.selectedHero || 'warrior';
    const mult = F.heroStats(heroId, save).goldMult;
    return (F.waveGold(w) * mult / CONFIG.offline.waveSeconds) * CONFIG.offline.efficiency;
  },

  skillPower(skillDef, lvl) {
    return skillDef.power * (1 + (lvl - 1) * CONFIG.skillUpgrade.powerPer);
  },
  skillCd(skillDef, lvl) {
    return skillDef.cd * Math.max(CONFIG.skillUpgrade.minCdMult, 1 - (lvl - 1) * CONFIG.skillUpgrade.cdReducePer);
  },
};
