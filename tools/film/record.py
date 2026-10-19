#!/usr/bin/env python3
"""Filmi kare kare çeker. Örnek:
  python3 tools/film/record.py --film intro --out /tmp/film --size 1280x720            # tüm kareler
  python3 tools/film/record.py --film intro --out /tmp/film --at 1,4,7,10,14 --size 960x540   # sadece bu saniyeler
Sonra: ffmpeg -framerate 30 -i /tmp/film/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart intro.mp4
"""
import argparse, os, subprocess, socket, time
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
ap = argparse.ArgumentParser(); ap.add_argument('--film', default='intro'); ap.add_argument('--out', required=True)
ap.add_argument('--size', default='1280x720'); ap.add_argument('--fps', type=int, default=30); ap.add_argument('--at', default='')
a = ap.parse_args(); W, H = map(int, a.size.split('x')); os.makedirs(a.out, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', 'serve.mjs'], cwd=ROOT, env={**os.environ, 'PORT': str(port), 'BROWSER': 'none'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
errs = []
try:
    time.sleep(1)
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': W, 'height': H})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('afk_social_v1',JSON.stringify({v:1,me:{id:'me',nick:'Film_01',createdAt:1}}));")
        pg.goto(f'http://127.0.0.1:{port}/?local=1'); pg.wait_for_selector('#screen-title:not(.hidden)', timeout=180000)
        pg.evaluate("""(async()=>{
          document.querySelectorAll('.screen, #hud, #toast, #banner').forEach(e=>e.classList.add('hidden'));
          const f=document.createElement('div'); f.id='film-fade'; f.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:99;pointer-events:none'; document.body.append(f);
          const g=window.__game; g.renderer.setAnimationLoop(null); g.paused=false;
          const m=await import('/tools/film/""" + a.film + """.js'); window.__film=m.build(g);
        })()""")
        pg.wait_for_function('window.__film', timeout=60000)
        dur = pg.evaluate('window.__film.duration')
        times = [float(x) for x in a.at.split(',')] if a.at else [i / a.fps for i in range(int(dur * a.fps))]
        step = 1 / a.fps; cur = 0.0; n = 0
        for i, t in enumerate(times):
            # zamanı ileri, kare adımlarıyla sür (animasyonlar doğru oynasın)
            pg.evaluate(f"""(()=>{{const F=window.__film,g=window.__game; let c={cur}; const T={t};
              while(c+{step}<=T+1e-6){{c+={step}; F.tick(c);}} F.tick(T);
              document.getElementById('film-fade').style.opacity=F.fade?F.fade(T):0; g.renderer.render(g.scene,g.camera);}})()""")
            cur = t
            pg.screenshot(path=os.path.join(a.out, f'f{n:04d}.png' if not a.at else f's{n:02d}_{t:.1f}.png')); n += 1
        print('frames', n, 'duration', dur)
        b.close()
finally:
    srv.terminate()
print('errors', errs or 'none')
