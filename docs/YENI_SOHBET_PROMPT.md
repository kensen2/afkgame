# AFK Dungeon — Yeni sohbet için devir promptu

> Bu metnin tamamını yeni bir Claude sohbetine yapıştır. Claude oyunu, klasörleri, çalışma kurallarını ve uygulanacak ekonomi modelini buradan öğrenecek.

---

## 0. Senden istediğim

Benim tarayıcı oyunum **AFK Dungeon** üzerinde çalışacaksın. Oyun çalışıyor ve yayında. Bu sohbetteki görev: aşağıdaki **Ekonomi v3** modelini oyuna kodlamak, simülasyonla doğrulamak ve bana özetlemek. Benimle **Türkçe** konuş, kısa ve net ol. Oyunun içindeki tüm metinler **İngilizce** kalacak.

## 1. Proje bilgileri

- **GitHub repo:** `kensen2/afkgame` (branch `main`). GitHub bağlantım açık; repo'yu `add_repo` ile ekleyip klonla.
- **Canlı site:** https://afkgame.vercel.app. Vercel her push'ta otomatik yayınlıyor. `vercel.json` build yapmasın diye ayarlı.
- **Bilgisayarımdaki kopya:** `C:\Users\ken\Desktop\kripto-oyun2`. Her değişikliği buraya da yaz (masaüstü bağlantısı üzerinden). Ben `baslat.bat` ile `http://localhost:5173`'te oynuyorum.
- **Çalışma kuralları:**
  - GitHub'a **sadece ben "pushla" deyince** gönder. Değişiklikleri önce yerelde commit'le, masaüstü klasörüne kopyala, ben deneyeyim.
  - Commit yazarı: `git config user.email noreply@anthropic.com && git config user.name Claude`.
  - Beni uzun testlerle bekletme. Kısa bir tarayıcı testi ve `sim/balance.mjs` yeterli.
  - Değişiklik sonrası bana F5 ile yenilememi hatırlat.

## 2. Oyun nedir

- Tarayıcıda çalışan, **2.5D, otomatik ilerleyen, dalga tabanlı** bir zindan savaş oyunu (idle / AFK türü). Three.js r170, build yok, düz ES modülleri. `lib/` altında Three.js'in kendisi var, importmap ile yükleniyor.
- **Kahramanlar** 2D sprite, kameraya dönük düzlemde. İki kahraman var:
  - **Blue-Gold Warrior** (tank; yetenekleri: Shield Bash, Iron Stance, Charge)
  - **Lion Blade** (hasar; yetenekleri: Whirlwind, Roar, Rage)
- **Düşmanlar ve zindan** KayKit 3D modelleri (CC0): 4 iskelet ve 5 "kötü" maceracı.
  - 9 düşman tipi, dalgaya göre açılıyor.
  - Her 5. dalga elit, her 10. dalga boss.
  - 100. dalgada final boss: Malakor.
  - Her 10 dalgada bir kat teması değişiyor.
- **Döngü:** Kahraman yürür → dalga gelir → otomatik savaşır → altın ve XP toplar → devam eder. Ölünce 20 sn geri sayım olur ve bir alt dalgadan yeniden başlanır.
- **Dükkan:**
  - Altınla 7 geliştirme: Attack, Health, Armor, Attack Speed, Crit, Gold Bonus, Regen. Her kahramanın kendi geliştirmeleri var.
  - Yetenek geliştirme: altın + yetenek puanı.
  - Hesap seviyesi (XP) iki kahramana ortak.
- **Diğer:**
  - Çevrimdışı altın: aktifin %10'u, en fazla 12 saat, dönüşte "Welcome back" ekranı.
  - Ayarlar: müzik ve efekt seviyesi (varsayılan %10), otomatik yetenek, oyun hızı (1x / 1.5x / 2x / 2.5x), reset progress.
  - Müzik: Kevin MacLeod (CC BY 4.0, jenerik duraklatma menüsünde). Efektler: Kenney (CC0).
- **Kayıt:** tarayıcı `localStorage`, anahtar `zindan_dalgalari_save_v1`. `econVer` alanı yükselince eski ilerleme bir kereliğine sıfırlanır (ayarlar korunur).

## 3. Kod haritası

```
index.html, style.css        Arayüz (loading, title, select, HUD, shop, settings, offline, death, victory, pause)
src/config.js                TÜM denge sayıları + formüller (F objesi). Ekonomi değişikliği önce burada.
src/systems/economy.js       Gold/XP/seviye/geliştirme/kayıt API'si (addGold, spendGold, buyUpgrade, buySkill,
                             claimOffline, reset, load/save). Kripto entegrasyonu ileride buraya bağlanacak.
src/systems/waves.js         Dalga içeriği (buildWave)
src/systems/skills.js        Yetenekler + otomatik kullanım
src/game.js                  Sahne, faz makinesi, altın düşürme (tam sayı, onEnemyDeath), mermiler
src/entities/hero.js|enemy.js
src/ui/ui.js                 Tüm menüler, dükkan render'ı, ayarlar, offline ekranı, ölüm geri sayımı
src/core/audio.js            Ses bankası (BANK) + müzik
sim/balance.mjs              Analitik denge simülasyonu. Kullanım:
                             QUIET=1 node sim/balance.mjs warrior|lion
                             OVR='{"wave":{"goldPerWave":0.1}}' ile ayar üzerine yazılabilir.
                             Çıktı: {"10":dk,"20":dk,...} = o dalgayı geçme süresi (dakika)
```

