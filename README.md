# AFK Dungeon

Tarayıcıda çalışan (oyun içi dil: İngilizce), 2.5D, dalga tabanlı ve otomatik ilerleyen bir zindan savaş oyunu.
Three.js ile yazıldı. Kahramanlar senin 2D karakterlerin, düşmanlar ve zindan ise KayKit'in 3D modelleri.

## Nasıl çalıştırılır?

**En kolayı:** `baslat.bat` dosyasına çift tıkla. Tarayıcıda `http://localhost:5173` açılır.
(Bilgisayarında Node.js ya da Python kurulu olmalı.)

Alternatifler:
- `node serve.mjs`
- `npm install` ve ardından `npm run dev` (Vite ile)

> `index.html` dosyasına doğrudan çift tıklarsan oyun açılmaz. Tarayıcılar güvenlik nedeniyle
> dosyadan 3D model yüklemeye izin vermiyor, bu yüzden yerel bir sunucu gerekiyor.

## Kontroller

| Tuş | İşlev |
|---|---|
| 1, 2, 3 | Yetenekleri kullan (ya da ekrandaki butonlara tıkla) |
| A | Otomatik yetenek kullanımını aç/kapa |
| H | Oyun hızını değiştir (1x / 1.5x / 2x / 2.5x) |
| B | Dükkanı aç/kapa |
| Esc | Oyunu duraklat |

## Oyun döngüsü

- Kahraman koridorda kendi kendine yürür. Dalga gelince durur ve en yakın düşmana saldırır.
- Her 5. dalga **elit** dalgadır (turuncu auralı, güçlü düşmanlar). Her 10. dalga **boss** dalgasıdır.
- Her 10 dalgada bir **kat** değişir. Her katın kendi zemini, duvarları, bayrak rengi, dekoru ve ışığı var:
  Bone Crypt → Forgotten Halls → Blood Hall → Emerald Vault → The Deep Mines → Sunken Sewers → Iron Barracks → Frost Catacombs → Gilded Treasury → Malakor's Throne.
- Düşmanlar gold ve XP düşürür. XP ile **genel seviye** artar. Seviye iki kahraman için ortaktır; her seviyede +%2 can, +%2 hasar ve 1 yetenek puanı gelir.
- Gold ile **dükkandan** geliştirme alınır. Geliştirmeler her kahraman için ayrı tutulur.
- Ölünce toplanan gold ve XP kaybolmaz. 10 saniyelik geri sayımdan sonra öldüğün dalganın bir altından otomatik devam edersin (10'da öldüysen 9'dan). Geri sayım sırasında dükkana girebilirsin; dükkandayken sayaç durur.
- Son dalga **100**. 100. dalgada final boss **Zindan Efendisi Malakor** var. Onu yenince oyun kazanılır.
- Düşmanlar genel olarak %25 zayıflatıldı (`src/config.js` → `enemyPower: 0.75`).
- Kayıt tarayıcının hafızasında (localStorage) tutulur.

## Kahramanlar

| | Sarı-Mavi Varior (Tank) | Aslan Kılıçlı (Saldırı) |
|---|---|---|
| Yetenek 1 | Kalkan Darbesi: %160 hasar + sersemletme | Döner Kılıç: etraftaki herkese %180 hasar |
| Yetenek 2 | Savunma Duruşu: %50 hasar azaltma + yansıtma | Kükreme: geri itme + korkutma |
| Yetenek 3 | Hücum: ileri atılıp yol üstündekilere %200 hasar | Öfke: +%60 saldırı hızı, +%20 kritik |

## Düşmanlar (KayKit, hepsi ücretsiz ve CC0)

| Model | Oyundaki adı | Tip | Çıktığı dalga |
|---|---|---|---|
| Skeleton_Minion | İskelet Er | Yakın dövüş | 1 |
| Skeleton_Warrior | İskelet Savaşçı | Tank (balta + kalkan) | 3 |
| Skeleton_Rogue | İskelet Suikastçı | Hızlı, çift kılıç | 4 |
| Skeleton_Mage | İskelet Büyücü | Uzaktan büyü | 6 |
| Rogue | Haydut Nişancı | Uzaktan arbalet | 8 |
| Rogue_Hooded | Gölge Suikastçı | Çok hızlı, çift bıçak | 11 |
| Barbarian | Yozlaşmış Barbar | Ağır, iki elli balta | 13 |
| Knight | Kara Şövalye | Zırhlı tank | 16 |
| Mage | Kara Büyücü | Uzaktan ateş topu | 18 |
| Skeleton_Warrior (varyant) | Skeleton Brute | Çift baltalı, iri iskelet | 22 |
| Skeleton_Rogue (varyant) | Skeleton Crossbowman | Uzaktan arbalet | 26 |
| Barbarian (varyant) | Blood Berserker | Hızlı, çift balta | 31 |
| Mage (varyant) | Frost Witch | Uzaktan buz büyüsü | 36 |
| Knight (varyant) | Iron Warden | İki elli kılıç, çok dayanıklı | 42 |
| Rogue (varyant) | Goblin Bomber | Bomba fırlatır | 47 |
| Knight (varyant) | Thorn Guard | Dikenli kalkan, yüksek zırh | 53 |

