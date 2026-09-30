// Giriş noktası: asset'leri yükle, kaydı oku, menüyü göster.
import { loadAll } from './core/assets.js';
import { Economy } from './systems/economy.js';
import { UI } from './ui/ui.js';
import { Game } from './game.js';
import { loadSounds, Audio } from './core/audio.js';

async function boot() {
  Economy.load();
  Economy.lastOfflineDgn = Economy.accrue().produced;   // sezon kontrolü + kapalıyken biriken üretim (en fazla 12 saat)
  // Menü müziği siteye girer girmez başlasın (kayıtlı ses ayarlarıyla)
  const st = Economy.data.settings;
  Audio.setMusicEnabled(st.music);
  Audio.setMusicVolume(st.musicVol ?? 0.1);
  Audio.setSfxVolume(st.sfxVol ?? 0.1);
  Audio.setMusic('menu');
  // Tarayıcı sesi engellediyse ilk etkileşimde başlat
  const unlock = () => {
    Audio.unlock();
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, unlock, true));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, true));
  const ui = new UI();
  try {
    await loadAll((p) => ui.loading(p));
    loadSounds(); // sesler arka planda yüklenir, oyunu bekletmez
  } catch (e) {
    console.error(e);
    document.getElementById('load-text').textContent =
      'Could not load game files. Start the game through a local server (baslat.bat) or its web address.';
    return;
  }
  const game = new Game(document.getElementById('game'), document.getElementById('overlay'), ui);
  ui.setGame(game);
  window.__game = game; window.__eco = Economy; // geliştirme/test için
  game.showMenuScene();
  ui.syncButtons();
  ui.showTitle();
  if (Economy.economyReset) { Economy.save(); ui.toast('The economy was rebalanced. Progress has been reset.'); }
  else if (Economy.seasonReset) ui.toast('A new season has begun! Waves and upgrades were reset. Your keys are kept.');
  ui.checkOffline(); // uzun süre sonra gelindiyse "Welcome back" ekranı
}

boot();
