# Hikaye: "The Ember Watch" — uygulama promptu

Bu dosya, oyuna hikaye eklemek için Claude'a verilecek hazır görev metnidir. Aşağıdaki "PROMPT" bölümünü
yeni bir sohbete (ya da bu projede çalışan Claude'a) olduğu gibi ver. Hikaye metinleri İngilizce (oyun dili),
açıklamalar Türkçe.

---

## Hikayenin özü (sahibin onayı için kısa özet)

- **Kaptan Lyra Vane**, zindanın mühürlerini koruyan Ember Watch'un komutanı. Kahramanın (hangi kahraman seçilirse
  seçilsin) silah arkadaşı ve en yakın dostu.
- Zindanın efendisi **Malakor**, Lyra'nın taşıdığı **Ember Sigil**'i (mühür anahtarı) ele geçirip onu derinlere
  kaçırdı. Sigil'i 8 parçaya böldü ve her parçayı bir katın kapısını mühürlemek için kullandı.
- Girişteki yaşlı kapı bekçisi **Old Brann**, bulunan parçalardan anahtar döver: Bronze, Silver, Gold, Platinum,
  Diamond, Ruby, Obsidian, Dragon. Bu yüzden her 10 dalgada bir kapı açmak için anahtar gerekiyor.
- Her katın boss'u Malakor'un bir komutanı. Her biri Lyra hakkında bir şey söylüyor: Lyra'nın aşağıda yaşadığını,
  direndiğini, kahramana iz bıraktığını anlatıyorlar.
- Lyra kat kat iz bırakıyor: yırtık sancağı, sönmeyen feneri, duvara kazınmış mesajlar.
- 100. dalgada Malakor yenilir, Lyra kurtarılır. Sezon sonu "zindan yeniden mühürleniyor" ile bağlanır; yeni sezon
  yeni bir tehditle açılabilir.

Ton: kısa, sade, biraz hüzünlü ama umutlu. Sahneler 6–10 saniye, her biri **oyuncu başına bir kez**, tıklayınca
atlanır. Anahtar kapılarında baskı yok: geri sayım, "şimdi al yoksa kaybedersin" gibi ifadeler yok. Hikaye sadece
"o aşağıda, seni bekliyor" duygusunu verir.

---

## PROMPT

```
AFK Dungeon'a tek seferlik hikaye sahneleri ekleyeceğiz. Önce CLAUDE.md, docs/PROJE_DURUMU.md ve
src/ui/intro.js dosyalarını oku (açılış sahnesinin yapısını örnek al). Benimle Türkçe konuş; oyundaki
tüm metinler İngilizce kalsın. İşi ayrı bir dalda yap, test et, ekran görüntüsü ve kısa video göster,
"pushla" demeden GitHub'a gönderme. Değişen dosyaları masaüstümdeki kripto-oyun2 klasörüne kopyala.

HİKAYE
Kaptan Lyra Vane, Ember Watch'un komutanı ve kahramanın silah arkadaşı. Malakor onu zindanın dibine
kaçırdı ve Lyra'nın Ember Sigil'ini 8 parçaya bölüp kat kapılarını mühürledi. Girişteki bekçi Old Brann
parçalardan anahtar döver (Bronze → Dragon). Her katın boss'u Malakor'un bir komutanı. 100. dalgada
Malakor yenilince Lyra kurtulur. Hikaye üç kahramanın hepsine uyar (isim yerine "you" kullan).

VERİ
Tüm metinler CONFIG.story içinde dursun (src/config.js), kod içinde metin olmasın. Yapı:
  story.intro            ilk oyunda, açılış sahnesinden sonra
  story.floors[1..10]    kata ilk girişte (dalga 1, 11, 21 … 91)
  story.bossLines[1..9]  boss ilk göründüğünde üstünde 3 saniyelik konuşma balonu
  story.gates[20..90]    anahtar kapısına ilk takılışta (Sealed Gate ekranından ÖNCE, bir kez)
  story.ending           100. dalgada Malakor yenilince
Her sahne en fazla 3 kısa satır; satır başına en fazla ~90 karakter.

GÖSTERİM KURALLARI
- Her sahne oyuncu başına BİR KEZ. Görülenler kayıtta: Economy.data.storySeen = ['intro','floor2',...].
  Reset tuşu storySeen'i SİLMEZ (hikaye tekrar etmesin). Admin "wipe" siler.
- Sahne açıkken oyun durur; tıklama ya da herhangi bir tuş sahneyi atlar; ilk 350 ms atlama yok.
- Otomatik testlerde ve "hareketi azalt" ayarında atlanır (Intro ile aynı kural); ?story=1 testte zorla açar.
- Ayarlara "Story scenes: on/off" anahtarı ekle. Kapalıysa hiçbir sahne çıkmaz.
- Telefonda (390×800) yazılar taşmasın; alt yazı ekranın alt üçte birinde, parşömen şeridi üzerinde.

SAHNE GÖRÜNÜMÜ (KayKit, motor içi)
- O katın kendi sahnesi kullanılır (katın zemini, meşaleleri, bayrakları). Kamera yavaşça ilerler (dolly).
- Lyra için KayKit Adventurers paketindeki Knight modeli kullanılır, düşman Dark Knight ile karışmasın diye
  açık renk (gümüş/beyaz + turuncu) malzeme ve elinde turuncu ışıklı fener (PointLight).
- Lyra sahnelerde uzaktan görünür ya da sadece izi görünür: yırtık mavi sancak (banner_shield_blue),
  yere düşmüş fener (candle_lit + ışık), duvara kazınmış yazı (alt yazı olarak).
- Old Brann: KayKit Barbarian, gri/kahverengi tonlarda, örsün başında (anvil ikonu zaten var).
- Malakor: mevcut finalBoss modeli; sadece gölge/silüet olarak, kırmızı gözlerle görünür (son sahneye kadar).
- Yeni model indirme yok; mevcut assets/ klasöründeki KayKit dosyaları kullanılır. Başka oyundan görsel yok.
- Ses: mevcut müzikler ve Kenney ses kütüphanesi; sahne başında müzik kısılır (ducking), sonunda geri gelir.

TWITTER VİDEOSU (ayrı iş, sahneler bittikten sonra)
- 15–20 saniyelik, 1080×1920 (dikey) ve 1280×720 (yatay) iki sürüm, link/adres yazısı YOK.
- Akış: Lyra'nın son mesajı (2 sn) → kahraman zindana iner (3 sn) → 2–3 kat hızlı geçiş, boss kısa çarpışma
  (8 sn) → kapı ve "She is still down there." (3 sn) → oyun logosu (2 sn).
- Daha önceki video yöntemini kullan: animasyon döngüsünü durdur, clock.getDelta'yı 1/30'a sabitle,
  frame() elle çağır, ffmpeg ile birleştir.

TEST
- node --check her değişen JS dosyasında.
- afk-verify ile masaüstü ve telefon: intro, kat 2 girişi, 20. kapı, bir boss balonu, son sahne.
- Aynı sahnenin ikinci kez çıkmadığını test et (sayfayı yenile, tekrar o kata gir).
- Story kapalıyken hiç sahne çıkmadığını test et.
- Konsol hatası olmasın.
Bitince bana ne değiştiğini, nasıl test edeceğimi ve ekran görüntülerini kısaca göster.
```

