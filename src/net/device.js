// =====================================================================
//  Cihaz bilgisi (hile/bot analizi için, admin paneli "Withdrawals").
//  - dev: bu tarayıcıda saklanan rastgele cihaz kimliği (kayıt silinse de oyun kaydından ayrı tutulur)
//  - fp: tarayıcı parmak izinin özeti (ekran, saat dilimi, dil, işlemci, grafik kartı adı, canvas çizimi)
//  - ua, mobile, webdriver (otomasyon tarayıcısı), tz, screen
//  Kişisel veri toplanmaz: IP sunucuda sadece özet olarak tutulur, parmak izi geri çözülemez bir özettir.
// =====================================================================
const DEV_KEY = 'afk_device_id';

function devId() {
  try {
    let id = localStorage.getItem(DEV_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));
      localStorage.setItem(DEV_KEY, id);
    }
    return id;
  } catch (e) { return 'nostorage-' + Math.random().toString(36).slice(2, 12); }
}

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
  } catch (e) { return ''; }
}

function canvasMark() {
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 40;
    const g = c.getContext('2d');
    g.textBaseline = 'top'; g.font = '16px Arial'; g.fillStyle = '#f60'; g.fillRect(0, 0, 80, 20);
    g.fillStyle = '#069'; g.fillText('AFK Dungeon ◈ 2026', 2, 4);
    return c.toDataURL().slice(-120);
  } catch (e) { return ''; }
}

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  } catch (e) {
    let h = 2166136261;                                   // yedek: FNV-1a
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
}

export async function deviceInfo() {
  const n = navigator, s = window.screen || {};
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  const screen = `${s.width || 0}x${s.height || 0}@${Math.round((window.devicePixelRatio || 1) * 100) / 100}`;
  const mobile = !!(n.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad|iPod/i.test(n.userAgent || ''))
    || (matchMedia?.('(pointer: coarse)').matches && Math.min(s.width || 0, s.height || 0) < 900);
  const fp = await sha256([screen, s.colorDepth, tz, n.language, (n.languages || []).join(','), n.platform, n.hardwareConcurrency,
    n.deviceMemory, n.maxTouchPoints, gpuName(), canvasMark()].join('|'));
  return { dev: devId(), fp, ua: String(n.userAgent || '').slice(0, 300), mobile, webdriver: !!n.webdriver, tz, screen };
}
