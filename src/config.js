// =====================================================================
//  ZİNDAN DALGALARI — Tüm denge (balance) sayıları burada.
//  Oyunu zorlaştırmak / kolaylaştırmak için sadece bu dosyayı değiştir.
//  Bu dosya Three.js'e bağlı değildir; denge simülasyonu (sim/) da kullanır.
// =====================================================================

export const CONFIG = {
  // ---- Dalga / zorluk ----
  wave: {
    hpGrowth: 1.12,          // düşman canı  = taban × hpGrowth^(dalga-1)
    dmgGrowth: 1.04,         // düşman hasarı = taban × dmgGrowth^(dalga-1)  (v3: ilk 25 dalga yumuşak)
    // Ekonomi DOĞRUSAL büyür (kripto için sayılar küçük ve öngörülebilir kalsın):
    // gold = taban × (1 + goldPerWave × (dalga-1))
    goldPerWave: 0.20,       // v3: 0.15 → 0.20 (gelir artmaya devam eder, maliyet daha hızlı artar)
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
    // v3 ayarı (sim/balance.mjs ile hedef sürelere oturtuldu):
    lateStart: 25,           // 25–50 arası "yumuşak duvar": düşman canı hızlı büyür
    lateHpGrowth: 1.10,
    lateDmgGrowth: 1.14,     // duvarı can değil hasar yapar: savaşlar kısa kalır, oyuncu ölüp güçlenir
    endStart: 60,            // bu dalgadan sonra büyüme yavaşlar (son oyun uzun ama duvar değil)
    endHpGrowth: 1.06,
    endDmgGrowth: 1.09,      // son dalga: 100. dalgadaki final boss yenilince oyun kazanılır
  },
  elite: { hp: 3, dmg: 1.5, gold: 3, xp: 3, scale: 1.25 },
  boss:  { hp: 9, dmg: 1.7, gold: 12, xp: 12, scale: 1.6,
           // Belirli boss'lara özel can çarpanı (genel çarpan aynı kalır). 10. dalga: yeni başlayanlar takılmasın
           hpScaleByWave: { 10: 0.5 } },

  // Düşmanların genel güç çarpanı (can ve hasar). 0.75 = %25 daha zayıf
  enemyPower: 0.75,

  // Ölünce: geri sayım (sn) sonra öldüğün dalganın 1 altından otomatik yeniden başlar
  respawnCountdown: 10,
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
  // v3 "yumuşak duvar": Attack / Health / Armor parçalı eğri kullanır (costSegs).
  //   seviye 0–20 üs 1.35, 21–40 üs 2.4, 41+ üs 3.0. Parçalar süreksizlik olmadan bağlanır.
  //   (Taslakta 1.8 / 2.2 idi; simülasyonda 80 saat hedefi için yetmedi.)
  costSegs: [[20, 1.35], [40, 2.4], [Infinity, 3.0]],
  upgrades: {
    // kind 'mult': her seviye bir öncekinin üstüne katlanır (1+per)^seviye
    atk:     { name: 'Attack',        icon: '⚔️', baseCost: 14, costExp: 1.35, segs: true, per: 0.07, kind: 'mult', desc: 'Damage ×1.07 (stacks)' },
    hp:      { name: 'Health',        icon: '❤️', baseCost: 14, costExp: 1.35, segs: true, per: 0.07, kind: 'mult', desc: 'Max health ×1.07 (stacks)' },
    armor:   { name: 'Armor',         icon: '🛡️', baseCost: 21, costExp: 1.35, segs: true, per: 3,    kind: 'flat', desc: 'Armor +3' },
    atkSpd:  { name: 'Attack Speed',  icon: '💨', baseCost: 10, costExp: 1.9, per: 0.05, kind: 'pct',  desc: 'Attack speed +5%', max: 20 },
    crit:    { name: 'Crit Chance',   icon: '🎯', baseCost: 10, costExp: 1.9, per: 0.015,kind: 'flat', desc: 'Crit chance +1.5%', max: 25 },
    goldBon: { name: 'Gold Bonus',    icon: '💰', baseCost: 15, costExp: 2.0, per: 0.08, kind: 'pct',  desc: 'Gold drops +8%', max: 30 },
    regen:   { name: 'Regeneration',  icon: '✨', baseCost: 12, costExp: 1.9, per: 0.004,kind: 'flat', desc: 'Heal 0.4% of max health per second', max: 15 },
  },

  // ---- Yetenek geliştirme ----
  skillUpgrade: {
    baseCost: 50, costExp: 2.2,     // gold maliyeti = baseCost × seviye^costExp  (v3.1: 12×lv² çok ucuzdu)
    pointCost: 1,                   // yetenek puanı maliyeti
    powerPer: 0.20,                 // her seviye etki +%20
    cdReducePer: 0.04,              // her seviye bekleme süresi -%4
    minCdMult: 0.5,
    maxLevel: 10,
    // Lv4 ve üstü Skill Tome ister. Anahtar = ulaşılacak seviye, değer = gereken Tome.
    // Bir yetenek için toplam 11 Tome, bir kahramanın 3 yeteneği için 33.
    tomes: { 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 2, 10: 3 },
  },

  // ---- Token ve Realm (Ekonomi v4, Stonewatch tarzı) ----
  // Oyunda TEK değerli para var: oyunun token'ı ($DGN, isim yer tutucu). Gold oyun içinde kalır.
  //  - Token dışarıdan yatırılır (deposit). Harcanmayan kısım (credit) her an komisyonsuz geri çekilebilir.
  //  - Token harcanınca: %burn yakılır, %pool ertesi günün havuzuna döner, kalanı hazineye gider.
  //  - Her gün sabit bir havuz (taban + dünkü harcamanın bir kısmı) oyuncular arasında
  //    Dungeon Power'a (DP) göre bölünür. DP, Vault seviyesine göre ortalamanın belli katında tavanlanır.
  //  - Havuzdan gelen token (earned) günde bir kez, o günün payı kadar, %5 komisyonla çekilir.
  token: {
    symbol: 'DGN',
    usdPerToken: 0.0001,          // lansman tahmini: 10.000 token ≈ $1 (piyasa kuru kullanılacak)
    packs: [5000, 10000, 50000, 100000, 500000],   // yatırma kısayolları (token)
  },
  realm: {
    seasonDays: 30,
    pool: { base: 2000000, fromSpend: 0.30 },       // günlük havuz = taban + dünkü harcama × fromSpend
    spendSplit: { burn: 0.30, pool: 0.30 },          // kalan %40 hazine (ekip, geliştirme, ödüller)
    withdraw: { fee: 0.05, firstAfterHours: 12, perDay: 1 },
    accrueMaxHours: 24,                              // en fazla 24 saatlik pay birikir: her gün gir
    // DP = en iyi dalga × perWave + seviye × perLevel + Relic DP
    dp: { perWave: 1, perLevel: 0.5 },
    // Vault: DP'nin realm ortalamasının en fazla kaç katı sayılacağı. İlk iki seviye gold, sonrası token.
    vault: [
      { cap: 1.25 },
      { cap: 2,   gold: 15000 },
      { cap: 3,   tokens: 20000 },
      { cap: 4,   tokens: 60000 },
      { cap: 6,   tokens: 150000 },
      { cap: 8,   tokens: 300000 },
      { cap: 10,  tokens: 600000 },
    ],
    // Relic: tokenle alınan kalıcı DP (sezon boyunca). Büyük relic az bonus verir.
    relics: {
      candle: { name: 'Crypt Candle', icon: '🕯️', tokens: 1000,   dp: 10 },
      idol:   { name: 'Bone Idol',    icon: '💀', tokens: 10000,  dp: 100 },
      banner: { name: 'War Banner',   icon: '🚩', tokens: 50000,  dp: 520 },
      skull:  { name: 'Dragon Skull', icon: '🐉', tokens: 250000, dp: 2750 },
    },
    // Faz 1 (sunucu yok): havuz payını tahmin etmek için örnek bir realm. Sayılar sim/realm.mjs'den.
    demo: { players: 400, totalCountedDp: 200000 },
  },
  // Token mağazası (eski Gems mağazası; fiyatlar aynı dolar değerinde)
  tokenShop: {
    timeSkip: { name: 'Time Skip',  icon: '⏩', price: 3000,  hours: 2,
                desc: 'Instantly collect 2 hours of offline gold (uses your offline rate).' },
    goldRush: { name: 'Gold Rush',  icon: '💰', price: 5000,  hours: 24, mult: 2,
                desc: 'Double gold from every source for 24 hours.' },
    idlePass: { name: 'Idle Pass',  icon: '🌙', price: 30000, permanent: true, efficiency: 0.25, maxHours: 24,
                desc: 'Offline gold rate 10% → 25% and cap 12h → 24h for the season.' },
    tome:     { name: 'Skill Tome', icon: '📘', price: 2000,
                desc: 'Needed to raise a skill to Lv 4 and above. Bosses drop them the first time you beat them.' },
    revive:   { name: 'Revive',     icon: '💖', price: 1000,
                desc: 'On the defeat screen: continue from the wave you fell on, not one wave back.' },
  },
  // Boss'un İLK yenilişi: Skill Tome (token basılmaz; token sadece havuzdan gelir)
  bossRewards: { 10: 1, 20: 2, 30: 2, 40: 3, 50: 3, 60: 3, 70: 4, 80: 4, 90: 4, 100: 5 },

  // ---- Kahramanlar ----
  heroes: {
    warrior: {
      name: 'Blue-Gold Warrior',
      role: 'Tank',
      desc: 'A knight who weathers every wave behind shield and heavy armor.',
      hp: 220, atk: 18, armor: 12, atkSpd: 1.1, crit: 0.05, critDmg: 1.8,   // v3: Lion ile fark ≤%20
      speed: 3.4, range: 1.9, hitFrame: 4, height: 2.94,
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
      hp: 170, atk: 16, armor: 3, atkSpd: 1.15, crit: 0.15, critDmg: 2.0,   // v3: atk 21 → 16, hp 150 → 170
      speed: 3.8, range: 2.0, hitFrame: 2, height: 3.06,
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
    // ---- Varyantlar (v4.1): aynı ücretsiz KayKit modelleri, farklı silah / renk / boy. model = hangi .glb ----
    Skeleton_Brute:   { model: 'Skeleton_Warrior', name: 'Skeleton Brute', hp: 110, dmg: 14, armor: 6, speed: 1.9, range: 1.8, atkCd: 1.7, gold: 3, xp: 12, unlock: 22, weight: 4, kind: 'melee',
                        weapons: { r: 'Skeleton_Axe', l: 'Skeleton_Axe' }, attack: 'Dualwield_Melee_Attack_Slice', skel: true, scale: 1.2, tint: 0xb8a888 },
    Skeleton_Crossbowman: { model: 'Skeleton_Rogue', name: 'Skeleton Crossbowman', hp: 40, dmg: 13, armor: 1, speed: 2.2, range: 8.5, atkCd: 2.1, gold: 3, xp: 11, unlock: 26, weight: 4, kind: 'ranged', proj: 'bolt',
                        weapons: { r: 'Skeleton_Crossbow' }, attack: '1H_Ranged_Shoot', skel: true },
    Berserker:        { model: 'Barbarian', name: 'Blood Berserker', hp: 90, dmg: 13, armor: 2, speed: 3.0, range: 1.7, atkCd: 1.0, gold: 3, xp: 12, unlock: 31, weight: 4, kind: 'melee',
                        show: ['1H_Axe', '1H_Axe_Offhand'], attack: 'Dualwield_Melee_Attack_Slice', tint: 0xc05040 },
    Frost_Witch:      { model: 'Mage', name: 'Frost Witch', hp: 50, dmg: 15, armor: 1, speed: 2.0, range: 8.0, atkCd: 2.3, gold: 3, xp: 13, unlock: 36, weight: 4, kind: 'ranged', proj: 'frost',
                        show: ['1H_Wand', 'Spellbook_open'], attack: 'Spellcast_Shoot', tint: 0x80c8ff },
    Iron_Warden:      { model: 'Knight', name: 'Iron Warden', hp: 150, dmg: 16, armor: 14, speed: 1.7, range: 2.0, atkCd: 2.0, gold: 4, xp: 15, unlock: 42, weight: 3, kind: 'melee',
                        show: ['2H_Sword'], attack: '2H_Melee_Attack_Slice', scale: 1.1, tint: 0xc8c8d8 },
    Bomber:           { model: 'Rogue', name: 'Goblin Bomber', hp: 42, dmg: 17, armor: 1, speed: 2.6, range: 7.0, atkCd: 2.6, gold: 3, xp: 13, unlock: 47, weight: 3, kind: 'ranged', proj: 'bomb',
                        show: ['Throwable'], attack: 'Throw', tint: 0x6a7a5a },
    Spike_Guard:      { model: 'Knight', name: 'Thorn Guard', hp: 135, dmg: 13, armor: 16, speed: 2.0, range: 1.8, atkCd: 1.4, gold: 4, xp: 15, unlock: 53, weight: 3, kind: 'melee',
                        show: ['1H_Sword', 'Spike_Shield'], attack: '1H_Melee_Attack_Stab', tint: 0x5a7a5a },
  },

  // Boss sırası (dalga 10, 20, 30 ... 90). Her kattın kendi boss'u var.
  // 100. dalgadaki final boss
  finalBoss: { type: 'Knight', name: 'Malakor, Lord of the Dungeon', summon: true, hpMult: 1.5 },

  bosses: [
    { type: 'Skeleton_Warrior', name: 'The Bone Lord' },
    { type: 'Barbarian',        name: 'Grom the Butcher' },
    { type: 'Skeleton_Mage',    name: 'Morth the Necromancer', summon: true },
    { type: 'Knight',           name: 'Valdor the Black Knight' },
    { type: 'Mage',             name: 'Ysra the Flame Witch', summon: true },
    { type: 'Skeleton_Brute',   name: 'Ossuk the Bonecrusher' },
    { type: 'Iron_Warden',      name: 'Warden Korr' },
    { type: 'Frost_Witch',      name: 'Neria the Frost Queen', summon: true },
    { type: 'Berserker',        name: 'Gorvath the Gold-Mad' },
  ],

  // Kat temaları: her 10 dalgada bir kat, her katın kendi zemini, duvarı, bayrağı, dekoru ve ışığı var.
  // (KayKit Dungeon Remastered, CC0). tiles: zemin karoları (ilki ön zemin), walls/deco: [isim, ağırlık].
  floors: [
    { name: 'Bone Crypt', fog: 0x0a0c12, torch: 0xff8a3d, ambient: 0x3a3f55,
      tiles: ['floor_tile_large', 'floor_tile_large_rocks'],
      walls: [['wall', 64], ['wall_arched', 12], ['wall_cracked', 10], ['wall_window_closed', 8], ['wall_gated', 6]],
      banners: ['banner_patternA_red', 'banner_thin_red', 'banner_patternC_brown', 'banner_shield_red'],
      deco: [['barrel_large', 0.7], ['barrel_small_stack', 0.8], ['crates_stacked', 0.7], ['candle_triple', 1.2], ['chest', 1], ['sword_shield_broken', 1]] },
    { name: 'Forgotten Halls', fog: 0x0c0914, torch: 0xb57bff, ambient: 0x3a3055,
      tiles: ['floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_large_rocks'],
      walls: [['wall_cracked', 30], ['wall_broken', 15], ['wall_shelves', 20], ['wall_arched', 20], ['wall', 15]],
      banners: ['banner_patternA_blue', 'banner_thin_blue', 'banner_shield_blue'],
      deco: [['shelves', 0.8], ['bottle_B_green', 1.3], ['candle_melted', 1.3], ['table_medium_broken', 0.9], ['trunk_large_A', 0.9]] },
    { name: 'Blood Hall', fog: 0x120707, torch: 0xff4a2a, ambient: 0x4a2a2a,
      tiles: ['floor_tile_large', 'floor_tile_big_grate', 'floor_tile_large'],
      walls: [['wall_gated', 30], ['wall', 40], ['wall_archedwindow_gated', 15], ['wall_cracked', 15]],
      banners: ['banner_triple_red', 'banner_patternA_red', 'banner_thin_red'],
      deco: [['table_long_tablecloth_decorated_A', 0.8], ['keg_decorated', 0.6], ['barrel_large_decorated', 0.7], ['candle_triple', 1.2], ['plate_stack', 1.2]] },
    { name: 'Emerald Vault', fog: 0x06110e, torch: 0x4dffa0, ambient: 0x2a4a40,
      tiles: ['floor_tile_large_rocks', 'floor_tile_large'],
      walls: [['wall_window_closed', 25], ['wall_arched', 25], ['wall', 50]],
      banners: ['banner_patternA_green', 'banner_thin_green', 'banner_shield_green', 'banner_patternB_green'],
      deco: [['trunk_medium_B', 1], ['trunk_large_A', 0.9], ['coin_stack_medium', 1.1], ['chest', 1], ['candle_lit', 1.3]] },
    { name: 'The Deep Mines', fog: 0x100c06, torch: 0xffc060, ambient: 0x4a3a28,
      tiles: ['floor_dirt_large', 'floor_dirt_large_rocky'],
      walls: [['wall_scaffold', 45], ['wall_window_open_scaffold', 20], ['wall_broken', 20], ['wall', 15]],
      banners: ['banner_patternC_brown', 'banner_patternB_brown'],
      deco: [['box_large', 0.8], ['crates_stacked', 0.7], ['barrel_small_stack', 0.8], ['rubble_large', 0.7], ['rubble_half', 0.9]] },
    { name: 'Sunken Sewers', fog: 0x061012, torch: 0x5fd8ff, ambient: 0x284048,
      tiles: ['floor_tile_big_grate', 'floor_tile_big_grate_open', 'floor_tile_large'],
      walls: [['wall_window_open', 30], ['wall_archedwindow_open', 20], ['wall_cracked', 20], ['wall', 30]],
      banners: ['banner_patternA_white', 'banner_thin_white'],
      deco: [['barrier', 0.9], ['bottle_B_green', 1.3], ['keg_decorated', 0.6], ['barrel_large', 0.7], ['rubble_half', 0.9]] },
    { name: 'Iron Barracks', fog: 0x0e0c0a, torch: 0xfff0c0, ambient: 0x4a4540,
      tiles: ['floor_wood_large', 'floor_wood_large_dark'],
      walls: [['wall_shelves', 25], ['wall', 45], ['wall_window_closed', 30]],
      banners: ['banner_shield_blue', 'banner_shield_white', 'banner_triple_blue'],
      deco: [['bed_decorated', 0.8], ['bed_frame', 0.8], ['sword_shield', 1], ['table_long_decorated_A', 0.8], ['stool', 1.1], ['shelf_large', 0.8]] },
    { name: 'Frost Catacombs', fog: 0x0a1018, torch: 0x9fd8ff, ambient: 0x3a4a60,
      tiles: ['floor_tile_large_rocks', 'floor_tile_large'],
      walls: [['wall_cracked', 40], ['wall_broken', 25], ['wall', 35]],
      banners: ['banner_thin_white', 'banner_shield_white', 'banner_patternA_white'],
      deco: [['candle_melted', 1.3], ['rubble_large', 0.7], ['sword_shield_broken', 1], ['trunk_large_A', 0.9]] },
    { name: 'Gilded Treasury', fog: 0x120e04, torch: 0xffd24a, ambient: 0x55482a,
      tiles: ['floor_tile_large'],
      walls: [['wall_arched', 40], ['wall', 40], ['wall_window_closed', 20]],
      banners: ['banner_triple_yellow', 'banner_patternA_yellow', 'banner_shield_yellow', 'banner_thin_yellow'],
      deco: [['chest_gold', 1], ['coin_stack_large', 1], ['coin_stack_medium', 1.1], ['sword_shield_gold', 1], ['trunk_medium_B', 1]] },
    { name: "Malakor's Throne", fog: 0x100406, torch: 0xff2a2a, ambient: 0x4a2030,
      tiles: ['floor_tile_large_rocks', 'floor_tile_big_spikes', 'floor_tile_large'],
      walls: [['wall_gated', 35], ['wall_cracked', 35], ['wall_archedwindow_gated', 30]],
      banners: ['banner_triple_red', 'banner_shield_red'],
      deco: [['rubble_large', 0.7], ['sword_shield_broken', 1], ['candle_triple', 1.2], ['chest_gold', 1]] },
  ],
};

// ------- Yardımcı formüller (oyun ve simülasyon ortak kullanır) -------
export const F = {
  isBoss: (w) => w % CONFIG.wave.bossEvery === 0,
  isElite: (w) => !F.isBoss(w) && w % CONFIG.wave.eliteEvery === 0,
  floorOf: (w) => Math.floor((w - 1) / CONFIG.wave.wavesPerFloor),
  // dalga lateStart'a kadar hızlı, sonrasında daha yavaş büyüme
  // üç evreli büyüme: 1..lateStart hızlı, lateStart..endStart orta, endStart sonrası yavaş
  _grow: (g, late, end, w) => {
    const L = CONFIG.wave.lateStart, E = CONFIG.wave.endStart ?? Infinity;
    if (w <= L) return Math.pow(g, w - 1);
    if (w <= E) return Math.pow(g, L - 1) * Math.pow(late, w - L);
    return Math.pow(g, L - 1) * Math.pow(late, E - L) * Math.pow(end, w - E);
  },
  enemyHp: (base, w) => base * CONFIG.enemyPower * F._grow(CONFIG.wave.hpGrowth, CONFIG.wave.lateHpGrowth, CONFIG.wave.endHpGrowth, w),
  enemyDmg: (base, w) => base * CONFIG.enemyPower * F._grow(CONFIG.wave.dmgGrowth, CONFIG.wave.lateDmgGrowth, CONFIG.wave.endDmgGrowth, w),
  enemyGold: (base, w) => base * (1 + CONFIG.wave.goldPerWave * (w - 1)),
  enemyXp: (base, w) => base * (1 + CONFIG.wave.xpPerWave * (w - 1)),
  waveCount: (w) => Math.min(CONFIG.wave.maxCount, Math.floor(CONFIG.wave.baseCount + (w - 1) * CONFIG.wave.countPerWave)),
  xpToNext: (lvl) => Math.round(CONFIG.account.xpBase * Math.pow(lvl, CONFIG.account.xpExp)),
  upgradeCost: (key, lvl) => {
    const u = CONFIG.upgrades[key];
    if (!u.segs) return Math.round(u.baseCost * Math.pow(lvl + 1, u.costExp));
    // parçalı polinom: her parçanın sonunda değer korunur, üs değişir
    const x = lvl + 1;
    let v = u.baseCost, start = 1;
    for (const [end, exp] of CONFIG.costSegs) {
      const e = end + 1;                       // seviye 'end' → x = end+1
      if (x <= e) return Math.round(v * Math.pow(x / start, exp));
      v *= Math.pow(e / start, exp); start = e;
    }
    return Math.round(v);
  },
  bossHpScale: (w) => CONFIG.boss.hpScaleByWave?.[w] ?? 1,
  skillCost: (lvl) => Math.round(CONFIG.skillUpgrade.baseCost * Math.pow(lvl, CONFIG.skillUpgrade.costExp)),
  // lvl → lvl+1 için gereken Skill Tome
  skillTomes: (lvl) => CONFIG.skillUpgrade.tomes[lvl + 1] || 0,
  bossReward: (w) => ({ tomes: CONFIG.bossRewards[w] || 0 }),
  usd: (tokens) => tokens * CONFIG.token.usdPerToken,
  // ---- Realm ----
  progressDp: (save) => (save.seasonBest ?? save.bestWave ?? 0) * CONFIG.realm.dp.perWave + (save.level || 1) * CONFIG.realm.dp.perLevel,
  relicDp: (save) => Object.entries(save.relics || {}).reduce((s, [k, n]) => s + (CONFIG.realm.relics[k]?.dp || 0) * n, 0),
  dp: (save) => F.progressDp(save) + F.relicDp(save),
  vaultCap: (lvl) => CONFIG.realm.vault[Math.min(lvl, CONFIG.realm.vault.length - 1)].cap,
  // realm ortalamasına göre sayılan DP
  countedDp: (save, avgDp) => Math.min(F.dp(save), F.vaultCap(save.vault || 0) * avgDp),
  // günlük havuz payı (token). realm = { pool, totalCountedDp, players } (bu oyuncu hariç)
  dailyShare(save, realm) {
    const avg = (realm.totalCountedDp + F.dp(save)) / (realm.players + 1);
    const mine = F.countedDp(save, avg);
    return realm.pool * mine / (realm.totalCountedDp + mine);
  },
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
  // v3: oyuncunun GERÇEK aktif kazanç hızını (activeRate, gold/sn) esas alır; duvara dayanmış
  // oyuncu "20 sn'de bir dalga" varsayımıyla şişkin AFK almasın. Tavan: formül hızı.
  offlineGoldPerSec(save) {
    const w = Math.max(1, save.resumeWave || 1);
    const heroId = save.selectedHero || 'warrior';
    const mult = F.heroStats(heroId, save).goldMult;
    const formula = F.waveGold(w) * mult / CONFIG.offline.waveSeconds;
    const base = save.activeRate > 0 ? Math.min(formula, save.activeRate) : formula;
    return base * F.offlineEfficiency(save);
  },
  offlineEfficiency: (save) => (save.idlePass ? CONFIG.tokenShop.idlePass.efficiency : CONFIG.offline.efficiency),
  offlineMaxHours: (save) => (save.idlePass ? CONFIG.tokenShop.idlePass.maxHours : CONFIG.offline.maxHours),

  skillPower(skillDef, lvl) {
    return skillDef.power * (1 + (lvl - 1) * CONFIG.skillUpgrade.powerPer);
  },
  skillCd(skillDef, lvl) {
    return skillDef.cd * Math.max(CONFIG.skillUpgrade.minCdMult, 1 - (lvl - 1) * CONFIG.skillUpgrade.cdReducePer);
  },
};