## 4. Şu anki ekonomi (v2) ve sorunları

- **Altın:** `taban × (1 + 0.15 × (dalga − 1))`, düşman başına taban 1–3. Dalga başına toplam: w1≈3, w25≈140, w50≈380, w100≈750.
- **Maliyet:** `taban × (seviye + 1)^costExp`. Attack/Health/Armor için taban 4–6, üs 1.35. Diğerleri için üs 1.9–2.0.
- **Düşman gücü:** üstel. HP `1.12^w` (30'dan sonra `1.065`), hasar `1.07^w` (30'dan sonra `1.04`), genel çarpan 0.75.
- **Boss:** HP ×9, hasar ×1.7.
- **Sorunlar:**
  - Bedava oyuncu çok hızlı ilerliyor. Simülasyona göre Lion Blade 100. dalgaya yaklaşık 10 saatte, Warrior yaklaşık 22 saatte ulaşıyor. Para harcamaya hiçbir sebep yok.
  - İki kahraman dengesiz: Lion yaklaşık 2 kat hızlı.
  - 10. dalga boss'u yeni başlayanlara duvar gibi geliyor.

## 5. Hedef: Ekonomi v3 (Solana'ya hazır, "oynayan az ve yavaş, yatıran hızlı" modeli)

### 5.1 Temel ilkeler (araştırmadan çıkan dersler)