---

## Taslak metinler (İngilizce, oyunda görünecek)

**intro** (ilk oyun)
- "The last message from Captain Lyra Vane was burned into the gate:"
- "*They took the Sigil. They took me. Don't come alone.*"
- "You never were good at following orders."

**Old Brann** (ilk anahtar ekranında, bir kez)
- "Malakor broke her Sigil into eight shards and sealed every gate with one."
- "Bring me what you find. I'll forge the keys. She'd do the same for you."

**Kat girişleri** (`floors`)
1. Iron Barracks: "Her Watch slept here. Their banners are torn, but one still hangs straight. Hers."
2. Sunken Sewers: "Ember light on the water. Someone dragged a lantern through here and kept it burning."
3. Blood Hall: "Scratched into the stone: *Still breathing. Still angry. — L.*"
4. Emerald Vault: "Her lantern lies on the floor, still warm. They are moving her deeper."
5. The Deep Mines: "The miners hum a song she used to sing at the gate. She taught them before the chains came."
6. Forgotten Halls: "Every wall here forgets. Every wall but one: *Halfway. Don't you dare stop.*"
7. Bone Crypt: "The dead whisper her name like a curse. She has been giving Malakor a hard time."
8. Frost Catacombs: "Her breath is frozen on the glass of a cell door. Empty. You are close."
9. Gilded Treasury: "Gold to the ceiling, and none of it matters. Below this floor is the throne."
10. (son kat girişi): "The air burns. Somewhere below, a lantern answers your torch."

**Anahtar kapıları** (`gates`, ilk takılışta bir kez, ardından normal Sealed Gate ekranı)
- 20: "Beyond this seal, ember light flickers. She left it burning so you would follow."
- 30: "Old Brann's voice echoes behind you: *The next shard is down there. So is she.*"
- 40–90: her biri tek satır, Lyra'nın bir izine bağlı (aynı ton, baskı yok).

**Boss balonları** (`bossLines`, ilk karşılaşmada)
1. The Bone Lord: "The captain? She broke three of my ribs. I have plenty."
2. Grom the Butcher: "She bit me. I liked her."
3. Morth the Necromancer: "Her soul refuses to kneel. Yours will."
4. Valdor the Black Knight: "I carried her down myself. She never stopped fighting."
5. Ysra the Flame Witch: "Her lantern would not go out. I tried."
6. Ossuk the Bonecrusher: "Bones break. Hers didn't."
7. Warden Korr: "Cell nine. You'll never see it."
8. Neria the Frost Queen: "She sang to keep warm. It was annoying."
9. Gorvath the Gold-Mad: "Malakor promised me her Sigil. Turn back and I'll share."

**ending** (100. dalga, Malakor yenilince)
- "The chains fall. Lyra stands, slowly, and picks up her lantern."
- "*Took you long enough.*"
- "The Ember Sigil is whole again. For now, the dungeon sleeps."
