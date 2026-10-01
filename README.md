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
  Iron Barracks → Sunken Sewers → Blood Hall → Emerald Vault → The Deep Mines → Forgotten Halls → Bone Crypt → Frost Catacombs → Gilded Treasury → Malakor's Throne.
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
src/ui/social-ui.js        Nick ekranı, clan ekranı (lider/officer paneli), sıralamalar
src/systems/social.js      Nick/clan/sıralama katmanı (backend'den bağımsız), clan bonusu
src/systems/clan-rules.js  Clan yetki kuralları ve doğrulama
src/net/local-backend.js   Sunucusuz demo backend: bot oyuncular ve clanlar (Supabase'e kadar)
supabase/schema.sql        Supabase tablo ve fonksiyon taslağı (yetki kontrolü sunucuda)
src/fx/effects.js          Parçacıklar, hasar yazıları, ekran sarsıntısı
src/core/audio.js          Dosyasız, kodla üretilen ses efektleri
assets/heroes/             Videolardan çıkarılmış saydam sprite sheet'ler + sprites.json
assets/enemies|weapons|dungeon/  KayKit modelleri (gereksiz animasyonlar temizlendi)
lib/                       Three.js r170 (internet olmadan da çalışsın diye)
sim/balance.mjs            Denge simülasyonu: `node sim/balance.mjs` (bedava + harcayan)
sim/model.mjs              Simülasyon modeli (simulate fonksiyonu)
sim/v5.mjs                 Ekonomi v5 simülasyonu: `node sim/v5.mjs` (100–2.000 oyuncu, bot senaryosu)
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

## Ekonomi (v5): saatlik üretim, anahtarlar, iki havuz, 10 günlük sezon

Ayrıntılar: **`whitepaper.html`**. Ayarlar: `src/config.js` → `CONFIG.v5`. Simülasyon: `node sim/v5.mjs`.

- **Üretim:** Sezonun en iyi dalgasına göre saatlik DGN üretimi. Dalga 1'de 100/saat, 20'de 2.000/saat (bedava tavanı). 21 ve sonrasında her anahtar kademesi, paket fiyatını ~48 saatte geri üretecek şekilde artar (30. dalga 4.083/saat, 100. dalga ~200K/saat). Sağ üstte canlı sayaç, Claim ile bakiyeye geçer. Oyun kapalıyken en fazla 12 saat birikir.
- **Bedava oyuncu:** 1–20 arası. 20. dalga boss'undan sonra 10 saniye "The Sealed Gate" ekranı çıkar, sonra 15'e döner (15–20 döngüsü).
- **Anahtarlar (10'lu paket, dolar bazlı):** Bronze 21–30 $10 (tek anahtar $4), Silver 31–40 $15, Gold 41–50 $25, Platinum 51–60 $40, Diamond 61–70 $60, Ruby 71–80 $100, Obsidian 81–90 $200, Dragon 91–100 $500.
  - Her yeni dalgaya ilk girişte 1 anahtar harcanır, dalga sezon boyunca açık kalır.
  - Kullanılmamış anahtarlar sonraki sezona taşınır.
  - Paketler sadece yatırılan DGN ile alınır. Tek Bronze anahtar üretilen DGN ile de alınabilir.
- **Havuzlar:** Bedava ve yatıran havuzu, her biri günde 10M. Pay üretime orantılıdır ve kendi üretiminle sınırlıdır. Yatıranın havuz payı ilk yatırımdan 48 saat sonra başlar.
- **Çekim:**
  - Önce yatırdığın kadar (günlük sınırsız), sonra sadece o günün havuz payı. Fazlası oyunda kalır.
  - İki adım: oyun → kasa (%5 komisyon, yarısı yakılır) → cüzdan.
  - Cüzdanda 12 saattir 20K+ DGN tutma şartı var.
- **Forge:** Oyun içi DGN ile hasar ve can ×1,10 / seviye.
- **Sezon:** 10 gün. Dalga, gold, seviye, geliştirmeler, Forge ve oyunda üretilen DGN sıfırlanır. Anahtarlar ve çekilmemiş anapara kalır.
- **Faz 1 = test modu:** Gerçek token yok. Cüzdan ekranındaki Deposit butonları demo token verir, cüzdana gönderim kapalıdır. `?dev=1` ile "+1 gün" ve "cüzdana gönderimi simüle et" test butonları çıkar.

Sonraki fazlar (sunucu kaydı, cüzdanla giriş, Solana yatırımı, NFT kahraman) `docs/YENI_SOHBET_PROMPT.md` içinde.

## Nick, clan ve sıralama

- İlk girişte nick seçilir (3–16 karakter, harf/rakam/_ , benzersiz).
- Clan kurmak 25.000 DGN ("Spent in the dungeon" sayacına yazılır). En fazla 250 üye.
- Lider: istek onay/red, en fazla 2 officer atama, üye atma, liderliği devretme, clanı dağıtma.
- Officer: sadece katılma isteklerini onaylar/reddeder. Üye atamaz, clanı dağıtamaz.
- Sıralama: oyuncular sezonluk üretime, clanlar üyelerin toplam üretimine göre (bonus hariç).
- İlk 5 clanın üyeleri üretim bonusu alır: %10 / %5 / %3 / %2 / %1. Clana girince hemen başlar.
  Havuzlar sabit 10M kaldığı için bonus yeni token basmaz, havuzdan daha büyük pay verir.
- Şu an (Faz 1) dünya `src/net/local-backend.js` içinde bot oyuncularla simüle edilir. Bot clanlara
  atılan istek birkaç saniyede onaylanır; kendi clanına botlar istek gönderir.
  `?dev=1` ile clan ekranında "View as leader/officer/member" test düğmeleri çıkar.
- Supabase'e geçiş: `supabase/schema.sql` çalıştırılır, aynı metotlara sahip bir `SupabaseBackend`
  yazılıp `src/systems/social.js` içinde `LocalBackend` yerine kullanılır.
