// Altıgen enerji kalkanı (Warrior · Iron Stance).
// Petek desenli, kenarları parlayan (fresnel), darbe noktasından dalga yayan bir küre.
// Açılırken petekler rastgele sırayla belirir, kapanırken sönerek kaybolur.
import * as THREE from 'three';

const MAX_HITS = 4;

const vert = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */`
  uniform float uTime;
  uniform float uOpen;      // 0..1 peteklerin görünme oranı
  uniform float uAlpha;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform vec4 uHits[${MAX_HITS}];   // xyz: yerel darbe noktası, w: yaş (sn), w<0 = boş
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPos;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
  vec4 hexCoords(vec2 uv) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return vec4(gv, uv - gv);
  }

  void main() {
    vec2 uv = vec2(vUv.x * 30.0, vUv.y * 15.0);
    vec4 hc = hexCoords(uv);
    float d = hexDist(hc.xy);
    float line = smoothstep(0.40, 0.49, d);                   // petek kenarı
    float id = hash(hc.zw);
    float reveal = step(id, uOpen);                           // açılış/kapanış
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float scan = 0.5 + 0.5 * sin(vPos.y * 4.0 - uTime * 3.0 + id * 2.0);
    float pulse = 0.75 + 0.25 * sin(uTime * 2.0 + id * 6.2831);

    float hit = 0.0;
    for (int i = 0; i < ${MAX_HITS}; i++) {
      vec4 h = uHits[i];
      if (h.w < 0.0) continue;
      float dist = distance(vPos, h.xyz);
      float age = h.w;
      float fade = max(0.0, 1.0 - age * 1.6);
      float wave = exp(-pow((dist - age * 5.0) * 2.2, 2.0));   // yayılan halka
      float core = 1.0 - smoothstep(0.0, 1.1, dist);           // darbe noktası
      hit += (wave * 0.9 + core * 1.3) * fade;
    }

    float a = (line * (0.35 + 0.35 * scan) * pulse + fres * 0.55 + 0.035 + hit * (0.35 + line)) * reveal;
    vec3 col = mix(uColor, uEdge, clamp(fres + line * 0.3, 0.0, 1.0)) + vec3(hit * 0.9);
    gl_FragColor = vec4(col, a * uAlpha);
  }
`;

export class HexShield {
  constructor(radius = 1.75, color = 0x4aa8ff, edge = 0xffe08a) {
    const hits = [];
    for (let i = 0; i < MAX_HITS; i++) hits.push(new THREE.Vector4(0, 0, 0, -1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 }, uOpen: { value: 0 }, uAlpha: { value: 1 },
        uColor: { value: new THREE.Color(color) }, uEdge: { value: new THREE.Color(edge) },
        uHits: { value: hits },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 6;
    this.state = 'off';   // off | opening | on | closing
    this.t = 0;
    this.nextHit = 0;
  }

  open() {
    if (this.state === 'on' || this.state === 'opening') return;
    this.state = 'opening'; this.t = 0; this.mesh.visible = true;
  }
  close() {
    if (this.state === 'off' || this.state === 'closing') return;
    this.state = 'closing'; this.t = 0;
  }
  // worldPos: darbenin geldiği nokta (dünya koordinatı)
  hit(worldPos) {
    if (this.state === 'off') return;
    const local = this.mesh.worldToLocal(worldPos.clone());
    local.setLength(this.mesh.geometry.parameters.radius);
    const h = this.mat.uniforms.uHits.value[this.nextHit];
    h.set(local.x, local.y, local.z, 0);
    this.nextHit = (this.nextHit + 1) % MAX_HITS;
  }

  update(dt, time) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    for (const h of u.uHits.value) if (h.w >= 0) { h.w += dt; if (h.w > 0.9) h.w = -1; }
    if (this.state === 'off') return;
    this.t += dt;
    if (this.state === 'opening') {
      const k = Math.min(1, this.t / 0.28);
      u.uOpen.value = k;
      // "pop": biraz büyüyüp yerine oturur
      const s = k < 0.7 ? 0.55 + (k / 0.7) * 0.55 : 1.1 - ((k - 0.7) / 0.3) * 0.1;
      this.mesh.scale.setScalar(s);
      u.uAlpha.value = 1.3 - k * 0.3;
      if (k >= 1) { this.state = 'on'; this.mesh.scale.setScalar(1); u.uAlpha.value = 1; }
    } else if (this.state === 'closing') {
      const k = Math.min(1, this.t / 0.4);
      u.uOpen.value = 1 - k;
      if (k >= 1) { this.state = 'off'; this.mesh.visible = false; }
    }
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