Varyantlar aynı ücretsiz modellerin içindeki kullanılmayan silahlarla, renk ve boy farkıyla yapıldı (`src/config.js` → `model` alanı).
KayKit'in ücretsiz (GitHub/CC0) karakter paketleri sadece Skeletons ve Adventurers; ikisindeki 9 karakter de oyunda.

**Boss'lar:** Kemik Lordu (10), Kasap Grom (20), Nekromant Morth (30, çağırır), Kara Şövalye Valdor (40), Alev Cadısı Ysra (50, çağırır), Ossuk the Bonecrusher (60), Warden Korr (70), Neria the Frost Queen (80, çağırır), Gorvath the Gold-Mad (90). 100. dalgada final boss: Zindan Efendisi Malakor.

Kaynaklar: `KayKit-Character-Pack-Skeletons-1.0`, `KayKit-Character-Pack-Adventures-1.0` ve `KayKit-Dungeon-Remastered-1.0` (github.com/KayKit-Game-Assets).
KayKit'in Mystery Monthly serisindeki karakterler ücretli. İndirirsen `assets/enemies/` klasörüne koyup
`src/config.js` içindeki `enemies` listesine ekleyerek oyuna dahil edebilirsin.

## Klasör yapısı

```
index.html, style.css      Sayfa ve arayüz stili
src/config.js              TÜM denge sayıları (zorluk, gold, fiyatlar, kahraman/düşman değerleri)
src/main.js                Giriş noktası
src/game.js                Sahne, kamera, dalga döngüsü, mermiler, paralar
src/world/dungeon.js       Sonsuz zindan koridoru üretimi, meşale ışıkları
src/entities/hero.js       2D sprite kahraman (billboard)
src/entities/enemy.js      KayKit 3D düşman + yapay zeka
src/systems/economy.js     Gold, XP, seviye, geliştirmeler, token cüzdanı, Realm (DP, Vault, Relic, havuz, çekim), kayıt
src/systems/skills.js      Yetenekler ve otomatik kullanım kararları
src/systems/waves.js       Dalga içeriği (hangi düşmandan kaç tane)
src/ui/ui.js               Menüler, HUD, dükkan
src/fx/effects.js          Parçacıklar, hasar yazıları, ekran sarsıntısı
src/core/audio.js          Dosyasız, kodla üretilen ses efektleri
assets/heroes/             Videolardan çıkarılmış saydam sprite sheet'ler + sprites.json
assets/enemies|weapons|dungeon/  KayKit modelleri (gereksiz animasyonlar temizlendi)
lib/                       Three.js r170 (internet olmadan da çalışsın diye)
sim/balance.mjs            Denge simülasyonu: `node sim/balance.mjs` (bedava + harcayan)
sim/model.mjs              Simülasyon modeli (simulate fonksiyonu)
sim/realm.mjs              Realm/havuz simülasyonu: `node sim/realm.mjs` (100–2.000 oyuncu)
whitepaper.html            Ekonomi whitepaper'ı (İngilizce, oyuncular için)
```

## Dengeyi değiştirmek

Tüm sayılar `src/config.js` dosyasında. Değiştirdikten sonra `node sim/balance.mjs warrior` komutunu
çalıştırırsan, oyuncunun kaçıncı denemede hangi dalgaya ulaştığını ve ne kadar süre oynadığını gösteren bir tablo çıkar.
Güncel tahmini süreler aşağıdaki "Ekonomi (v3)" tablosunda.

## Sonraki adımlar (kripto)

`src/systems/economy.js` dışarıya sadece `addGold / spendGold / buyUpgrade / load / save` gibi fonksiyonlar açıyor.
Solana entegrasyonunda bu fonksiyonların içi cüzdan ve zincir çağrılarıyla değiştirilecek. Oyunun geri kalanı değişmeyecek.

## Sesler ve müzik

