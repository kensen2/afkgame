// =====================================================================
//  Founding Raider kartı (1200×675, X paylaşımı için yatay görsel). Oyunun kahraman çizimlerini kullanır.
// =====================================================================
const RARITY = {
  Common:    { c: '#a7b0ba', glow: 'rgba(167,176,186,0.35)', bg: ['#2a2d31', '#16181b'] },
  Rare:      { c: '#4fa3ff', glow: 'rgba(79,163,255,0.45)',  bg: ['#13263d', '#0a1422'] },
  Epic:      { c: '#b36bff', glow: 'rgba(179,107,255,0.5)',  bg: ['#2a1640', '#140a22'] },
  Legendary: { c: '#ffb02e', glow: 'rgba(255,176,46,0.6)',   bg: ['#3d2810', '#1f1206'] },
};
const HERO = {
  warrior: { name: 'Blue-Gold Warrior', fw: 166, fh: 181 },
  lion:    { name: 'Lion Blade',        fw: 264, fh: 270 },
  mage:    { name: 'Ember Mage',        fw: 219, fh: 270 },
};
export const rarityColor = (r) => (RARITY[r] || RARITY.Common).c;

const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return imgCache[src];
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// card: { no, rarity, hero, atk, def, luck }, handle: "kensen2"
export async function drawCard(canvas, card, handle, siteUrl) {
  const W = 1200, H = 675, g = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const R = RARITY[card.rarity] || RARITY.Common, hero = HERO[card.hero] || HERO.warrior;
  try { await Promise.all([document.fonts.load('800 64px Cinzel'), document.fonts.load('700 28px "Alegreya Sans"')]); } catch (e) { /* yedek font */ }

  // zemin: karanlık zindan, meşale ışığı
  let gr = g.createRadialGradient(W * 0.3, H * 0.45, 40, W * 0.3, H * 0.45, W * 0.75);
  gr.addColorStop(0, '#2b2014'); gr.addColorStop(1, '#07060a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.07; g.strokeStyle = '#c9a668'; g.lineWidth = 2;
  for (let y = 40; y < H; y += 56) for (let x = (y / 56) % 2 ? 0 : 60; x < W; x += 120) g.strokeRect(x, y, 120, 56);
  g.globalAlpha = 1;
  // kıvılcımlar
  let seed = (card.no || 1) * 9301;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(255,${150 + rnd() * 80 | 0},60,${0.3 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 0, 7); g.fill(); }

  // ---- kart (sol) ----
  const cx = 86, cy = 52, cw = 400, ch = 571;
  g.save(); g.shadowColor = R.glow; g.shadowBlur = 50;
  roundRect(g, cx, cy, cw, ch, 22); g.fillStyle = R.c; g.fill(); g.restore();
  roundRect(g, cx + 8, cy + 8, cw - 16, ch - 16, 16);
  gr = g.createLinearGradient(0, cy, 0, cy + ch); gr.addColorStop(0, R.bg[0]); gr.addColorStop(1, R.bg[1]);
  g.fillStyle = gr; g.fill();
  // üst şerit
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(cx + 8, cy + 18, cw - 16, 46);
  g.fillStyle = R.c; g.font = '800 22px Cinzel, serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(card.rarity.toUpperCase(), cx + 26, cy + 41);
  g.textAlign = 'right'; g.fillStyle = '#e8dcc4'; g.fillText(`#${card.no}`, cx + cw - 26, cy + 41);
  // kahraman
  const art = { x: cx + 26, y: cy + 78, w: cw - 52, h: 300 };
  gr = g.createRadialGradient(art.x + art.w / 2, art.y + art.h * 0.62, 10, art.x + art.w / 2, art.y + art.h * 0.62, art.w * 0.7);
  gr.addColorStop(0, R.glow); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(art.x, art.y, art.w, art.h);
  try {
    const img = await loadImg(`assets/heroes/${card.hero}_idle.png`);
    const s = Math.min(art.w / hero.fw, art.h / hero.fh) * 0.98, w = hero.fw * s, h = hero.fh * s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, hero.fw, hero.fh, art.x + (art.w - w) / 2, art.y + art.h - h, w, h);
  } catch (e) { /* görsel yüklenemedi */ }
  // isim
  g.textAlign = 'center'; g.fillStyle = '#f3e7cc'; g.font = '800 30px Cinzel, serif';
  g.fillText(hero.name, cx + cw / 2, cy + 405);
  g.fillStyle = R.c; g.font = '700 22px "Alegreya Sans", sans-serif';
  g.fillText(`@${handle}`, cx + cw / 2, cy + 438);
  // istatistikler
  [['ATK', card.atk], ['DEF', card.def], ['LUCK', card.luck]].forEach(([k, v], i) => {
    const y = cy + 476 + i * 30, bx = cx + 108, bw = cw - 170;
    g.textAlign = 'left'; g.fillStyle = '#b8ae96'; g.font = '800 17px Cinzel, serif'; g.fillText(k, cx + 34, y);
    roundRect(g, bx, y - 8, bw, 16, 8); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
    roundRect(g, bx, y - 8, bw * v / 100, 16, 8); g.fillStyle = R.c; g.fill();
    g.textAlign = 'right'; g.fillStyle = '#f3e7cc'; g.font = '700 17px "Alegreya Sans", sans-serif'; g.fillText(String(v), cx + cw - 24, y);
  });

  // ---- sağ: başlık ----
  const rx = 560;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#e3bf74'; g.font = '800 30px Cinzel, serif'; g.fillText('AFK', rx, 150);
  g.save(); g.shadowColor = 'rgba(255,160,60,0.5)'; g.shadowBlur = 24;
  g.fillStyle = '#f3e7cc'; g.font = '800 92px Cinzel, serif'; g.fillText('DUNGEON', rx - 6, 236); g.restore();
  g.fillStyle = R.c; g.fillRect(rx, 262, 120, 4);
  g.fillStyle = '#f3e7cc'; g.font = '800 40px Cinzel, serif'; g.fillText('FOUNDING RAIDER', rx, 330);
  g.fillStyle = R.c; g.font = '800 34px Cinzel, serif'; g.fillText(`#${card.no} · ${card.rarity}`, rx, 380);
  g.fillStyle = '#c9bfa6'; g.font = '700 30px "Alegreya Sans", sans-serif'; g.fillText(`@${handle}`, rx, 432);
  g.fillStyle = '#8f8670'; g.font = '600 24px "Alegreya Sans", sans-serif';
  g.fillText('Descend into the dark.', rx, 494);
  g.fillText('Your hero fights while you sleep.', rx, 526);
  g.fillStyle = '#e3bf74'; g.font = '800 24px "Alegreya Sans", sans-serif'; g.fillText(siteUrl, rx, 590);
  return canvas;
}
