// Nick ekranı, clan ekranı (lider/officer paneli dahil) ve sıralamalar.
import { CONFIG } from '../config.js';
import { Economy } from '../systems/economy.js';
import { Social } from '../systems/social.js';
import { validateNick, errText, can } from '../systems/clan-rules.js';
import { Audio } from '../core/audio.js';

const $ = (id) => document.getElementById(id);
const DEV = new URLSearchParams(location.search).has('dev');
const n = (v) => Math.floor(v || 0).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (b) => `+${Math.round(b * 100)}%`;
const ROLE_ICON = { leader: '👑', officer: '⭐', member: '' };
const ROLE_NAME = { leader: 'Leader', officer: 'Officer', member: 'Member' };
const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
const bonusLine = () => CONFIG.social.clan.bonus.map((b, i) => `#${i + 1} ${pct(b)}`).join(' · ');

export class SocialUI {
  constructor(ui) {
    this.ui = ui;
    this.tab = 'clan';
    this._gen = 0;
    this._bind();
    Social.on((s, evt) => this._onSocial(evt));
  }

  _bind() {
    const click = (id, fn) => $(id).addEventListener('click', () => { Audio.play('click'); fn(); });
    click('btn-clan-close', () => this.close());
    click('btn-hud-clan', () => this.open('clan'));
    click('btn-hud-rank', () => this.open('players'));
    document.querySelectorAll('#screen-clan [data-ctab]').forEach((b) => b.addEventListener('click', () => {
      Audio.play('page'); this.tab = b.dataset.ctab; this.render();
    }));
    // nick
    const inp = $('nick-input');
    inp.addEventListener('input', () => {
      clearTimeout(this._nickT);
      this._nickT = setTimeout(() => this._checkNick(), 250);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._submitNick(); e.stopPropagation(); });
    click('btn-nick-ok', () => this._submitNick());
  }

  // ---------------- Nick ----------------
  showNick(done) {
    this._nickDone = done;
    $('screen-loading').classList.add('hidden');
    $('screen-nick').classList.remove('hidden');
    $('nick-msg').textContent = '';
    setTimeout(() => $('nick-input').focus(), 50);
  }
  async _checkNick() {
    const raw = $('nick-input').value, v = validateNick(raw), msg = $('nick-msg');
    if (!$('nick-input').value) { msg.textContent = ''; msg.className = 'nick-msg'; return false; }
    if (!v.ok) { msg.textContent = errText(v.error); msg.className = 'nick-msg bad'; return false; }
    const taken = await Social.backend.isNickTaken(v.nick);
    if ($('nick-input').value !== raw) return false;      // bu arada yazmaya devam edildi
    if (taken) { msg.textContent = errText('nick_taken'); msg.className = 'nick-msg bad'; return false; }
    msg.textContent = `${v.nick} is free`; msg.className = 'nick-msg good';
    return true;
  }
  async _submitNick() {
    const r = await Social.setNick($('nick-input').value);
    if (!r.ok) { Audio.play('denied'); $('nick-msg').textContent = errText(r.error); $('nick-msg').className = 'nick-msg bad'; return; }
    Audio.play('buy');
    $('screen-nick').classList.add('hidden');
    this.ui.toast(`Welcome, ${r.nick}!`);
    this._nickDone?.();
  }

  // ---------------- Clan ekranı ----------------
  open(tab) {
    if (!Social.hasNick()) return;
    if (tab) this.tab = tab;
    $('screen-clan').classList.remove('hidden');
    Audio.play('page');
    this.render();
  }
  close() { $('screen-clan').classList.add('hidden'); }
  isOpen() { return !$('screen-clan').classList.contains('hidden'); }

  _onSocial(evt = {}) {
    this.updateHud();
    const t = evt.type;
    if (t === 'joined') { Audio.play('coin'); this.ui.toast(`You joined [${evt.tag}] ${evt.name}!${Social.bonus ? ` Clan bonus ${pct(Social.bonus)} production.` : ''}`); }
    if (t === 'request_failed') this.ui.toast('A clan you asked to join is full.');
    if (t === 'requests' && can(Social.me.role, 'approve')) this.ui.toast(`🛡 New join request${evt.count > 1 ? 's' : ''} for your clan`);
    // açık listeyi yenile (yazı yazılan sekmelerde odak kaybolmasın diye sadece clan sekmesi tam yenilenir)
    if (this.isOpen() && t !== 'refresh') {
      if (this.tab === 'clan') this.render();
      else if (this.tab === 'find') this._renderFindList();
    }
  }

