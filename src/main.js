// Giriş noktası: asset'leri yükle, kaydı oku, menüyü göster.
import { loadAll } from './core/assets.js';
import { Economy } from './systems/economy.js';
import { UI } from './ui/ui.js';
import { Game } from './game.js';
import { loadSounds } from './core/audio.js';

async function boot() {
  Economy.load();
  const ui = new UI();
  try {
    await loadAll((p) => ui.loading(p));
    loadSounds(); // sesler arka planda yüklenir, oyunu bekletmez
  } catch (e) {
    console.error(e);
    document.getElementById('load-text').textContent =
      'Dosyalar yüklenemedi. Oyunu "baslat.bat" ile (yerel sunucu üzerinden) açtığından emin ol.';
    return;
  }
  const game = new Game(document.getElementById('game'), document.getElementById('overlay'), ui);
  ui.setGame(game);
  window.__game = game; window.__eco = Economy; // geliştirme/test için
  game.showMenuScene();
  ui.syncButtons();
  ui.showTitle();
}

boot();
