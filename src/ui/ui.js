// Tüm arayüz: menüler, karakter seçimi, HUD, dükkan, ölüm ekranı.
import { CONFIG, F } from '../config.js';
import { Economy } from '../systems/economy.js';
import { Skills } from '../systems/skills.js';
import { Assets } from '../core/assets.js';
import { Audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
// ?dev=1 → cüzdanda ek test butonları (+1 gün, cüzdana gönderimi simüle et)
const DEV = new URLSearchParams(location.search).has('dev');
const fmtDays = (ms) => {
  const h = Math.max(0, Math.floor(ms / 3600000));
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.max(0, Math.floor(ms / 60000) % 60)}m`;
};
const fmtDur = (ms) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

// Sprite sheet'ten bir kareyi canvas'a çiz
function drawFrame(ctx, heroId, anim, frame, cw, ch, scale = 1, flip = false) {
  const meta = Assets.heroes[heroId].meta[anim];
  const img = Assets.heroes[heroId].textures[anim].image;
  const fw = meta.fw, fh = meta.fh;
  const s = Math.min(cw / fw, ch / fh) * scale;
  const w = fw * s, h = fh * s;
  ctx.save();
  ctx.translate(cw / 2, ch - 4);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, frame * fw, 0, fw, fh, -w / 2, -h, w, h);
  ctx.restore();
}

class Previewer {
  constructor(canvas, heroId) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.id = heroId;
    this.anim = 'idle'; this.f = 0; this.t = 0; this.cycle = 0;
  }
  tick(dt) {
    const meta = Assets.heroes[this.id].meta;
    const m = meta[this.anim];
    this.t += dt * 1000;
    while (this.t >= m.durs[this.f]) {
      this.t -= m.durs[this.f]; this.f++;
      if (this.f >= m.n) {
        this.f = 0; this.cycle++;
        // idle → walk → attack döngüsü
        if (this.cycle >= 2) {
          const order = Object.keys(meta).filter((k) => k[0] !== '_');
          this.anim = order[(order.indexOf(this.anim) + 1) % order.length];
          this.cycle = 0;
        }
        break;
      }
    }
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.c.width !== Math.round(r.width * dpr)) { this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr); }
    this.ctx.clearRect(0, 0, this.c.width, this.c.height);
    drawFrame(this.ctx, this.id, this.anim, this.f, this.c.width, this.c.height, 0.92);
  }
}

export class UI {
  constructor() {
    this.game = null;
    this.selected = Economy.data.selectedHero || 'warrior';
    this.previewers = [];
    this.shopTab = 'upg';
    this.shopReturn = null;
    this.lastT = performance.now();
    this._bind();
    requestAnimationFrame(this._loop.bind(this));
  }

  setGame(g) { this.game = g; }

  _loop(t) {
    const dt = Math.min(0.05, (t - this.lastT) / 1000); this.lastT = t;
    if (!$('screen-select').classList.contains('hidden')) this.previewers.forEach((p) => p.tick(dt));
    requestAnimationFrame(this._loop.bind(this));
  }

  _bind() {
    const click = (id, fn) => $(id).addEventListener('click', () => { Audio.play('click'); fn(); });
    click('btn-play', () => { Audio.setMusic('menu'); this.showSelect(); });
    click('btn-music', () => this.toggleMusic());
    click('btn-title-settings', () => this.openSettings('title'));
    click('btn-hud-settings', () => this.openSettings('game'));
    click('btn-pause-settings', () => { $('screen-pause').classList.add('hidden'); this.openSettings('pause'); });
    click('btn-settings-close', () => this.closeSettings());
    click('btn-set-auto', () => this.toggleAuto());
    click('btn-set-offline', () => { Economy.data.settings.offline = !Economy.data.settings.offline; Economy.save(); this.syncButtons(); });
    click('btn-offline-collect', () => this.closeOffline());
    document.querySelectorAll('#seg-speed button').forEach((b) => b.addEventListener('click', () => {
      Audio.play('click'); Economy.data.settings.speed = +b.dataset.v; Economy.save(); this.syncButtons();
    }));
    const slider = (id, key, apply) => {
      const el = $(id);
      el.addEventListener('input', () => { Economy.data.settings[key] = el.value / 100; apply(el.value / 100); this.syncButtons(); });
      el.addEventListener('change', () => { Economy.save(); if (key === 'sfxVol') Audio.play('hit'); });
    };
    slider('rng-music', 'musicVol', (v) => Audio.setMusicVolume(v));
    slider('rng-sfx', 'sfxVol', (v) => Audio.setSfxVolume(v));
    click('btn-start', () => this.startGame());
    click('btn-select-shop', () => this.openShop('select'));
    click('btn-shop', () => this.openShop('game'));
    click('btn-shop-close', () => this.closeShop());
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-pause-shop', () => { $('screen-pause').classList.add('hidden'); this.openShop('pause'); });
    click('btn-quit', () => { $('screen-pause').classList.add('hidden'); this.toMenu(); });
    click('btn-sound', () => this.toggleSound());
    // Ayarlar ekranındaki sıfırlama (iki tıkla onay)
    click('btn-set-reset', () => {
      const b = $('btn-set-reset'), note = $('reset-note');
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = 'Confirm';
        note.textContent = 'Click Confirm to erase all gold, levels and upgrades.';
        clearTimeout(this._resetT);
        this._resetT = setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset'; note.textContent = 'Start over from wave 1 with 0 gold. Settings are kept.'; }, 4000);
        return;
      }
      clearTimeout(this._resetT);
      delete b.dataset.armed; b.textContent = 'Reset';
      $('reset-note').textContent = 'Start over from wave 1 with 0 gold. Settings are kept.';
      Economy.reset();
      $('screen-settings').classList.add('hidden');
      $('screen-pause').classList.add('hidden');
      if (this.game.hero) this.toMenu();
      else if (!$('screen-title').classList.contains('hidden')) this.showTitle();
      this.toast('Progress reset. Fresh start!');
    });
    click('btn-reset', () => {
      const b = $('btn-reset');
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = 'Are you sure? All progress will be lost. Click again';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset Save'; }, 3000);
        return;
      }
      delete b.dataset.armed; b.textContent = 'Reset Save';
      Economy.reset(); $('screen-pause').classList.add('hidden'); this.toMenu();
    });
    click('btn-retry', () => this.respawnNow());
    click('btn-revive', () => {
      if (!this.game || this.game.phase !== 'dead') return;
      if (Economy.revive(this.game.wave)) { Audio.play('levelup'); this.toast(`Revived! Continuing from Wave ${this.game.wave}`); this.respawnNow(); }
      else { Audio.play('denied'); this.toast('Not enough DGN'); }
    });
    click('btn-victory-again', () => { $('screen-victory').classList.add('hidden'); this.game.startRun(this.selected); });
    click('btn-victory-menu', () => { $('screen-victory').classList.add('hidden'); this.toMenu(); });
    click('btn-death-shop', () => { $('screen-death').classList.add('hidden'); this.openShop('death'); });
    click('btn-death-menu', () => { this.stopCountdown(); $('screen-death').classList.add('hidden'); this.toMenu(); });
    click('btn-auto', () => this.toggleAuto());
    click('btn-claim', () => { const n = Economy.claim(); if (n > 0) { Audio.play('coin'); this.toast(`+${fmt(n)} DGN claimed`); } else Audio.play('denied'); this.updateGold(); });
    click('btn-wallet', () => this.openWallet());
    click('btn-wallet-close', () => this.closeWallet());
    click('btn-gate-keys', () => { this.hideGate(); this.shopTab = 'keys'; this.syncTabs(); this.openShop('game'); });
    click('btn-speed', () => this.toggleSpeed());
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      Audio.play('click');
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active'); this.shopTab = t.dataset.tab; this.renderShop();
    }));
    window.addEventListener('keydown', (e) => {
      if (!this.game?.hero) return;
      const k = e.key.toLowerCase();
      if (['1', '2', '3'].includes(k) && !this.game.paused) Skills.tryCast(this.game, +k - 1, true);
      else if (k === 'a') this.toggleAuto();
      else if (k === 'h') this.toggleSpeed();
      else if (k === 'b') { if ($('screen-shop').classList.contains('hidden')) this.openShop('game'); else this.closeShop(); }
      else if (k === 'escape') {
        if (!$('screen-settings').classList.contains('hidden')) this.closeSettings();
        else if (!$('screen-shop').classList.contains('hidden')) this.closeShop();
        else if (!$('screen-pause').classList.contains('hidden')) this.resume();
        else if (this.game.phase !== 'dead') this.pause();
      }
    });
    document.addEventListener('visibilitychange', () => {
      // Oyun sekme gizliyken de oynamaya devam eder (bkz. Game.backgroundTick); duraklatmıyoruz.
      if (document.hidden) {
        Economy.save(); // son görülme zamanı
      } else if (this.game) {
        this.game.clock.getDelta();   // gizli geçen süreyi ikinci kez sayma
        this.updateGold(); this.updateRush?.();
        if (this.game.hero) this.updateWave(this.game);
        this.checkOffline();          // oyun çalışıyorsa son görülme taze olduğundan ödül çıkmaz
      }
    });
    window.addEventListener('pagehide', () => Economy.save());
    // oyun açıkken son görülme zamanını düzenli güncelle
    setInterval(() => { if (!document.hidden) { Economy.accrue(); this.updateGold(); Economy.save(); } }, 15000);
    Economy.on((d, evt) => {
      this.updateGold();
      if (evt?.type === 'keyUsed') { const k = F.keyTier(evt.wave); this.toast(`${k.icon} ${k.name} used · Wave ${evt.wave} opened`); }
    });
  }

  // ---------- Yükleme ----------
  loading(p) {
    $('load-fill').style.width = `${Math.round(p * 100)}%`;
    $('load-pct').textContent = `${Math.round(p * 100)}%`;
    if (!this._tipTimer) {
      const tips = [
        'Tip: Your hero fights on their own. Spend gold in the shop to grow stronger.',
        'Tip: Every 5th wave is elite, every 10th wave brings a boss.',
        'Tip: Level is shared by both heroes, but upgrades are per hero.',
        'Tip: Press 1, 2, 3 to cast skills yourself, or leave AUTO on.',
        'Tip: Press H to change game speed.',
        'Tip: When you fall, you restart one wave back. Nothing you earned is lost.',
        'Tip: Wave 100 hides the Lord of the Dungeon.',
        'Tip: Your production grows with every wave. Press Claim to collect it.',
        'Tip: Waves 1–20 are free. Keys open the sealed gates beyond.',
      ];
      let i = Math.floor(Math.random() * tips.length);
      const el = $('load-text');
      el.textContent = tips[i];
      this._tipTimer = setInterval(() => {
        el.style.opacity = 0;
        setTimeout(() => { i = (i + 1) % tips.length; el.textContent = tips[i]; el.style.opacity = 1; }, 400);
      }, 3500);
    }
  }

  showTitle() {
    $('screen-loading').classList.add('hidden');
    clearInterval(this._tipTimer);
    $('screen-title').classList.remove('hidden');
    const d = Economy.data;
    $('title-stats').innerHTML = d.bestWave > 0
      ? `<span>Best wave: <b>${d.bestWave}</b></span><span>Level: <b>${d.level}</b></span><span>Gold: <b>${fmt(d.gold)}</b></span>`
      : '';
  }

  // ---------- Karakter seçimi ----------
  showSelect() {
    $('screen-title').classList.add('hidden');
    $('screen-select').classList.remove('hidden');
    $('hud').classList.add('hidden');
    const wrap = $('hero-cards');
    wrap.innerHTML = '';
    this.previewers = [];
    const maxes = { maxHp: 400, atk: 40, armor: 30, atkSpd: 2, crit: 0.5 };
    for (const [id, h] of Object.entries(CONFIG.heroes)) {
      const st = F.heroStats(id, Economy.data);
      const card = document.createElement('div');
      card.className = 'card panel' + (id === this.selected ? ' selected' : '');
      card.innerHTML = `
        <canvas></canvas>
        <div class="role">${h.role}</div>
        <h2>${h.name}</h2>
        <div class="desc">${h.desc}</div>
        ${[['Health', st.maxHp, maxes.maxHp, fmt(st.maxHp)], ['Damage', st.atk, maxes.atk, st.atk.toFixed(1)], ['Armor', st.armor, maxes.armor, Math.round(st.armor)],
          ['Attack Speed', st.atkSpd, maxes.atkSpd, st.atkSpd.toFixed(2)], ['Crit', st.crit, maxes.crit, Math.round(st.crit * 100) + '%']]
          .map(([n, v, m, t]) => `<div class="stat-row"><span>${n}</span><div class="sb"><div style="width:${Math.min(100, v / m * 100)}%"></div></div><b>${t}</b></div>`).join('')}
        <div class="skills-mini">${h.skills.map((s, i) => `<span title="${s.desc}">${s.icon}<br>${s.name}<br><small>Lv ${Economy.skillLevel(id, i)}</small></span>`).join('')}</div>`;
      card.addEventListener('click', () => {
        Audio.play('click');
        this.selected = id;
        wrap.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      card.addEventListener('dblclick', () => this.startGame());
      wrap.appendChild(card);
      this.previewers.push(new Previewer(card.querySelector('canvas'), id));
    }
    const sw = Economy.startWave();
    $('start-hint').textContent = sw > 1 ? `Continue from Floor ${F.floorOf(sw) + 1}, Wave ${sw}` : 'Your hero walks and fights on their own. You handle the upgrades!';
  }

  startGame() {
    Audio.play('click');
    $('screen-select').classList.add('hidden');
    this.game.startRun(this.selected);
  }

  toMenu() {
    Audio.setMusic('menu');
    this.game.showMenuScene();
    $('hud').classList.add('hidden');
    this.showSelect();
  }

  // ---------- HUD ----------
  onRunStart(game) {
    $('hud').classList.remove('hidden');
    this.updateRush();
    const h = game.hero;
    $('hud-hero').textContent = h.def.name;
    const pc = $('portrait').getContext('2d');
    pc.clearRect(0, 0, 72, 72);
    // portre: karakterin üst kısmı
    const meta = Assets.heroes[h.id].meta.idle, img = Assets.heroes[h.id].textures.idle.image;
    const sw = meta.fw * 0.75, sh = meta.fh * 0.62;
    pc.drawImage(img, meta.fw * 0.12, 0, sw, sh, 2, 2, 68, 68 * sh / sw);
    this.buildSkills(h);
    this.syncButtons();
    this.updateGold();
    this.updateWave(game);
  }

  buildSkills(h) {
    const wrap = $('skills');
    wrap.innerHTML = '';
    this.skillEls = h.def.skills.map((s, i) => {
      const el = document.createElement('div');
      el.className = 'skill';
      el.title = `${s.name} — ${s.desc}`;
      el.innerHTML = `<span>${s.icon}</span><div class="cd"></div><div class="cdt"></div><div class="key">${i + 1}</div><div class="slvl">Lv${Economy.skillLevel(h.id, i)}</div><div class="sname">${s.name}</div>`;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); Skills.tryCast(this.game, i, true); });
      wrap.appendChild(el);
      return el;
    });
  }

  skillCast(i) {
    const el = this.skillEls?.[i];
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  updateHud(game) {
    const h = game.hero;
    if (!h) return;
    const hpk = Math.max(0, h.hp / h.stats.maxHp);
    $('hp-fill').style.width = `${hpk * 100}%`;
    $('hp-text').textContent = `${fmt(h.hp)} / ${fmt(h.stats.maxHp)}`;
    const d = Economy.data;
    this.updateDgnLive();
    if (game.phase === 'gate') $('gate-count').textContent = `Returning to Wave ${Economy.loopWave(game.gateWave)} in ${Math.max(0, Math.ceil(CONFIG.v5.gateSeconds - game.gateT))}…`;
    // Gold Rush sayacı (saniyede bir yeterli)
    if ((this._rushTick = (this._rushTick || 0) + 1) % 30 === 0) this.updateRush();
    const need = F.xpToNext(d.level);
    $('xp-fill').style.width = `${Math.min(100, d.xp / need * 100)}%`;
    $('xp-text').textContent = `${fmt(d.xp)} / ${fmt(need)} XP`;
    $('hud-level').textContent = d.level;
    // yetenekler
    if (this.skillEls) {
      h.def.skills.forEach((s, i) => {
        const el = this.skillEls[i];
        const cd = h.skillCds[i], max = F.skillCd(s, Economy.skillLevel(h.id, i));
        el.querySelector('.cd').style.setProperty('--p', `${cd > 0 ? (cd / max) * 100 : 0}%`);
        el.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
        el.classList.toggle('ready', cd <= 0 && game.phase === 'combat');
      });
    }
    // boss barı
    const boss = game.enemies.find((e) => e.rank === 'boss' && !e.dead);
    $('boss-bar').classList.toggle('hidden', !boss);
    if (boss) {
      $('boss-name').textContent = boss.name;
      $('boss-fill').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    }
    if (this._enemyTick++ % 10 === 0) this.updateWave(game);
  }

  updateWave(game) {
    this._enemyTick = this._enemyTick || 0;
    const w = Math.max(1, game.phase === 'combat' || game.phase === 'dead' ? game.wave : game.wave + 1);
    $('hud-floor').textContent = `Floor ${F.floorOf(w) + 1}`;
    $('hud-wave').textContent = `Wave ${w} / ${CONFIG.wave.maxWave}`;
    const alive = game.enemies.filter((e) => !e.dead).length;
    let txt;
    if (game.phase === 'combat') txt = `${alive} enemies left`;
    else if (game.phase === 'walking' || game.phase === 'loot') {
      const nw = game.wave + 1;
      txt = F.isBoss(nw) ? '⚠ Next: BOSS' : F.isElite(nw) ? 'Next: Elite wave' : 'Advancing...';
    } else txt = '';
    $('hud-enemies').textContent = txt;
  }

  updateGold() {
    $('hud-gold').textContent = fmt(Economy.data.gold);
    $('hud-gems').textContent = fmt(Economy.tokens());
    if (!$('screen-shop').classList.contains('hidden')) {
      $('shop-gold').textContent = fmt(Economy.data.gold);
      $('shop-gems').textContent = fmt(Economy.tokens());
      $('shop-sp').textContent = Economy.data.skillPoints;
      $('shop-tomes').textContent = Economy.data.tomes || 0;
    }
    const rb = $('btn-revive');
    if (rb) rb.disabled = !Economy.canAffordTokens(CONFIG.tokenShop.revive.price);
  }

  updateRush() {
    const left = Economy.goldRushLeft();
    $('hud-rush').classList.toggle('hidden', left <= 0);
    if (left > 0) $('hud-rush-t').textContent = fmtDur(left);
  }

  banner(text, cls = '') {
    const b = $('banner');
    b.className = cls; b.textContent = text;
    void b.offsetWidth;
    b.classList.remove('hidden');
    clearTimeout(this._bT);
    this._bT = setTimeout(() => b.classList.add('hidden'), 1800);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('hidden'); void t.offsetWidth; t.classList.remove('hidden');
    clearTimeout(this._tT);
    this._tT = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  waveCleared(game) {
    this.banner(`Wave ${game.wave} cleared!`, 'clear');
    this.updateWave(game);
  }

  floorTransition(floorNo, name, mid) {
    if (document.hidden) { mid(); return; }   // arka planda geçiş animasyonunu atla
    const f = $('fade');
    $('fade-small').textContent = `FLOOR ${floorNo}`;
    $('fade-big').textContent = name;
    f.classList.remove('hidden');
    requestAnimationFrame(() => f.classList.add('show'));
    setTimeout(() => {
      mid();
      setTimeout(() => { f.classList.remove('show'); setTimeout(() => f.classList.add('hidden'), 650); }, 1300);
    }, 700);
  }

  syncButtons() {
    const s = Economy.data.settings;
    const a = $('btn-auto');
    a.classList.toggle('on', s.auto);
    a.innerHTML = `AUTO<br><small>${s.auto ? 'ON' : 'OFF'}</small>`;
    $('btn-speed').textContent = `${s.speed}x`;
    const mv = s.musicVol ?? 0.1, sv = s.sfxVol ?? 0.1;
    $('btn-music').setAttribute('aria-pressed', String(!!s.music));
    $('btn-sound').setAttribute('aria-pressed', String(!!s.sound));
    $('btn-set-auto').setAttribute('aria-pressed', String(!!s.auto));
    $('btn-set-offline').setAttribute('aria-pressed', String(s.offline !== false));
    for (const [id, val, vid, on] of [['rng-music', mv, 'val-music', s.music], ['rng-sfx', sv, 'val-sfx', s.sound]]) {
      const el = $(id);
      el.value = Math.round(val * 100); el.disabled = !on;
      el.style.setProperty('--fill', `${Math.round(val * 100)}%`);
      $(vid).textContent = on ? Math.round(val * 100) : 'Off';
    }
    document.querySelectorAll('#seg-speed button').forEach((b) => b.classList.toggle('on', +b.dataset.v === s.speed));
    Audio.setEnabled(s.sound);
    Audio.setMusicEnabled(s.music);
    Audio.setMusicVolume(mv);
    Audio.setSfxVolume(sv);
  }

  toggleAuto() { Economy.data.settings.auto = !Economy.data.settings.auto; Economy.save(); this.syncButtons(); }
  toggleSpeed() {
    const s = Economy.data.settings;
    const steps = [1, 1.5, 2, 2.5];
    const i = steps.indexOf(s.speed);
    s.speed = steps[(i + 1) % steps.length];
    Economy.save(); this.syncButtons();
  }
  // ---------- Çevrimdışı kazanç ----------
  checkOffline() {
    const r = Economy.claimOffline();
    if (r) this.showOffline(r);
  }
  showOffline(r) {
    const h = Math.floor(r.away / 3600), m = Math.floor((r.away % 3600) / 60);
    const dur = h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
    $('off-away').textContent = `You were away for ${dur}`;
    const hero = CONFIG.heroes[r.hero]?.name || 'Your hero';
    $('off-sub').textContent = `${hero} kept fighting at Wave ${r.wave}`;
    $('off-gold').textContent = `+${fmt(r.gold)}`;
    const od = Economy.lastOfflineDgn || 0;
    $('off-dgn').classList.toggle('hidden', od < 1);
    if (od >= 1) $('off-dgn').innerHTML = `◈ <b>+${fmt(od)}</b> DGN produced · press Claim`;
    $('off-note').textContent = r.capped
      ? `Only the first ${r.maxHours} hours count. Come back sooner to earn more.`
      : `Offline earnings are capped at ${r.maxHours} hours.`;
    // kahraman portresi
    const c = $('off-hero'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (Assets.heroes[r.hero]?.meta) drawFrame(ctx, r.hero, 'idle', 0, c.width, c.height, 0.95);
    $('screen-offline').classList.remove('hidden');
    Audio.play('buy');
  }
  closeOffline() {
    $('screen-offline').classList.add('hidden');
    this.updateGold();
  }

  // ---------- Ayarlar ----------
  openSettings(from) {
    this.settingsReturn = from;
    if (from === 'game') { if (!this.game.hero || this.game.phase === 'dead') return; this.game.paused = true; }
    this.syncButtons();
    $('screen-settings').classList.remove('hidden');
  }
  closeSettings() {
    $('screen-settings').classList.add('hidden');
    if (this.settingsReturn === 'game') { this.game.paused = false; this.game.clock.getDelta(); }
    else if (this.settingsReturn === 'pause') $('screen-pause').classList.remove('hidden');
  }

  toggleMusic() { Economy.data.settings.music = !Economy.data.settings.music; Economy.save(); this.syncButtons(); }
  toggleSound() { Economy.data.settings.sound = !Economy.data.settings.sound; Economy.save(); this.syncButtons(); }

  pause() {
    if (!this.game.hero || this.game.phase === 'dead') return;
    this.game.paused = true;
    $('screen-pause').classList.remove('hidden');
  }
  resume() {
    $('screen-pause').classList.add('hidden');
    this.game.paused = false;
    this.game.clock.getDelta();
  }

  // ---------- Dükkan ----------
  openShop(from) {
    this.shopReturn = from;
    if (from === 'game') { if (this.game.phase === 'dead') return; this.game.paused = true; }
    if (from === 'select') $('screen-select').classList.add('hidden');
    $('screen-shop').classList.remove('hidden');
    Audio.play('page');
    this.renderShop();
  }

  closeShop() {
    $('screen-shop').classList.add('hidden');
    const from = this.shopReturn;
    if (this.game.hero) { this.game.hero.refreshStats(); this.buildSkills(this.game.hero); }
    if (from === 'game') { this.game.paused = false; this.game.clock.getDelta(); }
    else if (from === 'pause') $('screen-pause').classList.remove('hidden');
    else if (from === 'death') $('screen-death').classList.remove('hidden');
    else if (from === 'select') this.showSelect();
  }

  get shopHero() { return this.game.hero ? this.game.hero.id : this.selected; }

  renderShop() {
    const hid = this.shopHero;
    const hdef = CONFIG.heroes[hid];
    $('shop-hero').textContent = `Upgrades for ${hdef.name} (each hero has their own upgrades; level is shared)`;
    $('shop-gold').textContent = fmt(Economy.data.gold);
    $('shop-sp').textContent = Economy.data.skillPoints;
    $('shop-gems').textContent = fmt(Economy.tokens());
    $('shop-tomes').textContent = Economy.data.tomes || 0;
    const body = $('shop-body');
    body.innerHTML = '';
    if (this.shopTab === 'upg') {
      for (const [key, u] of Object.entries(CONFIG.upgrades)) {
        const lvl = Economy.upgradeLevel(hid, key);
        const maxed = Economy.upgradeMaxed(hid, key);
        const cost = Economy.upgradeCost(hid, key);
        const cur = u.kind === 'mult' ? `×${Math.pow(1 + u.per, lvl).toFixed(2)}` : u.kind === 'pct' ? `+${Math.round(lvl * u.per * 100)}%` : key === 'crit' || key === 'regen' ? `+${(lvl * u.per * 100).toFixed(1)}%` : `+${lvl * u.per}`;
        const el = document.createElement('div');
        el.className = 'item';
        el.innerHTML = `<div class="ic">${u.icon}</div>
          <div><div class="nm">${u.name}<small>Lv ${lvl}${u.max ? '/' + u.max : ''}</small></div><div class="ds">${u.desc}</div><div class="val">Current: ${cur}</div></div>
          <button class="btn small" ${maxed || !Economy.canAfford(cost) ? 'disabled' : ''}>${maxed ? 'MAX' : `<span class="coin"></span>${fmt(cost)}`}</button>`;
        el.querySelector('button').addEventListener('click', () => {
          if (Economy.buyUpgrade(hid, key)) { Audio.play('buy'); this.renderShop(); } else Audio.play('denied');
        });
        body.appendChild(el);
      }
    } else if (this.shopTab === 'skl') {
      hdef.skills.forEach((s, i) => {
        const lvl = Economy.skillLevel(hid, i);
        const maxed = lvl >= CONFIG.skillUpgrade.maxLevel;
        const cost = Economy.skillCost(hid, i);
        const tome = maxed ? 0 : Economy.skillTomes(hid, i);
        const can = !maxed && Economy.canAfford(cost) && Economy.data.skillPoints >= CONFIG.skillUpgrade.pointCost && (Economy.data.tomes || 0) >= tome;
        const pw = Math.round(F.skillPower(s, lvl) * 100), cd = F.skillCd(s, lvl).toFixed(1);
        const el = document.createElement('div');
        el.className = 'item';
        el.innerHTML = `<div class="ic">${s.icon}</div>
          <div><div class="nm">${s.name}<small>Lv ${lvl}/${CONFIG.skillUpgrade.maxLevel}</small></div><div class="ds">${s.desc}</div>
          <div class="val">Power: ${pw}% · Cooldown: ${cd}s</div>
          ${tome ? `<div class="req">📘 Lv ${lvl + 1} needs ${tome} Skill Tome${tome > 1 ? 's' : ''} (you have ${Economy.data.tomes || 0})</div>` : ''}</div>
          <button class="btn small" ${can ? '' : 'disabled'}>${maxed ? 'MAX' : `<span class="coin"></span>${fmt(cost)} + ⭐1${tome ? ` + 📘${tome}` : ''}`}</button>`;
        el.querySelector('button').addEventListener('click', () => {
          if (Economy.buySkill(hid, i)) { Audio.play('buy'); this.renderShop(); } else Audio.play('denied');
        });
        body.appendChild(el);
      });
      const note = document.createElement('div');
      note.className = 'hint'; note.style.gridColumn = '1 / -1';
      note.textContent = 'You earn a skill point every time you level up. Lv 4+ also needs Skill Tomes: bosses drop them the first time you beat them, or buy them in the Store tab.';
      body.appendChild(note);
    } else if (this.shopTab === 'keys') {
      this.renderKeys(body);
    } else if (this.shopTab === 'forge') {
      this.renderForge(body);
    } else if (this.shopTab === 'store') {
      this.renderStore(body);
    } else {
      const st = F.heroStats(hid, Economy.data);
      const d = Economy.data;
      const g = document.createElement('div');
      g.className = 'stats-grid';
      const rows = [['Max Health', fmt(st.maxHp)], ['Damage', st.atk.toFixed(1)], ['Armor', Math.round(st.armor) + ` (${Math.round((1 - F.armorMult(st.armor)) * 100)}% reduction)`],
        ['Attack Speed', st.atkSpd.toFixed(2) + '/s'], ['Crit Chance', Math.round(st.crit * 100) + '%'], ['Crit Damage', 'x' + st.critDmg],
        ['Gold Bonus', '+' + Math.round((st.goldMult - 1) * 100) + '%'], ['Regeneration', (st.regen * 100).toFixed(1) + '%/s'],
        ['Account Level', d.level], ['Best Wave', d.bestWave], ['Total Kills', fmt(d.totalKills)], ['Starting Wave', Economy.startWave()]];
      g.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
      body.appendChild(g);
    }
  }

  syncTabs() {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === this.shopTab));
  }

  // ---------- DGN (Ekonomi v5) ----------
  // Sağ üstteki canlı sayaç: kaydedilmiş birikim + son hesaplamadan bu yana geçen sürenin üretimi
  updateDgnLive() {
    const d = Economy.data, now = Date.now();
    const rate = Economy.ratePerHour();
    const live = (d.uncollected || 0) + rate * Math.max(0, now - (d.lastAccrue || now)) / 3600000;
    $('dgn-live').textContent = live.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    if ((this._dgnTick = (this._dgnTick || 0) + 1) % 20 === 0) {
      $('dgn-rate').textContent = `+${Math.round(rate).toLocaleString('en-US')} / h`;
      const left = F.seasonEndsAt(now) - now;
      $('dgn-season').textContent = `Season ${F.seasonIndex(now) + 1} · ${fmtDays(left)} left`;
    }
  }

  showGate(w) {
    const k = F.keyTier(w);
    $('gate-eyebrow').textContent = `Wave ${w}`;
    $('gate-icon').textContent = k ? k.icon : '🔒';
    $('gate-main').textContent = k ? `Deposit to open waves ${k.from}–${k.to}` : 'Sealed';
    const now = Math.round(Economy.ratePerHour()), then = Math.round(F.rateAt(k ? k.to : w));
    $('gate-rate').innerHTML = `Your production: <b>${now.toLocaleString('en-US')}/h</b> → up to <b>${then.toLocaleString('en-US')}/h</b> at wave ${k ? k.to : w}`;
    $('screen-gate').classList.remove('hidden');
    Audio.play('boss');
  }
  hideGate() { $('screen-gate').classList.add('hidden'); }

  renderKeys(body) {
    const d = Economy.data, sym = CONFIG.token.symbol;
    const usd = (t) => '$' + (t * CONFIG.token.usdPerToken).toFixed(2);
    const head = document.createElement('div');
    head.className = 'hint'; head.style.gridColumn = '1 / -1';
    head.innerHTML = `Waves 1–${CONFIG.v5.freeMaxWave} are free. Every wave after that needs one key: it is used the first time you enter the wave and stays open for the season. Unused keys carry over to the next season. <b>Opened up to wave ${Math.max(CONFIG.v5.freeMaxWave, d.opened || 0)}.</b>`;
    body.appendChild(head);
    for (const k of CONFIG.v5.keys) {
      const pack = Economy.keyPackPrice(k), have = Economy.keyCount(k.id);
      const canPack = d.depositBal >= pack;
      const el = document.createElement('div');
      el.className = 'item';
      const single = k.singleUsd ? `<button class="btn small gem-buy" data-s="1" ${Economy.canAffordTokens(Economy.keySinglePrice(k)) ? '' : 'disabled'}>1 · ◈${fmt(Economy.keySinglePrice(k))}</button>` : '';
      el.innerHTML = `<div class="ic">${k.icon}</div>
        <div><div class="nm">${k.name}<small>×${have}</small></div>
        <div class="ds">Opens waves ${k.from}–${k.to}. Production at wave ${k.to}: ${Math.round(F.rateAt(k.to)).toLocaleString('en-US')}/h</div>
        <div class="val">10 keys: ◈${fmt(pack)} (${usd(pack)})${canPack ? '' : ' · needs deposited DGN'}</div></div>
        <div class="key-btns"><button class="btn small gem-buy" data-p="1" ${canPack ? '' : 'disabled'}>10 · ◈${fmt(pack)}</button>${single}</div>`;
      el.querySelector('[data-p]').addEventListener('click', () => {
        if (Economy.buyKeyPack(k.id)) { Audio.play('buy'); this.toast(`${k.icon} 10 ${k.name}s added. Your production pays back what you deposited; pool earnings start 48h after your first deposit.`); this.renderShop(); }
        else { Audio.play('denied'); this.toast('Key packs are bought with deposited DGN. Open your Wallet to deposit.'); }
      });
      el.querySelector('[data-s]')?.addEventListener('click', () => {
        if (Economy.buyKeySingle(k.id)) { Audio.play('buy'); this.toast(`${k.icon} 1 ${k.name} added`); this.renderShop(); } else Audio.play('denied');
      });
      body.appendChild(el);
    }
    const note = document.createElement('div');
    note.className = 'hint'; note.style.gridColumn = '1 / -1';
    note.textContent = `Packs are bought with DGN you deposited. A single Bronze key can also be bought with DGN you produced. Prices are set in USD and converted at the current ${sym} price.`;
    body.appendChild(note);
  }

  renderForge(body) {
    const d = Economy.data, F5 = CONFIG.v5.forge, lvl = d.forge || 0;
    const cost = Economy.forgeCost(), maxed = lvl >= F5.max;
    const el = document.createElement('div');
    el.className = 'item realm-card wide';
    el.innerHTML = `<div class="ic">⚒️</div>
      <div><div class="nm">The Forge<small>Lv ${lvl}/${F5.max}</small></div>
      <div class="ds">Temper your hero with DGN. Every level multiplies damage and health by ×${(1 + F5.per).toFixed(2)} for both heroes. Resets each season.</div>
      <div class="val">Current: damage and health ×${Math.pow(1 + F5.per, lvl).toFixed(2)}</div></div>
      <button class="btn small gem-buy" ${maxed || !Economy.canAffordTokens(cost) ? 'disabled' : ''}>${maxed ? 'MAX' : `◈${fmt(cost)}`}</button>`;
    el.querySelector('button').addEventListener('click', () => {
      if (Economy.buyForge()) { Audio.play('buy'); this.toast(`Forge Lv ${d.forge}`); this.renderShop(); } else Audio.play('denied');
    });
    body.appendChild(el);
    const note = document.createElement('div');
    note.className = 'hint'; note.style.gridColumn = '1 / -1';
    note.textContent = 'Keys open the waves, the Forge makes you strong enough to clear them. Paid from your in-game DGN balance.';
    body.appendChild(note);
  }

  // ---------- Cüzdan ----------
  openWallet() {
    Economy.accrue();
    $('screen-wallet').classList.remove('hidden');
    Audio.play('page');
    this.renderWallet();
  }
  closeWallet() { $('screen-wallet').classList.add('hidden'); this.updateGold(); }

  renderWallet() {
    const d = Economy.data, V = CONFIG.v5, sym = CONFIG.token.symbol, now = Date.now();
    const usd = (t) => '$' + (t * CONFIG.token.usdPerToken).toFixed(2);
    const n = (t) => Math.floor(t).toLocaleString('en-US');
    $('wallet-sub').textContent = `Season ${F.seasonIndex(now) + 1} · ${fmtDays(F.seasonEndsAt(now) - now)} left`;
    const perDay = Economy.poolPerDay(), eligible = Economy.poolEligible(now);
    const wd = Economy.withdrawable();
    const M = V.demo.market;
    const body = $('wallet-body');
    body.innerHTML = `
      ${CONFIG.token.testMode ? `<div class="wbox test"><b>TEST MODE.</b> ${sym} is not live yet. Deposits give free demo tokens and nothing is sent to a real wallet.</div>` : ''}
      <div class="wgrid">
        <div class="wbox"><span>Balance</span><b>◈ ${n(d.balance)}</b><small>${usd(d.balance)}</small></div>
        <div class="wbox"><span>Uncollected</span><b>◈ ${n(d.uncollected)}</b><button class="btn small" id="w-claim">Claim</button></div>
        <div class="wbox"><span>Production</span><b>+${n(Economy.ratePerHour())} / h</b><small>best wave ${d.seasonBest || 0} this season</small></div>
      </div>
      <div class="wbox line">${eligible
        ? `Your share of today's pool is <b>${n(perDay)} ${sym}</b> a day (${usd(perDay)}) · <b>${n(d.poolAvail)}</b> of it ready now. The realm is ${Math.round(Economy.realmFill() * 100)}% full: more lords means a smaller share for each.`
        : `Pool earnings start in <b>${fmtDur(Economy.poolStartsAt() - now)}</b>, 48 hours after your first deposit. Until then your production pays back what you deposited.`}</div>
      <div class="wbox line">${d.credit > 0
        ? `<b>${n(d.credit)} ${sym}</b> of what you can take out is ${sym} you brought in yourself. It is not limited by the daily share.`
        : `You have not deposited this season. Everything you take out comes from the daily pool.`}</div>
      <div class="wbox line">You can move up to <b>${n(wd)} ${sym}</b> right now.
        <div class="wrow"><input id="w-amt" type="number" min="0" value="${wd}"><button class="btn small" id="w-vault" ${wd >= V.withdraw.min ? '' : 'disabled'}>Move to the vault</button></div>
        <small>${Math.round(V.withdraw.fee * 100)}% fee is taken here, half of it is burned. Minimum ${n(V.withdraw.min)}.</small></div>
      <div class="wbox line"><span class="wlabel">Waiting in the vault</span> <b>◈ ${n(d.vault)}</b>
        <div class="wrow"><button class="btn small" id="w-send" ${d.vault > 0 ? '' : 'disabled'}>Send to my wallet</button></div>
        <small>Your wallet must have held at least ${n(V.withdraw.holdTokens)} ${sym} for the last ${V.withdraw.holdHours} hours. This stops lords from farming the pool and leaving the same hour.</small></div>
      <div class="wbox line"><span class="wlabel">Deposit</span>
        <div class="wrow">${[50000, 100000, 500000, 1000000].map((a) => `<button class="btn small" data-dep="${a}">+${fmt(a)}</button>`).join('')}</div>
        <small>${CONFIG.token.testMode ? 'Demo tokens for testing.' : `Send ${sym} from your wallet.`} Deposited ${sym} buys key packs. Deposited so far: ${n(d.deposited)}.</small></div>
      <div class="wgrid">
        <div class="wbox"><span>🔥 Burned on-chain</span><b>◈ ${n(V.demo.burnedOnChain + d.feesBurned)}</b><small>realm total</small></div>
        <div class="wbox"><span>Spent in the dungeon</span><b>◈ ${n(V.demo.spentInDungeon + d.spentDungeon)}</b><small>realm total</small></div>
        <div class="wbox"><span>Sent to wallets</span><b>◈ ${n(d.withdrawn)}</b><small>you</small></div>
      </div>
      <div class="wbox market"><span class="wlabel">${sym} market</span>
        <div class="mrow"><span>Price</span><b>$${M.priceUsd.toFixed(6)}</b><span>Volume 24h</span><b>$${n(M.volume24h)}</b><span>Liquidity</span><b>$${n(M.liquidity)}</b><span>Holders</span><b>${n(M.holders)}</b></div>
        <button class="btn small" disabled>Buy ${sym} · launching on Robinhood Chain</button></div>
      ${DEV ? '<div class="wrow"><button class="btn small" id="w-day">+1 day (test)</button><button class="btn small" id="w-sim">Simulate wallet send (test)</button></div>' : ''}`;
    const q = (id) => body.querySelector('#' + id);
    q('w-claim').addEventListener('click', () => { const c = Economy.claim(); if (c) Audio.play('coin'); this.renderWallet(); });
    q('w-vault').addEventListener('click', () => {
      const r = Economy.moveToVault(+q('w-amt').value || 0);
      if (!r) { Audio.play('denied'); this.toast(`You can move between ${fmt(V.withdraw.min)} and ${fmt(Economy.withdrawable())} ${sym}`); return; }
      Audio.play('coin'); this.toast(`${fmt(r.net)} ${sym} moved to the vault (fee ${fmt(r.fee)})`); this.renderWallet();
    });
    q('w-send').addEventListener('click', () => {
      const r = Economy.sendToWallet(false);
      Audio.play('denied');
      this.toast(r.reason === 'wallet' ? `Wallet connection opens when ${sym} launches on Robinhood Chain.` : 'The vault is empty');
    });
    body.querySelectorAll('[data-dep]').forEach((b) => b.addEventListener('click', () => {
      Economy.deposit(+b.dataset.dep); Audio.play('buy'); this.toast(`+${fmt(+b.dataset.dep)} demo ${sym} deposited`); this.renderWallet();
    }));
    q('w-day')?.addEventListener('click', () => {
      const d2 = Economy.data; d2.lastAccrue -= 86400000; if (d2.firstDepositAt) d2.firstDepositAt -= 86400000;
      const r = Economy.accrue(); this.toast(`+1 day: produced ${fmt(r.produced)}, pool ${fmt(r.pool)}`); this.renderWallet();
    });
    q('w-sim')?.addEventListener('click', () => { const r = Economy.sendToWallet(true); if (r.ok) this.toast(`${fmt(r.amount)} ${sym} sent (simulated)`); this.renderWallet(); });
  }

  renderStore(body) {
    const d = Economy.data;
    const offRate = Math.round(F.offlineEfficiency(d) * 100);
    for (const [id, it] of Object.entries(CONFIG.tokenShop)) {
      let status = '', disabled = !Economy.canAffordTokens(it.price), label = `◈${fmt(it.price)}`;
      if (id === 'timeSkip') status = `≈ +${fmt(F.offlineGoldPerSec(d) * it.hours * 3600 * Economy.goldMult())} gold at Wave ${Math.max(1, d.resumeWave || 1)} (${offRate}% rate)`;
      if (id === 'goldRush' && Economy.goldRushActive()) status = `Active: ${fmtDur(Economy.goldRushLeft())} left (buying adds 24h)`;
      if (id === 'idlePass' && d.idlePass) { status = 'Owned'; disabled = true; label = 'OWNED'; }
      if (id === 'tome') status = `You have ${d.tomes || 0}`;
      if (id === 'revive') { status = 'Use it from the defeat screen.'; disabled = true; }
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `<div class="ic">${it.icon}</div>
        <div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div>${status ? `<div class="req">${status}</div>` : ''}</div>
        <button class="btn small gem-buy" ${disabled ? 'disabled' : ''}>${label}</button>`;
      el.querySelector('button').addEventListener('click', () => {
        const r = Economy.buyShopItem(id);
        if (!r) { Audio.play('denied'); return; }
        Audio.play('buy');
        if (id === 'timeSkip') this.toast(`Time Skip: +${fmt(r.gold)} gold`);
        else if (id === 'goldRush') { this.toast('Gold Rush active: ×2 gold'); this.updateRush(); }
        else if (id === 'idlePass') this.toast('Idle Pass unlocked!');
        else this.toast(`${it.name} purchased`);
        this.renderShop();
      });
      body.appendChild(el);
    }
    const note = document.createElement('div');
    note.className = 'hint'; note.style.gridColumn = '1 / -1';
    note.textContent = `Prices are in ${CONFIG.token.symbol}, paid from your in-game balance. Skill Tomes also drop from every boss the first time you beat it.`;
    body.appendChild(note);
  }

  // ---------- Ölüm ----------
  showDeath(game) {
    const d = Economy.data;
    $('death-stats').innerHTML = [
      ['Wave reached', game.wave], ['Best', d.bestWave], ['Kills', game.runKills], ['Gold earned', fmt(game.runGold)],
      ['XP earned', fmt(game.runXp)], ['Level', d.level], ['Next start', `Wave ${Economy.startWave()}`], ['Total gold', fmt(d.gold)],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('btn-revive').innerHTML = `💖 Revive at Wave ${game.wave} · ◈${fmt(CONFIG.tokenShop.revive.price)}`;
    this.updateGold();
    $('screen-death').classList.remove('hidden');
    this.startCountdown();
  }

  // Ölümden sonra geri sayım; dükkan açıkken durur
  startCountdown() {
    this.stopCountdown();
    this.countLeft = CONFIG.respawnCountdown;
    // gerçek saate göre say: sekme arka plandayken zamanlayıcılar kısılsa da doğru biter
    this.countEnd = Date.now() + CONFIG.respawnCountdown * 1000;
    this._cdLast = Date.now();
    this._renderCountdown();
    this.countTimer = setInterval(() => this.tickCountdown(), 250);
  }
  tickCountdown() {
    if (!this.countTimer) return;
    const now = Date.now(), el = now - this._cdLast;
    this._cdLast = now;
    if ($('screen-death').classList.contains('hidden')) { this.countEnd += el; return; } // dükkandayken bekle
    const left = Math.max(0, Math.ceil((this.countEnd - now) / 1000));
    if (left !== this.countLeft) { this.countLeft = left; this._renderCountdown(); }
    if (left <= 0) this.respawnNow();
  }
  stopCountdown() { clearInterval(this.countTimer); this.countTimer = null; }
  _renderCountdown() {
    $('btn-retry').textContent = `↻ Start Now (${this.countLeft})`;
    $('death-count').innerHTML = `Restarting from <b>Wave ${Economy.startWave()}</b> in <b>${this.countLeft}</b> seconds`;
  }
  respawnNow() {
    this.stopCountdown();
    $('screen-death').classList.add('hidden');
    $('screen-shop').classList.add('hidden');
    this.game.startRun(this.selected);
  }

  showVictory(game) {
    const d = Economy.data;
    $('victory-stats').innerHTML = [
      ['Waves cleared', CONFIG.wave.maxWave], ['Level', d.level], ['Total kills', fmt(d.totalKills)], ['Total gold', fmt(d.gold)],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('screen-victory').classList.remove('hidden');
  }
}