  // Sağ üstteki DGN panelinde clan satırı
  updateHud() {
    const el = $('dgn-clan'), c = Social.clan;
    if (!el) return;
    if (!c) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `🛡 [${esc(c.tag)}] #${c.rank}${c.bonus ? ` <b>${pct(c.bonus)}</b>` : ''}`;
    el.title = c.bonus ? `${c.name} is #${c.rank}: every member produces ${pct(c.bonus)} more. The bonus comes from the daily pool.` : `${c.name} is #${c.rank}. Top 5 clans get a production bonus: ${bonusLine()}`;
  }

  async render() {
    const gen = ++this._gen;
    document.querySelectorAll('#screen-clan [data-ctab]').forEach((b) => b.classList.toggle('active', b.dataset.ctab === this.tab));
    const c = Social.clan;
    $('clan-sub').textContent = `Playing as ${Social.me.nick}${c ? ` · [${c.tag}] ${c.name}` : ''}`;
    const body = $('clan-body');
    let html = '';
    if (this.tab === 'clan') html = c ? this._myClanHtml((await Social.getClan(c.id)).clan) : this._noClanHtml();
    else if (this.tab === 'find') html = this._findHtml();
    else if (this.tab === 'players') html = this._playersHtml(await Social.players({ limit: 100 }));
    else if (this.tab === 'clans') html = this._clansHtml(await Social.clans({ limit: 50 }));
    if (gen !== this._gen) return;   // bu arada başka sekme açıldı
    body.innerHTML = html;
    this._wire(body);
    if (this.tab === 'find') this._renderFindList();
  }

  // ---- clan yok ----
  _noClanHtml() {
    return `<div class="wbox line">You are not in a clan yet. Join one to climb the clan rankings together. <b>The top 5 clans get a production bonus</b> for every member: ${bonusLine()}. The bonus starts the moment you join and is paid from the daily pool.</div>
      <div class="wrow"><button class="btn" data-go="find">🔍 Find a clan</button></div>
      ${this._createHtml()}`;
  }
  _createHtml() {
    const cost = CONFIG.social.clan.createCost, ok = Economy.canAffordTokens(cost);
    const T = CONFIG.social.clan;
    return `<div class="wbox line"><span class="wlabel">Found your own clan</span>
      <div class="wrow"><input id="cc-name" maxlength="${T.name.max}" placeholder="Clan name"><input id="cc-tag" class="tag-in" maxlength="${T.tag.max}" placeholder="TAG"></div>
      <div class="wrow"><button class="btn small gem-buy" id="cc-go" ${ok ? '' : 'disabled'}>Create · ◈${n(cost)}</button><small>${ok ? `You have ◈${n(Economy.tokens())}.` : `You have ◈${n(Economy.tokens())}. You need ◈${n(cost)}.`}</small></div>
      <small>Up to ${T.maxMembers} members. As leader you approve join requests, pick up to ${T.maxOfficers} officers, remove members and can disband the clan. Officers can only approve or reject join requests.</small></div>`;
  }

