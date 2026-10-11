# AFK Dungeon: proje durumu ve devir notu

Son güncelleme: 11 Ekim 2026 (main = `754211c`).
Bu dosya, yeni bir Claude sohbetinin projeyi baştan anlaması için yazıldı. Önce bunu, sonra `CLAUDE.md`'yi oku.

---

## 1. Proje ne?

- Tarayıcıda çalışan **idle (AFK) zindan oyunu**. Kahraman koridorda kendi yürür, dalgalar halinde gelen düşmanlarla savaşır.
- **DGN** adlı bir token ekonomisi var. Şu an **test modu**: token gerçek değil, yatırma "demo token".
- Sahibi Türkçe konuşur ve Türkçe cevap ister, sade dille. **Oyundaki bütün yazılar İngilizce.**
- Sahibi kod bilmiyor. Ne yapıldığını teknik ayrıntıya boğmadan, net anlat.

| | |
|---|---|
| Canlı site | https://afkgame.vercel.app (Vercel, `main` dalını otomatik yayınlar) |
| GitHub | `kensen2/afkgame` |
| Sahibinin bilgisayarındaki klasör | `C:\Users\ken\Desktop\kripto-oyun2` (yerel test: `baslat.bat` → `node serve.mjs`, port 5173) |
| Sunucu | Supabase projesi `wfsskmchilndcsauubbs` (eu-central-1, Frankfurt), ücretsiz plan |
| Teknoloji | Three.js r170, düz ES modülleri, build adımı yok, `lib/` içinde three dosyaları |

## 2. Çalışma kuralları (sahibinin kararları)

1. **GitHub'a sadece sahibi "pushla" deyince gönder.** "pushlayalım mı?" bir soru, izin değil.
2. Deneme işleri ayrı dalda (`xxx-test`) yapılır. Sahibi "geri al" derse `main`'e dönülür ve masaüstü dosyaları eski haline getirilir.
3. Her değişiklikten sonra değişen dosyaları masaüstü klasörüne de kopyala (bilgisayar bağlıysa).
   - Dosyaları her seferinde **yeni** bir `/mnt/user-data/outputs/sync_<zaman>/` klasöründen gönder.
   - Kopyadan sonra boyutları `device_list_dir` ile karşılaştır; bir keresinde sessizce eski dosya yazılmıştı.
   - `.claude/` klasörü masaüstüne yazılamıyor.
4. Görünen değişiklikleri `afk-verify` ile masaüstü (1100×620) ve telefon (390×800) boyutunda test et. Her JS dosyasına `node --check`.
5. Yeni npm paketi yok. Görseller: KayKit ve Kenney (CC0) + game-icons.net (CC BY 3.0, pause ekranında isim var). Başka oyunlardan çizim/karakter/kod kopyalanmaz.
6. Müzik Kevin MacLeod (CC BY 4.0). Videolarda ya da paylaşımlarda isim verilmesi zorunlu.
7. Token sahibi tarafından alınıp satılmaz. Wash trading, hacim botu, fiyat desteği asla önerilme.
8. "Burned" sadece zincirde gerçekten yakılan için kullanılır; oyunda harcanan "Spent in the dungeon".
9. **Getiri garantisi verilmez.** Yatıranlara "şu kadar kazanırsın" denmez. Yeni yatıran modeli whitepaper'a bilerek yazılmadı.
10. Commit mesajlarının sonuna atıf satırları eklenir (oturum talimatlarına bak).

## 3. Klasör yapısı

