// Tüm arayüz: menüler, karakter seçimi, HUD, dükkan, ölüm ekranı.
import { CONFIG, F } from '../config.js';
import { Economy } from '../systems/economy.js';
import { Skills } from '../systems/skills.js';
import { Assets } from '../core/assets.js';
import { Audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
// ?dev=1 → Realm sekmesinde test butonları (deposit, +1 gün) (canlıda görünmez)
const DEV = new URLSearchParams(location.search).has('dev');
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
      if (document.hidden) {
        if (this.game?.hero && !this.game.paused && this.game.phase !== 'dead') this.pause();
        Economy.save(); // son görülme zamanı
      } else if (this.game) {
        this.checkOffline();
      }
    });
    window.addEventListener('pagehide', () => Economy.save());
    // oyun açıkken son görülme zamanını düzenli güncelle
    setInterval(() => { if (!document.hidden) { Economy.accrue(); this.updateGold(); Economy.save(); } }, 15000);
    Economy.on(() => this.updateGold());
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
    } else if (this.shopTab === 'realm') {
      this.renderRealm(body);
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

  // ---------- Realm (Ekonomi v4) ----------
  // Faz 1: sunucu ve zincir yok. Havuz payı config.realm.demo'daki örnek realm'e göre hesaplanır,
  // yatırma/çekme sadece bu tarayıcıda "demo" olarak çalışır.
  renderRealm(body) {
    Economy.accrue();
    const d = Economy.data, R = CONFIG.realm, sym = CONFIG.token.symbol;
    const usd = (t) => '$' + (t * CONFIG.token.usdPerToken).toFixed(t * CONFIG.token.usdPerToken < 1 ? 3 : 2);
    const rs = Economy.realmState();
    const dp = Economy.dp(), counted = Economy.countedDp(), share = Economy.shareRate();
    const cap = F.vaultCap(d.vault || 0), capped = counted < dp - 0.5;
    const wi = Economy.withdrawInfo();
    const add = (html, cls = 'item realm-card') => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; body.appendChild(el); return el; };

    // 1) Cüzdan
    const w = add(`<div class="ic">◈</div>
      <div><div class="nm">Your ${sym}<small>${fmt(Economy.tokens())} · ${usd(Economy.tokens())}</small></div>
      <div class="ds">Deposited, unspent: <b>${fmt(d.credit)}</b> (withdraw any time, no fee)<br>From the daily pool: <b>${fmt(d.earned)}</b> (withdraw once a day, up to today's share, ${Math.round(R.withdraw.fee * 100)}% fee)</div>
      <div class="val">Spent in game: ${fmt(d.spent)} · ${fmt(d.burned)} of it burned · Sent to wallet: ${fmt(d.withdrawn)}</div></div>
      <div class="realm-btns"><button class="btn small" data-a="dep">Deposit</button><button class="btn small" data-a="wd">Withdraw</button></div>`, 'item realm-card wide');
    w.querySelector('[data-a=dep]').addEventListener('click', () => this.realmDeposit());
    w.querySelector('[data-a=wd]').addEventListener('click', () => this.realmWithdraw());

    // 2) Günlük havuz
    const pct = (share / rs.pool) * 100;
    add(`<div class="ic">⚖️</div>
      <div><div class="nm">Daily pool<small>${fmt(rs.pool)} ${sym}/day</small></div>
      <div class="ds">Split every day between all lords by counted Dungeon Power. It is not first-come: a bigger share for you means a smaller one for everyone else.</div>
      <div class="val">Your share: <b>${fmt(share)} ${sym}/day</b> (${usd(share)}, ${pct.toFixed(2)}% of the pool) · earned today: ${fmt(d.todayShare)}</div>
      <div class="req">Demo realm: ${rs.players} lords. The live pool starts with the server (Phase 2).</div></div><div></div>`, 'item realm-card wide');

    // 3) DP
    add(`<div class="ic">🔥</div>
      <div><div class="nm">Dungeon Power<small>${fmt(dp)} DP</small></div>
      <div class="ds">Season best wave ${d.seasonBest || 0} × ${R.dp.perWave} + level ${d.level} × ${R.dp.perLevel} + relics ${fmt(F.relicDp(d))}</div>
      <div class="val">Counted: <b>${fmt(counted)}</b> ${capped ? `<span class="warnc">capped by Vault at ${cap}× the realm average</span>` : `(Vault allows up to ${cap}× the realm average)`}</div></div><div></div>`);

    // 4) Vault
    const nx = Economy.vaultNext();
    const vEl = add(`<div class="ic">🏛️</div>
      <div><div class="nm">Vault<small>Lv ${(d.vault || 0) + 1}/${R.vault.length}</small></div>
      <div class="ds">Your Dungeon Power only counts up to ${cap}× the realm's average. A huge army behind a small Vault counts as a small one.</div>
      <div class="val">${nx ? `Next: ${nx.cap}× the average` : 'Max level'}</div></div>
      <button class="btn small ${nx && !nx.gold ? 'gem-buy' : ''}" ${nx && (nx.gold ? Economy.canAfford(nx.gold) : Economy.canAffordTokens(nx.tokens)) ? '' : 'disabled'}>${!nx ? 'MAX' : nx.gold ? `<span class="coin"></span>${fmt(nx.gold)}` : `◈${fmt(nx.tokens)}`}</button>`);
    vEl.querySelector('button').addEventListener('click', () => { if (Economy.buyVault()) { Audio.play('buy'); this.toast('Vault raised'); this.renderShop(); } else Audio.play('denied'); });

    // 5) Relics
    for (const [id, r] of Object.entries(R.relics)) {
      const el = add(`<div class="ic">${r.icon}</div>
        <div><div class="nm">${r.name}<small>×${Economy.relicCount(id)}</small></div>
        <div class="ds">+${fmt(r.dp)} Dungeon Power for the season. ${Math.round(R.spendSplit.burn * 100)}% of the price is burned, ${Math.round(R.spendSplit.pool * 100)}% goes back into tomorrow's pool.</div></div>
        <button class="btn small gem-buy" ${Economy.canAffordTokens(r.tokens) ? '' : 'disabled'}>◈${fmt(r.tokens)}</button>`);
      el.querySelector('button').addEventListener('click', () => { if (Economy.buyRelic(id)) { Audio.play('buy'); this.toast(`${r.name}: +${r.dp} DP`); this.renderShop(); } else Audio.play('denied'); });
    }
    const note = document.createElement('div');
    note.className = 'hint'; note.style.gridColumn = '1 / -1';
    note.innerHTML = `Season ${R.seasonDays} days. Your first withdrawal opens ${R.withdraw.firstAfterHours}h after you join. Up to 24h of your share builds up while you are away, so come back daily. <a href="whitepaper.html" target="_blank" rel="noopener">Read the whitepaper</a>`;
    body.appendChild(note);
    if (DEV) {
      const b = document.createElement('div'); b.style.gridColumn = '1 / -1'; b.className = 'realm-dev';
      b.innerHTML = '<button class="btn small" data-d="a">+10,000 DGN (test deposit)</button><button class="btn small" data-d="b">+1 day (test)</button>';
      b.querySelector('[data-d=a]').addEventListener('click', () => { Economy.deposit(10000); this.renderShop(); this.updateGold(); });
      b.querySelector('[data-d=b]').addEventListener('click', () => {
        const d2 = Economy.data; d2.lastAccrue -= 86400000; d2.joinedAt -= 86400000; if (d2.withdrewDay >= 0) d2.withdrewDay--; d2.dayNo = -1;
        const got = Economy.accrue(); this.toast(`+1 day: +${fmt(got)} DGN from the pool`); this.renderShop(); this.updateGold();
      });
      body.appendChild(b);
    }
  }

  realmDeposit() {
    const sym = CONFIG.token.symbol;
    this.toast(DEV ? `Test deposit: use the +10,000 ${sym} button below` : `Deposits open with Solana (Phase 3). Coming soon.`);
    Audio.play(DEV ? 'click' : 'denied');
  }

  realmWithdraw() {
    const wi = Economy.withdrawInfo();
    const sym = CONFIG.token.symbol;
    const max = wi.credit + wi.earnedMax;
    if (max <= 0) {
      Audio.play('denied');
      if (wi.locked && Economy.data.earned > 0) this.toast(`First withdrawal opens in ${fmtDur(wi.opensAt - Date.now())}`);
      else if (wi.usedToday) this.toast('You already withdrew from the pool today. It reopens tomorrow.');
      else this.toast('Nothing to withdraw yet');
      return;
    }
    const r = Economy.withdraw(max);
    if (!r) { Audio.play('denied'); return; }
    Audio.play('coin');
    this.toast(`Withdrew ${fmt(r.net)} ${sym}${r.fee ? ` (fee ${fmt(r.fee)})` : ''} · demo, no real transfer yet`);
    this.renderShop(); this.updateGold();
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
    note.textContent = `Prices are in ${CONFIG.token.symbol}. ${Math.round(CONFIG.realm.spendSplit.burn * 100)}% of every purchase is burned and ${Math.round(CONFIG.realm.spendSplit.pool * 100)}% flows back into the daily pool. Skill Tomes also drop from every boss the first time you beat it.`;
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
    this._renderCountdown();
    this.countTimer = setInterval(() => {
      if ($('screen-death').classList.contains('hidden')) return; // dükkandayken bekle
      this.countLeft--;
      this._renderCountdown();
      if (this.countLeft <= 0) this.respawnNow();
    }, 1000);
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