  // ---- kendi clanım ----
  _myClanHtml(c) {
    if (!c) return this._noClanHtml();
    const role = c.myRole, lead = role === 'leader';
    const reqs = c.requests;
    const rows = c.members.map((m) => {
      let act = '';
      if (lead && !m.isMe) {
        act = `${m.role === 'officer'
          ? `<button class="btn small" data-off="${m.id}" data-on="0">− Officer</button>`
          : `<button class="btn small" data-off="${m.id}" data-on="1">+ Officer</button>`}
          <button class="btn small" data-arm="lead" data-id="${m.id}">Make leader</button>
          <button class="btn small danger" data-arm="kick" data-id="${m.id}">Kick</button>`;
      }
      return `<div class="crow${m.isMe ? ' me' : ''}"><span class="rk">${ROLE_ICON[m.role]}</span><span class="nm">${esc(m.nick)}${m.isMe ? ' <small>(you)</small>' : ''}<small>${ROLE_NAME[m.role]}</small></span><span class="st">W${m.wave}</span><span class="st">${n(m.rate)}/h</span><span class="act">${act}</span></div>`;
    }).join('');
    return `
      <div class="wgrid">
        <div class="wbox"><span>Clan</span><b>[${esc(c.tag)}] ${esc(c.name)}</b><small>Leader: ${esc(c.leader)}</small></div>
        <div class="wbox"><span>Rank</span><b>#${c.rank}</b><small>${c.bonus ? `${pct(c.bonus)} production for every member` : 'Top 5 get a production bonus'}</small></div>
        <div class="wbox"><span>Members</span><b>${c.memberCount} / ${c.maxMembers}</b><small>${n(c.totalRate)}/h together</small></div>
      </div>
      <div class="wbox line">${c.bonus
        ? `Your clan is <b>#${c.rank}</b>: you produce <b>${pct(c.bonus)}</b> more (${n(Economy.baseRatePerHour())} → <b>${n(Economy.ratePerHour())}/h</b>). The bonus comes from the daily pool, so it lasts as long as your clan stays in the top 5.`
        : `Top 5 clans get a production bonus: ${bonusLine()}. Clans are ranked by the total production of their members.`}</div>
      ${reqs ? `<div class="wbox line"><span class="wlabel">Join requests (${reqs.length})</span>
        ${reqs.length ? reqs.map((q) => `<div class="crow"><span class="rk">✉️</span><span class="nm">${esc(q.nick)}<small>${ago(q.at)}</small></span><span class="st">W${q.wave}</span><span class="st">${n(q.rate)}/h</span>
          <span class="act"><button class="btn small" data-ap="${q.id}" ${c.full ? 'disabled' : ''}>Approve</button><button class="btn small danger" data-rj="${q.id}">Reject</button></span></div>`).join('') : '<small>No requests right now.</small>'}
        <small>${role === 'officer' ? 'As an officer you can approve or reject join requests.' : `Officers can approve or reject requests too. ${c.full ? 'The clan is full.' : ''}`}</small></div>` : ''}
      <div class="wbox line"><span class="wlabel">Members · you are ${ROLE_NAME[role]}</span><div class="clist">${rows}</div></div>
      <div class="wrow">
        ${lead ? '<button class="btn small danger" data-arm="disband">Disband clan</button>' : ''}
        <button class="btn small danger" data-arm="leave">Leave clan</button>
      </div>
      ${DEV && !c.bot ? `<div class="wrow"><small>Test:</small>${['leader', 'officer', 'member'].map((r) => `<button class="btn small" data-dev="${r}">View as ${r}</button>`).join('')}</div>` : ''}`;
  }

  // ---- clan bul ----
  _findHtml() {
    return `${Social.clan ? '' : this._createHtml()}
      <div class="wrow"><input id="cf-q" placeholder="Search by name or tag"></div>
      <div id="find-list" class="clist"></div>
      <small class="hint">You can ask up to ${CONFIG.social.clan.maxPendingRequests} clans at once. A leader or officer approves your request.</small>`;
  }
  async _renderFindList() {
    const el = $('find-list');
    if (!el) return;
    const q = $('cf-q')?.value || '';
    const { rows } = await Social.listClans({ query: q });
    const inClan = !!Social.clan;
    el.innerHTML = rows.map((c) => {
      let btn;
      if (c.mine) btn = '<button class="btn small" disabled>Your clan</button>';
      else if (inClan) btn = '';
      else if (c.requested) btn = `<button class="btn small" data-cancel="${c.id}">Requested ✕</button>`;
      else if (c.full) btn = '<button class="btn small" disabled>Full</button>';
      else btn = `<button class="btn small" data-join="${c.id}">Ask to join</button>`;
      return `<div class="crow${c.mine ? ' me' : ''}${c.bonus ? ' top' : ''}"><span class="rk">#${c.rank}</span><span class="nm">[${esc(c.tag)}] ${esc(c.name)}<small>Leader ${esc(c.leader)}${c.bonus ? ` · <b class="bon">${pct(c.bonus)}</b>` : ''}</small></span><span class="st">${c.memberCount}/${c.maxMembers}</span><span class="st">${n(c.totalRate)}/h</span><span class="act">${btn}</span></div>`;
    }).join('') || '<small>No clans found.</small>';
    this._wire(el);
  }

  // ---- sıralamalar ----
  _playersHtml({ rows, me, total }) {
    const row = (p) => `<div class="crow${p.isMe ? ' me' : ''}${p.rank <= 3 ? ' top' : ''}"><span class="rk">#${p.rank}</span><span class="nm">${esc(p.nick)}${p.tag ? ` <small>[${esc(p.tag)}]</small>` : ''}</span><span class="st">W${p.wave}</span><span class="st">${n(p.rate)}/h</span></div>`;
    return `<div class="wbox line">Lords are ranked by production this season (best wave). ${n(total)} lords in the realm. You are <b>#${me.rank}</b>.</div>
      <div class="clist">${rows.map(row).join('')}${me.rank > rows.length ? `<div class="csep">…</div>${row(me)}` : ''}</div>`;
  }
  _clansHtml({ rows, mine, total }) {
    const row = (c) => `<div class="crow${c.mine ? ' me' : ''}${c.bonus ? ' top' : ''}"><span class="rk">#${c.rank}</span><span class="nm">[${esc(c.tag)}] ${esc(c.name)}<small>${c.bonus ? `<b class="bon">${pct(c.bonus)} production</b>` : `Leader ${esc(c.leader)}`}</small></span><span class="st">${c.memberCount}/${c.maxMembers}</span><span class="st">${n(c.totalRate)}/h</span></div>`;
    return `<div class="wbox line">Clans are ranked by the total production of their members. ${total} clans. Top 5 bonus: ${bonusLine()}, paid from the daily pool.</div>
      <div class="clist">${rows.map(row).join('')}${mine && mine.rank > rows.length ? `<div class="csep">…</div>${row(mine)}` : ''}</div>`;
  }

  // ---------------- düğmeler ----------------
  _wire(root) {
    const res = async (p, okMsg) => {
      const r = await p;
      if (!r.ok) { Audio.play('denied'); this.ui.toast(errText(r.error)); return r; }
      if (okMsg) { Audio.play('buy'); this.ui.toast(okMsg); }
      this.render();
      return r;
    };
    const on = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { Audio.play('click'); fn(b); }));
    on('[data-go]', (b) => { this.tab = b.dataset.go; this.render(); });
    on('#cc-go', async () => {
      const r = await Social.createClan(root.querySelector('#cc-name').value, root.querySelector('#cc-tag').value);
      if (!r.ok) { Audio.play('denied'); this.ui.toast(errText(r.error)); return; }
      Audio.play('coin'); this.ui.toast(`🛡 [${Social.clan.tag}] ${Social.clan.name} founded!`);
      this.tab = 'clan'; this.render();
    });
    const tag = root.querySelector('#cc-tag');
    tag?.addEventListener('input', () => { tag.value = tag.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));   // oyun kısayolları çalışmasın
    const q = root.querySelector('#cf-q');
    q?.addEventListener('input', () => { clearTimeout(this._qT); this._qT = setTimeout(() => this._renderFindList(), 200); });
    on('[data-join]', (b) => res(Social.requestJoin(b.dataset.join), 'Request sent. A leader or officer will review it.').then(() => this._renderFindList()));
    on('[data-cancel]', (b) => res(Social.cancelRequest(b.dataset.cancel)).then(() => this._renderFindList()));
    on('[data-ap]', (b) => res(Social.approve(b.dataset.ap), 'Approved. Welcome to the clan!'));
    on('[data-rj]', (b) => res(Social.reject(b.dataset.rj)));
    on('[data-off]', (b) => res(Social.setOfficer(b.dataset.off, b.dataset.on === '1'), b.dataset.on === '1' ? 'Officer appointed' : 'Officer removed'));
    on('[data-dev]', (b) => res(Social.devSetMyRole(b.dataset.dev)));
    // geri alınamayan işlemler: iki tıkla onay. Onay durumu ekrandan ayrı tutulur,
    // arka planda liste yenilense de ikinci tık geçerli kalır.
    const keyOf = (b) => `${b.dataset.arm}:${b.dataset.id || ''}`;
    const armed = () => this._armed && Date.now() < this._armed.until ? this._armed.key : null;
    root.querySelectorAll('[data-arm]').forEach((b) => { if (keyOf(b) === armed()) b.textContent = 'Sure?'; });
    on('[data-arm]', (b) => {
      const key = keyOf(b);
      if (armed() !== key) {
        this._armed = { key, until: Date.now() + 4000 };
        const label = b.textContent; b.textContent = 'Sure?';
        setTimeout(() => { if (b.isConnected && armed() !== key) b.textContent = label; }, 4100);
        return;
      }
      this._armed = null;
      const id = b.dataset.id;
      const act = {
        kick: () => res(Social.kick(id), 'Member removed'),
        lead: () => res(Social.transferLeader(id), 'Leadership handed over'),
        disband: () => res(Social.disband(), 'The clan was disbanded'),
        leave: () => res(Social.leave(), 'You left the clan'),
      }[b.dataset.arm];
      act?.();
    });
  }
}