1. **Oyun içi altın asla paraya çevrilmez.** Para sadece içeri girer, dışarı çıkmaz. Axie Infinity tipi çöküşün sebebi, eski oyuncuların parasının yeni oyuncuların yatırımıyla ödenmesiydi. "Oyna-kazan" (play-to-earn) vaadi **yok**.
2. **Musluk / lavabo dengesi:** Her para kaynağının (düşman altını, AFK, boss ödülü) bir harcama yeri (geliştirme, yetenek, boost) olacak. Oyuncuda enflasyon birikmeyecek.
3. **Sayılar küçük ve tam sayı** kalacak (v2'de yapıldı, korunacak).
4. **Bedava oyuncu oyunu bitirebilmeli**, sadece daha yavaş. Ödeme = zaman kazanmak ve konfor. "Parayla kazan, parasız asla" (pay-to-win duvarı) yok.
5. Gerçek para girince **kayıt sunucuya taşınmalı**; localStorage kolay değiştirilebilir. Bu, sonraki fazın işi.

### 5.2 İki para birimi

| | **Gold** (yumuşak para) | **Gems** (değerli para) |
|---|---|---|
| Nereden gelir | Düşmanlar, AFK kazancı, boss ödülleri | Solana'dan yatırım (USDC/SOL → Gems). Az miktarda oyun içinden: her boss'un **ilk** yenilişi +5 Gems, 100. dalga +100 Gems |
| Nereye gider | Temel geliştirmeler, yetenek Lv1–5 | Aşağıdaki mağaza |
| Zincirde mi | Hayır | Hayır (sunucu kaydında). Yatırım işlemi zincirde doğrulanır |
| Çekilebilir mi | Hayır | Hayır |

**Gems mağazası (v3'te arayüz ve mantık hazır olsun, satın alma butonu şimdilik "Coming soon"):**

| Ürün | Fiyat | Etkisi |
|---|---|---|
| Time Skip | 30 Gems | 2 saatlik AFK kazancını anında verir (AFK oranıyla) |
| Gold Rush | 50 Gems | 24 saat boyunca altın ×2 |
| Idle Pass (kalıcı) | 300 Gems | AFK oranı %10 → %25, AFK süresi 12 → 24 saat |
| Skill Tome | 20 Gems | Yetenek Lv6–10 için gerekli kitap. Bedava oyuncu bunu boss ilk yenilişlerinden de alır (her boss 1 adet) |
| Revive | 10 Gems | Öldüğün dalgadan (bir alt değil) devam et |
| Kozmetik ve 3. kahraman | ileride | NFT kahraman fikri buraya bağlanacak |

**Gems fiyatlandırması (ileride Solana'da):** 1 USDC = 100 Gems. Paketler: $1 = 100, $5 = 550, $10 = 1200, $25 = 3200. SOL da kabul edilir, o anki kurla.

### 5.3 İlerleme eğrisi (uygulanacak sayılar)

- **Başlangıç kolay:**
  - 10. dalga boss HP'si **%50 düşsün**. Sadece ilk boss için `bossHpScale` gibi bir istisna olsun; genel boss çarpanı aynı kalsın.
  - İlk 20 dalgada ölümler az olsun.
- **Dalga 30 civarından sonra "yumuşak duvar":**
  - **Altın geliri artmaya devam eder** (dalga başına doğrusal: `goldPerWave` 0.15 → 0.20).
  - **Geliştirme maliyetleri parça parça dikleşir.** Seviye 0–20: üs 1.35. Seviye 21–40: üs 1.8. Seviye 41+: üs 2.2. Parçalar birbirine süreksizlik olmadan bağlansın.
  - **Yetenek geliştirme:** Lv1–5 altın + yetenek puanı. Lv6–10 bunlara ek olarak **Skill Tome** ister.
- **Hedef süreler (bedava oyuncu, iki kahraman için de, ±%25):**

| Dalga | Bedava oyuncu | ~$10 harcayan (Gold Rush + Time Skip'ler) |
|---|---|---|
| 10 | ≈ 5 dk | aynı |
| 20 | ≈ 40 dk | aynı |
| 30 | ≈ 2 saat | ≈ 1.5 saat |
| 50 | ≈ 12 saat | ≈ 5 saat |
| 75 | ≈ 35 saat | ≈ 14 saat |
| 100 | ≈ 80 saat | ≈ 30 saat |

- **Kahraman dengesi:** Lion ile Warrior'ın 100. dalga süreleri arasındaki fark %20'yi geçmesin.
- **AFK (değişmeyecek):** Bedava oyuncuya aktifin %10'u, 12 saat. Idle Pass ile %25, 24 saat.

### 5.4 Simülasyon güncellemesi

`sim/balance.mjs` şu şekilde genişlesin:
- `--payer` modu: Oyuncu her 2 saatte bir Time Skip, 24 saatte bir Gold Rush alıyor ve Idle Pass'ı var. Bu modu ekle.
- Çıktıda iki satır olsun: bedava oyuncu ve harcayan oyuncu süreleri.
- Ayarları hedef tablodaki sürelere oturana kadar tune et. Grid search yapabilirsin; `OVR` desteği var.

## 6. Bu sohbette yapılacaklar (Faz 1: sadece istemci)

1. `config.js`: Ekonomi v3 sayıları, parçalı maliyet formülü, ilk boss istisnası, Gems ve mağaza tanımları (`CONFIG.gems`, `CONFIG.gemShop`).
2. `economy.js`:
   - Gems bakiyesi, `addGems` / `spendGems`.
   - Skill Tome envanteri.
   - Boss ilk yeniliş ödülleri (hangi boss'ların yenildiği kayıtta tutulsun).
   - Gold Rush süresi ve Idle Pass bayrağı.
   - `econVer: 3` (eski ilerleme bir kereliğine sıfırlanır).
3. Arayüz:
   - HUD'da altının yanında Gems sayacı.
   - Dükkana **Gems** sekmesi: ürünler, açıklamalar, fiyatlar. Satın alma butonları şimdilik test için Gems ile çalışsın.
   - **Deposit** butonu "Coming soon — Solana" desin.
   - Yetenek sekmesinde Lv6+ için Skill Tome gereksinimi görünsün.
4. Revive: Ölüm ekranında "Revive (10 Gems)" butonu olsun: aynı dalgadan devam.
5. `sim/balance.mjs`: payer modu, iki kahraman için hedeflere oturt.
6. `README.md`: "Ekonomi v3" bölümünü güncelle.
7. Kısa tarayıcı testi → masaüstü klasörüne kopyala → yerel commit → bana tablo halinde özet (hedef ve gerçekleşen süreler). **Push etme**, ben söyleyince.

## 7. Sonraki fazlar (şimdi kodlama, sadece bil)

- **Faz 2, hesap ve sunucu:** Vercel serverless fonksiyonları + veritabanı (ör. Supabase).
  - Cüzdanla giriş: Phantom / Solflare, "Sign-In With Solana".
  - Kayıt sunucuda tutulur.
  - Altın kazanımı sunucuda sınırlanır (dalgaya göre dakikalık tavan). AFK sunucu saatiyle hesaplanır.
- **Faz 3, yatırım:** Devnet'te test.
  - Oyuncu USDC/SOL'u hazine cüzdanına gönderir; memo'da oyuncu ID'si olur.
  - Sunucu işlemi RPC ile doğrular: tutar, alıcı, onay durumu, daha önce kullanılmamış imza. Sonra Gems yazar.
  - Mainnet'e geçmeden önce güvenlik gözden geçirmesi yapılır.
- **Faz 4:** NFT kahraman (kozmetik + küçük bonus), sezonluk etkinlikler, liderlik tablosu.
- **Hukuk notu:** Kripto ile ödeme alma kuralları ülkeye göre değişir (Türkiye'de TCMB'nin kripto ile ödemeye dair düzenlemesi var). Canlıya çıkmadan önce hukuki danışmanlık alınmalı. Oyun bir yatırım aracı gibi pazarlanmamalı.