```
index.html, style.css          ekranlar ve tema (taş, demir, pirinç; mor yok)
src/main.js                    açılış
src/config.js                  TÜM sayılar: kahramanlar, skiller, düşmanlar, katlar, ekonomi (CONFIG.v5), sunucu
src/game.js                    oyun döngüsü, dalgalar, boss sandığı, paralar
src/entities/hero.js|enemy.js  kahraman (2D sprite billboard) ve düşmanlar (KayKit 3D)
src/systems/economy.js         DGN ekonomisi (şimdilik tarayıcıda), gold, anahtarlar, çekim
src/systems/skills.js          skiller, ultimates.js ultimate'ler
src/systems/social.js          nick/clan/sıralama katmanı; arkada SupabaseBackend ya da LocalBackend
src/net/supabase-backend.js    Supabase REST (fetch), anonim giriş, RPC çağrıları
src/net/local-backend.js       sunucu yoksa bot dünyası
src/ui/ui.js, social-ui.js     menüler, dükkân, cüzdan, clan ekranı; icons.js SVG ikonlar; intro.js iniş sahnesi
assets/                        heroes (sprite sheet + sprites.json), enemies, dungeon, weapons, audio
supabase/schema.sql            veritabanının kaynağı; 02_clan_actions.sql sahibinin elle çalıştırdığı parça
sim/v5.mjs                     realm simülasyonu (bedava havuz, oyuncu sayıları)
sim/v6-depositor.mjs           yatıran oyuncunun 10 günlük hesabı (tekli anahtar çarpanları)
whitepaper.html                ekonomi anlatımı (yatıran kısmı eski, bilerek güncellenmedi)
.claude/agents, .claude/skills "stüdyo": 12 rol + 13 skill (afk-verify, economy-sim, three.js rehberleri…)
CLAUDE.md                      kurallar ve ekonomi değişmezleri (her oturumda otomatik okunur)
```

## 4. Oyun içeriği

**Kahramanlar** (`CONFIG.heroes`):
- **Blue-Gold Warrior** (tank): Shield Bash, Iron Stance, Charge; ultimate Boulder Toss.
- **Lion Blade** (hasar): Whirlwind, Roar, Rage; ultimate Lion Spirit.
- **Ember Mage** (uzak): Fireball, Inferno, Frost Nova; ultimate Meteor Rain.
  - Sprite'ı KayKit Mage modelinden render edildi: cel shading, renkli ince kontur, pastel lacivert cübbe, turuncu detay.
  - Üretim betiği oturuma özeldi; gerekirse benzerini yeniden yaz.

**Dünya:**
- 100 dalga, 10 kat; her katın teması farklı. Her 10 dalgada bir boss.
- Boss ilk yenilişte **Skill Tome** verir. Ayrıca **boss sandığı** düşer (her boss için 1 kez): ekstra gold ve 10 dalgalık kutsama.

**Dükkân:**
- **Upgrades:** ekipman görünümü (Weapon/Helm/Armor/Gloves/Ring/Purse/Amulet); seviye arttıkça ad ve ikon değişir.
- Diğer sekmeler: Skills, Keys, Forge, Store, Stats.
- HUD'da XP barının altında açılır **Stats** paneli var.
- Açılış: "Enter the Dungeon" sonrası iniş sahnesi. Testte `navigator.webdriver` ile atlanır, `?intro=1` zorlar.

## 5. Ekonomi (güncel, hepsi `CONFIG.v5` içinde)

- **Bedava oyuncu:** dalga 1–20.
  - Saatlik üretim elle yazılmış tablodan: 57, 93, 132 … 1.000 (`rate.free`).
  - 20. dalgadan sonra "Sealed Gate" (10 sn), sonra 15'e döner.
- **Anahtarlı dalgalar (21+):** 2.000 tabanı + her kademe paketi 48 saatte kendini öder (`F.rateAt`).
  - Kademe başına sezonda 10 anahtar; kullanılmayan anahtar sonraki sezona geçer.
  - **Paket** (10 anahtar) sadece **yatırılan** DGN ile alınır.
  - **Tekli anahtar** her kademede, oyunda biriken DGN ile alınır; fiyatı paket ÷ 10 × 4 (`singleKeyMult`).
- **Bedava havuz:** sayılan oyuncuya göre kademeli. 1M ile başlar, her 100 oyuncuda +1M (120 → 2M …), 920'den itibaren 10M sabit.
  - Sayılan oyuncu: 20. dalgaya ulaşmış, son 1 saatte oynamış hesap.
  - Sayım sunucuda yapılmalı; şimdilik demo değeri kullanılıyor.
