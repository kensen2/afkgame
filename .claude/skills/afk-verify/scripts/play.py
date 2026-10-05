#!/usr/bin/env python3
"""AFK Dungeon tarayıcı testi: oyunu açar, istenen kahraman/dalgada savaşa girer,
isteğe bağlı tuşlara basar, oyun zamanına göre ekran görüntüsü alır, konsol hatalarını raporlar.

Örnekler:
  python3 .claude/skills/afk-verify/scripts/play.py --hero warrior --wave 8 --press 4 --at 0.5,1.0,1.6 --out /tmp/shots
  python3 .claude/skills/afk-verify/scripts/play.py --hero lion --wave 12 --at 0 --width 390 --height 800
  python3 .claude/skills/afk-verify/scripts/play.py --screen select          # sadece kahraman seçim ekranı
Çıkış kodu: hata yoksa 0, sayfa hatası varsa 1.
"""
import argparse, os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
NICK = "if(!sessionStorage.__afk){sessionStorage.__afk=1;localStorage.setItem('afk_social_v1',JSON.stringify({v:1,me:{id:'me',nick:'Tester_01',createdAt:1}}));}"


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', choices=['warrior', 'lion', 'mage'], default='warrior')
    ap.add_argument('--wave', type=int, default=1)
    ap.add_argument('--press', default='', help='savaş başlayınca basılacak tuşlar, virgülle (ör. 4 veya 1,2)')
    ap.add_argument('--at', default='0', help='tuşa bastıktan sonra oyun saniyesi cinsinden çekim anları, virgülle')
    ap.add_argument('--min-enemies', type=int, default=3)
    ap.add_argument('--godmode', action='store_true', default=True)
    ap.add_argument('--auto', action='store_true', help='AUTO yetenekleri açık kalsın')
    ap.add_argument('--screen', choices=['combat', 'title', 'select'], default='combat')
    ap.add_argument('--width', type=int, default=1100)
    ap.add_argument('--height', type=int, default=620)
    ap.add_argument('--out', default='/tmp/afk-shots')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    port = free_port()
    srv = subprocess.Popen(['node', 'serve.mjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port), 'BROWSER': 'none'},
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors, shots = [], []
    try:
        for _ in range(50):
            try: socket.create_connection(('127.0.0.1', port), 0.2).close(); break
            except OSError: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS)
            pg = b.new_page(viewport={'width': a.width, 'height': a.height})
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and 'TUNNEL' not in m.text and errors.append(m.text))
            pg.add_init_script(NICK)
            pg.goto(f'http://127.0.0.1:{port}/')
            pg.wait_for_selector('#screen-title:not(.hidden)', timeout=180000)
            pg.evaluate(f"const d=window.__eco.data; d.resumeWave={a.wave}; d.opened=Math.max(20,{a.wave}); d.settings.auto={'true' if a.auto else 'false'}; window.__eco.save()")
            if a.screen == 'title':
                shots.append(os.path.join(a.out, 'title.png')); pg.screenshot(path=shots[-1])
            else:
                pg.click('#btn-play'); pg.wait_for_timeout(400)
                pg.click(f"#hero-cards .card:nth-child({['warrior', 'lion', 'mage'].index(a.hero) + 1})"); pg.wait_for_timeout(200)
                if a.screen == 'select':
                    shots.append(os.path.join(a.out, 'select.png')); pg.screenshot(path=shots[-1])
                else:
                    pg.click('#btn-start')
                    pg.wait_for_function(f"window.__game.phase==='combat' && window.__game.enemies.filter(e=>!e.dead&&e.active).length>={a.min_enemies}", timeout=180000)
                    if a.godmode:
                        # seviye atlayınca stats yenilenir; ölümsüzlüğü her karede yeniden uygula
                        pg.evaluate("const g=window.__game; setInterval(()=>{const h=g.hero; if(h&&!h.dead){h.stats.maxHp=1e6; h.hp=1e6;}},50); const h=g.hero; h.skillCds=h.skillCds.map(()=>0); h.ultCds=(h.ultCds||[]).map(()=>0)")
                    keys = [x for x in a.press.split(',') if x]
                    t0 = None
                    for i, k in enumerate(keys):
                        if i:   # önceki büyü bitene kadar bekle (kahraman büyü yaparken diğer tuşları yok sayar)
                            pg.wait_for_function('!(window.__game.hero.casting>0)', timeout=60000, polling=16)
                        pg.keyboard.press(k)
                        if t0 is None: t0 = pg.evaluate('window.__game.time')
                    if t0 is None: t0 = pg.evaluate('window.__game.time')
                    for i, tt in enumerate(float(x) for x in a.at.split(',') if x != ''):
                        pg.wait_for_function(f'window.__game.time-{t0}>={tt}', timeout=120000, polling=16)
                        shots.append(os.path.join(a.out, f'shot_{i + 1:02d}_{tt:.2f}s.png')); pg.screenshot(path=shots[-1])
            b.close()
    finally:
        srv.terminate()
    print('screenshots:'); [print('  ' + s) for s in shots]
    print('errors:', errors if errors else 'none')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
