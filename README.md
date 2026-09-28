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
- Her 10 dalgada bir **kat** değişir: Kemik Mahzeni → Unutulmuş Zindan → Kan Salonu → Zümrüt Mahzen (sonra başa döner).
- Düşmanlar gold ve XP düşürür. XP ile **genel seviye** artar. Seviye iki kahraman için ortaktır; her seviyede +%2 can, +%2 hasar ve 1 yetenek puanı gelir.
- Gold ile **dükkandan** geliştirme alınır. Geliştirmeler her kahraman için ayrı tutulur.
- Ölünce toplanan gold ve XP kaybolmaz. 20 saniyelik geri sayımdan sonra öldüğün dalganın bir altından otomatik devam edersin (10'da öldüysen 9'dan). Geri sayım sırasında dükkana girebilirsin; dükkandayken sayaç durur.
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

**Boss'lar:** Kemik Lordu (10), Kasap Grom (20), Nekromant Morth (30, iskelet çağırır), Kara Şövalye Valdor (40), Alev Cadısı Ysra (50). Liste 60-90 arasında başa döner. 100. dalgada final boss: Zindan Efendisi Malakor.

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
src/systems/economy.js     Gold, XP, seviye, geliştirmeler, kayıt (kripto buraya bağlanacak)
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

## Ekonomi (v3, Solana'ya hazır)

**İlke:** para sadece içeri girer, dışarı çıkmaz. Gold da Gems de paraya çevrilemez; "oyna-kazan" vaadi yok.
Bedava oyuncu oyunu bitirebilir ama yavaş; ödeme zaman ve konfor kazandırır, oyunu kilitlemez.

**İki para birimi**

| | Gold | Gems 💎 |
|---|---|---|
| Nereden | Düşmanlar, AFK, Time Skip | İleride Solana yatırımı (1 USDC = 100 Gems). Oyun içinden: her boss'un ilk yenilişi +5 (+1 Skill Tome), 100. dalga +100 |
| Nereye | Geliştirmeler, yetenekler | Gems mağazası |

**Gems mağazası** (dükkanda 💎 Gems sekmesi; Deposit butonu şimdilik "Coming soon · Solana"):
Time Skip 30 (2 saatlik AFK altını), Gold Rush 50 (24 saat ×2 altın), Idle Pass 300 (kalıcı: AFK %25, 24 saat),
Skill Tome 20 (yetenek Lv6+ için), Revive 10 (ölüm ekranında: aynı dalgadan devam).
Test için `?dev=1` ile açınca Gems sekmesinde "+100 Gems (test)" butonu çıkar.

**İlerleme eğrisi** (`src/config.js`)
- 10. dalga boss'unun canı %50 (`boss.hpScaleByWave`).
- Altın: `taban × (1 + 0.20 × (dalga − 1))`.
- Attack/Health/Armor maliyeti parçalı: Lv0–20 üs 1.35, Lv21–40 üs 2.4, Lv41+ üs 3.0 (`costSegs`), süreksizlik yok.
- Düşmanlar üç evrede güçlenir (1–25 / 25–60 / 60+). Duvarı can değil hasar yapar, böylece savaşlar kısa kalır.
- AFK ve Time Skip oyuncunun **gerçek** aktif kazanç hızını (`activeRate`) kullanır; duvara dayanmışken şişkin AFK olmaz.

**Simülasyon** (`node sim/balance.mjs`, 1x hız, aktif oyun süresi, AFK hariç):

| Dalga | Hedef bedava | Warrior | Lion | Hedef harcayan (~$10) | Warrior | Lion |
|---|---|---|---|---|---|---|
| 10 | 5 dk | 3 dk | 4 dk | 5 dk | 3 dk | 4 dk |
| 20 | 40 dk | 43 dk | 66 dk | 40 dk | 22 dk | 35 dk |
| 30 | 2 sa | 1.9 sa | 2.3 sa | 1.5 sa | 1.0 sa | 1.2 sa |
| 50 | 12 sa | 10.7 sa | 11.1 sa | 5 sa | 4.7 sa | 5.3 sa |
| 75 | 35 sa | 39.8 sa | 37.9 sa | 14 sa | 18.3 sa | 17.6 sa |
| 100 | 80 sa | 73.6 sa | 69.8 sa | 30 sa | 34.0 sa | 32.0 sa |

Sonraki fazlar (sunucu kaydı, cüzdanla giriş, Solana yatırımı, NFT kahraman) `docs/YENI_SOHBET_PROMPT.md` içinde.