- **Yatıran oyuncu (v6):** sabit havuz yok.
  1. Önce yatırdığı kadarını üretimiyle geri alır (sadece kesinti uygulanır).
  2. Sonra üretiminin %50 → 40 → 30 → 20'sini çeker (son değer sezon sonuna kadar).
  3. Bütün yatıranların günlük toplamı, sezonda yatırılanın %10'uyla sınırlı (`capOfDeposits`). Demo realm için kısma oranı ×0,62.
  4. Çekilemeyen kısım oyunda kalır (anahtar, Forge, mağaza).
  - Simülasyon: 1M yatıran, tekli anahtarla yükselirse sezonda yaklaşık 1,8M çeker. Garanti değil.
- **Çekim:**
  - İki adım: oyun → kasa → cüzdan.
  - Oyun → kasa kesintisi, 24 saatteki her çekimde artar: %5 → %10 → %20 → %40 (%40'ta durur). 24 saat çekim yapılmazsa %5'e döner. Kesintinin yarısı yakılır.
  - İki çekim arası en az 2 saat.
  - Kasa → cüzdan: cüzdanın **12 saatlik ortalama** bakiyesi en az 20K DGN olmalı. Cüzdan şimdilik simüle ediliyor.
  - Düğme "Get DGN" yazar ("Buy" değil).
- **Diğer:**
  - Sezon 10 gün; Forge sezonda sıfırlanır.
  - Clan kurma 25.000 DGN.
  - İlk 5 clana üretim bonusu %10/5/3/2/1.
  - Reset tuşu DGN ile alınanları (Forge, Tome, anahtar…) bilerek korur.

## 6. Sunucu (Supabase) durumu

- **Bağlı olanlar:** nick, clan, sıralama.
  - Giriş anonim; oturum tarayıcının `localStorage`'ında.
  - Sıralamadaki üretimi sunucu dalgadan hesaplar (`rate_at`, `F.rateAt` ile aynı).
  - Clan işlemleri `security definer` RPC'lerle yapılır; tablolara doğrudan yazma kapalı.
- **Sahibinin yaptıkları:** `02_clan_actions.sql`'i SQL Editor'de çalıştırdı; "Allow anonymous sign-ins" açık.
- **Supabase MCP'nin bir huyu:** `delete` içeren SQL'i onaysız çalıştırmıyor, işlem "cancelled" dönüyor. Böyle SQL'i dosya olarak sahibine ver, SQL Editor'e yapıştırsın.
- **Ağ:** bulut ortamından `*.supabase.co`'ya doğrudan erişim yok (proxy 403). Uçtan uca test sahibinin bilgisayarında ya da canlı sitede yapılır. SQL testleri `execute_sql` ile, sahte `auth.users` + `request.jwt.claims` ve sonunda `rollback` ile yapılabilir.
- **Anahtar:** sadece publishable anahtar `CONFIG.server` içinde. `service_role` asla koda girmez.

### Admin paneli (11 Ekim 2026)
- Adres: `/admin.html` (canlıda https://afkgame.vercel.app/admin.html, yerelde baslat.bat açıkken localhost'ta). Oyunda linki yok.
- Giriş: Supabase'de oluşturulan e-posta/şifre hesabı + `admins` tablosunda kaydı olmalı. Yetki sunucuda kontrol edilir.
- Yapabildikleri: oyuncu arama, ban/ban kaldırma, ödül verme ve geri alma (altın, DGN, tome, her anahtar türü), herkese ödül,
  üretim nerf'ü (%75/50/25/0), nick değiştirme, sıralama sıfırlama, kayıt silme (wipe), oyun içi duyuru, oyuncunun bildirdiği
  durum (altın, DGN, yatırılan, çekilen, anahtarlar, seviye…) ve işlem geçmişi, tüm admin işlemlerinin kaydı.
- Sınır: bakiye/envanter hâlâ oyuncunun tarayıcısında; ödül ve geri alma oyun açıldığında uygulanır, oyuncunun bildirdiği
  durum sahte olabilir. Kalıcı çözüm Faz 2 (bakiyeleri sunucuya taşımak). Sohbet olmadığı için "mute" yok.

## 7. Açık işler ve riskler (öncelik sırasıyla)

1. **Ekonomiyi sunucuya taşı.** DGN bakiyesi, üretim, dalga ilerlemesi, anahtarlar, havuz sayımı, yatıran sınırı, çekimler ve clan kurma ücreti şu an tarayıcıda ve hilelenebilir. Token canlıya çıkmadan önce şart.
2. **Hile ve bot önlemleri:**
   - `?dev=1` test düğmelerini ve `window.__game` / `__eco` küresellerini canlıda kapat.
   - Anonim girişe captcha (Cloudflare Turnstile) ekle.
   - Sahte hesaplara karşı kurallar koy.
3. **Gerçek telefon performansı** hiç ölçülmedi.
4. **Cüzdan / zincir bağlantısı** (Robinhood Chain), kasa sözleşmesi, gerçek yakım. Önce güvenlik incelemesi.
5. **Hukuki:** "yatır, getiri al" yapısı bazı ülkelerde yatırım ürünü sayılabilir. Canlıya çıkmadan kripto hukukçusuna danışılması önerildi.
6. **Küçük işler:**
   - Boss sonrası dalga yazısı bir an yanlış dalgayı gösteriyor olabilir.
   - Mage'in normal saldırısı kılıç dalgası efektinin turuncu hali; ona özel bir efekt yapılabilir.
   - Mage dengesi test edilmedi.
   - Whitepaper'daki yatıran bölümü eski.
   - Sesler ve gerçek yazı tipi bulut testinde duyulamıyor/görünemiyor.
7. **Dil desteği:** çok dil istendi, sonra İngilizce kalmasına karar verildi.
8. **NFT yok** (karar). Okçu kahraman yok (karar).

## 8. Test ve araçlar (bulut oturumunda)

- **Oynama testi:** `python3 .claude/skills/afk-verify/scripts/play.py --hero warrior|lion|mage --wave N --press 1,4 --at 0.5,1.2 --out DIR`. Telefon için `--width 390 --height 800`; menü için `--screen title|select`.
- **Kendi Playwright betiğin:** `.claude/skills/webapp-testing/scripts/with_server.py --server "PORT=P node serve.mjs" --port P -- python3 script.py`
  - Chromium argümanları: `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist --enable-unsafe-swiftshader`
  - Nick'i atlamak için: `localStorage afk_social_v1 = {v:1, me:{id:'me', nick:'Tester', createdAt:1}}`
  - Sunucusuz yerel dünya için `?local=1`.
- **Video:** oyun döngüsünü durdur (`renderer.setAnimationLoop(null)`, `clock.getDelta = () => 1/30`), `frame()`'i elle çağırıp her kareyi kaydet, ffmpeg ile birleştir.
- **Ekonomi:**
  - `node sim/v5.mjs [oyuncu]` ve `node sim/v6-depositor.mjs`.
  - Oyun kodunu Node'da çalıştırmak için `localStorage` taklidi ve sahte `Date.now`.
  - Dikkat: gerçek saatle sezon değişirse veri sıfırlanır.
- **Masaüstü kopyası:** `device_commit_files` (tek çağrıda ≤50 dosya, dosya başına ≤30 MB), sonra `device_list_dir` ile boyut kontrolü.

## 9. Geçmiş (kısa)

Ekonomi v3 → v4 (günlük havuz) → v5 (saatlik üretim, anahtarlar, Sealed Gate, 10 günlük sezon) → v6 deneme (yatıran modeli). Sırasıyla eklenenler:
- Kat temaları, düşman varyantları, vuruş hissi.
- Nick, clan, sıralama.
- Ultimate'ler.
- Stüdyo (ajanlar ve skill'ler).
- İki inceleme turu: para güvenliği, sızıntılar, telefon düzeni.
- Zindan teması ve iniş sahnesi.
- Yuvarlak skill madalyonları.
- Ekipman dükkânı, boss sandığı, ikonlar.
- Bedava üretim 1.000 tavanı, kademeli bedava havuz.
- Ember Mage.
- Artan çekim kesintisi, 12 saat ortalama kuralı.
- Supabase bağlantısı.
- Tekli anahtar.

Ayrıntı için `git log`.

## 10. Yedekten geri dönme

Bu klasörde iki şey var:
- `proje/`: dosyaların düz kopyası. `.claude` klasörü burada `_claude` adıyla duruyor; geri yüklerken adını `.claude` yap.
- `afkgame.bundle`: tüm git geçmişi. Geri yüklemek için: `git clone afkgame.bundle afkgame`.

GitHub'daki `kensen2/afkgame` de aynı içeriği taşır.