- **Ses efektleri:** Kenney — Impact Sounds, RPG Audio, Interface Sounds (CC0). `assets/audio/sfx/`
- **Müzik** (`assets/audio/music/`), Creative Commons Attribution 4.0 (isim vermek zorunlu):
  - Menü: "Midnight Tale" — Kevin MacLeod (incompetech.com)
  - Zindan: "Night Vigil" ve "Spellbound" — Kevin MacLeod (incompetech.com)
  - Boss: "Strength of the Titans" — Kevin MacLeod (incompetech.com)
  - Lisans: http://creativecommons.org/licenses/by/4.0/

Efektleri değiştirmek için `src/core/audio.js` içindeki `BANK` listesine bak: her olayın hangi dosyaları, ses seviyesini ve perde aralığını kullandığı orada yazıyor.

## Ekonomi (v4, Stonewatch tarzı günlük havuz)

Ayrıntılar ve tablolar: **`whitepaper.html`** (oyunda başlık ekranındaki 📜 Whitepaper butonu).

**İlke:** Oyunda tek değerli para var: token (**$DGN**, isim yer tutucu). Gold oyun içinde kalır ve asla tokena çevrilmez.
Oyun içinde token basılmaz; oyuncuya giden token sadece **günlük havuzdan** gelir.

| | Gold | $DGN |
|---|---|---|
| Nereden | Düşmanlar, AFK, Time Skip | Yatırma (deposit) ve günlük havuz |
| Nereye | Geliştirmeler, yetenekler, Vault Lv2 | Relic, Vault Lv3+, Store (boost'lar) |
| Çekilir mi | Hayır | Evet (kurallar aşağıda) |

- **Günlük havuz** = 2.000.000 + dünkü token harcamasının %30'u. Oyuncular arasında **sayılan DP**'ye göre bölünür. Pay saat saat birikir, kapalıyken de (en fazla 24 saat).
- **Dungeon Power (DP)** = sezonun en iyi dalgası × 1 + seviye × 0,5 + Relic DP.
- **Vault:** DP, realm ortalamasının en fazla şu katı kadar sayılır: 1,25× (bedava), 2× (15.000 gold), 3×, 4×, 6×, 8×, 10× (token).
- **Relic:** Crypt Candle 1.000 → 10 DP, Bone Idol 10.000 → 100 DP, War Banner 50.000 → 520 DP, Dragon Skull 250.000 → 2.750 DP.
- **Harcanan her token:** %30 yakılır, %30 ertesi günün havuzuna döner, %40 hazineye gider.
- **Çekim:**
  - Yatırılıp harcanmamış token (credit) her an çekilebilir, komisyonsuz.
  - Havuzdan gelen token günde bir kez, o günün payı kadar çekilir, %5 komisyonla. İlk çekim katılımdan 12 saat sonra açılır.
  - Harcama önce havuzdan geleni kullanır, yatırılan korunur.
- **Sezon:** 30 gün. Relic, Vault ve Idle Pass sezonluk. Kahraman, geliştirme ve seviye kalır.
- **Store:** Time Skip 3.000, Gold Rush 5.000, Idle Pass 30.000, Skill Tome 2.000, Revive 1.000.
- **Boss ilk yenilişi:** sadece Skill Tome verir.

**Faz 1 (şu an):** Sunucu yok. Havuz payı `config.realm.demo`'daki örnek realm'e göre hesaplanıyor. Yatırma ve çekme sadece bu tarayıcıda "demo" olarak çalışıyor.
`?dev=1` ile açınca Realm sekmesinde iki test butonu çıkar: "+10,000 DGN (test deposit)" ve "+1 day (test)".

**Simülasyon**
- `node sim/balance.mjs`: bedava ve harcayan oyuncunun dalga süreleri (düşmanlara karşı).
- `node sim/realm.mjs`: 100–2.000 oyuncuda tip başına günlük kazanç, geri dönüş süresi, borsa baskısı ve ekip maliyeti.
- `node sim/realm.mjs 1000 --days`: gün gün döküm.

| Oyuncu | Bedava $/gün | $10 yatıran | $60 | $300 | $10 geri dönüş | $60 | $300 |
|---|---|---|---|---|---|---|---|
| 100 | 1,09 | 6,45 | 9,87 | 19,74 | 2 gün | 5 gün | 15 gün |
| 500 | 0,25 | 0,92 | 2,26 | 4,61 | 2 gün | 7 gün | 30+ |
| 1.000 | 0,12 | 0,47 | 1,19 | 2,37 | 3 gün | 10 gün | 30+ |
| 2.000 | 0,06 | 0,24 | 0,61 | 1,21 | 3 gün | 19 gün | 30+ |

Sonraki fazlar (sunucu kaydı, cüzdanla giriş, Solana yatırımı, NFT kahraman) `docs/YENI_SOHBET_PROMPT.md` içinde.
