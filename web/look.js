// Conexa Hotel – resa grafica: materiali PBR, mappa d'ambiente, suolo bagnato riflettente, finestre guidate dal KNX
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// ------------------------------------------------------------------ materiali per nome (come esportati da Blender/Unreal)
// c = colore base, r = rugosità, m = metallicità, env = intensità riflessi, g = colore di giorno (se diverso)
// emiK = intensità emissiva per ambiente {giorno, sera, notte}; fisico = MeshPhysicalMaterial (clearcoat, vetro)
const TAB = {
  struttura:     { c: '#1c2436', r: 0.48, m: 0.2, env: 1.0 },
  solaio:        { c: '#262d3d', r: 0.55, m: 0.1 },
  bordo:         { c: '#4a3428', r: 0.5, emiK: { giorno: 0.05, sera: 0.4, notte: 0.6 } },
  vetro:         { fisico: true, c: '#9db6cc', r: 0.04, m: 0, op: 0.3, env: 1.8 },
  macchina:      { c: '#8a9099', r: 0.32, m: 0.85 },
  bronzo:        { c: '#7a5636', r: 0.3, m: 0.9, env: 1.2 },
  fv:            { fisico: true, c: '#0a1430', r: 0.12, m: 0.4, cc: 1, ccr: 0.04, env: 1.4 },
  lamelle:       { c: '#30343b', r: 0.38, m: 0.8 },
  lamelle_lm:    { c: '#9a7a52', r: 0.32, m: 0.85 },
  tubo_rosso:    { c: '#9a1a14', r: 0.35, m: 0.2 },
  tubo_blu:      { c: '#1a3a9a', r: 0.35, m: 0.2 },
  palo:          { c: '#2f343b', r: 0.32, m: 0.85 },
  auto:          { fisico: true, c: '#6a0c16', r: 0.28, m: 0.55, cc: 1, ccr: 0.03, env: 1.4 },
  pneumatico:    { c: '#121212', r: 0.85 },
  asfalto:       { c: '#16181d', r: 0.38, env: 0.4, po: -2, g: '#4a4a48', rg: 0.85 },
  piazzale:      { c: '#0b0c14', r: 0.45, env: 0.25, foroPiscina: true, g: '#55623f', rg: 0.95 },
  terra:         { c: '#2c2018', r: 0.95 },
  verde:         { c: '#24421f', r: 0.8 },
  verde_sc:      { c: '#1d3a1e', r: 0.85, emi: '#ffb070', emiK: { giorno: 0, sera: 0.05, notte: 0.08 } },
  tronco:        { c: '#4c3626', r: 0.8, emi: '#ffb070', emiK: { giorno: 0, sera: 0.15, notte: 0.25 } },
  legno:         { c: '#82573a', r: 0.62 },
  ghiaietto:     { c: '#948f86', r: 0.95, po: -2 },
  calcestruzzo:  { c: '#7f7e7a', r: 0.85 },
  cordolo:       { c: '#4b4e56', r: 0.7 },
  cavidotto:     { c: '#3a3c40', r: 0.6 },
  monti:         { c: '#0c0e1a', r: 1, g: '#56637a', env: 0 },
  segnaletica:   { c: '#e2e2e2', r: 0.5, po: -4 },
  quadro_el:     { c: '#b8b6a6', r: 0.4, m: 0.3 },
  quadro:        { c: '#a8aab0', r: 0.4, m: 0.4 },
  serranda:      { c: '#8c9098', r: 0.35, m: 0.8 },
  passerella:    { c: '#8d8d84', r: 0.4, m: 0.8 },
  collettore:    { c: '#c4c6cc', r: 0.25, m: 0.9 },
  canale_mandata:{ c: '#9cc4dc', r: 0.35, m: 0.7 },
  canale_ripresa:{ c: '#d4bf7c', r: 0.35, m: 0.7 },
  acqua_piscina: { fisico: true, c: '#0b6d86', r: 0.04, op: 0.88, env: 1.6, emi: '#3cc8ff', emiK: { giorno: 0.04, sera: 0.22, notte: 0.32 } },
  muro:          { c: '#cbc2b4', r: 0.85, knx: 'fill' },
  porta:         { c: '#3e2818', r: 0.5, knx: 'fill' },
  scala:         { c: '#4c4844', r: 0.6, knx: 'fill' },
  // arredi (arredi.js) – stile "tech caldo": noce scuro, bronzo, tessuti naturali, LED 2700 K guidati dal KNX
  ar_noce:       { c: '#3a2416', r: 0.5, knx: 'fill' },
  ar_noce_chiaro:{ c: '#9a6a40', r: 0.6, knx: 'fill' },
  ar_bronzo:     { c: '#8a6236', r: 0.3, m: 0.9, knx: 'fill' },
  ar_lenzuola:   { c: '#d6cdbf', r: 0.95, knx: 'fill' },
  ar_plaid:      { c: '#6b5a4a', r: 0.95, knx: 'fill' },
  ar_cuoio:      { c: '#7a4626', r: 0.45, knx: 'fill' },
  ar_velluto:    { c: '#28403c', r: 0.8, knx: 'fill' },
  ar_tessuto:    { c: '#8c8478', r: 0.95, knx: 'fill' },
  ar_pietra:     { c: '#34322f', r: 0.22, knx: 'fill' },
  ar_marmo:      { c: '#c4baab', r: 0.2, knx: 'fill' },
  ar_gres:       { c: '#6d675f', r: 0.55, knx: 'fill' },
  ar_parquet:    { c: '#4a3122', r: 0.45, knx: 'fill' },
  ar_resina:     { c: '#8d857a', r: 0.22, knx: 'fill' },
  ar_moquette:   { c: '#2c2927', r: 1, knx: 'fill' },
  ar_tappeto:    { c: '#5e5650', r: 1, knx: 'fill' },
  ar_soffitto:   { c: '#e2dbd0', r: 0.9, knx: 'fill' },
  ar_tenda:      { c: '#d4c8b6', r: 1, knx: 'fill' },
  ar_acciaio:    { c: '#b7babe', r: 0.28, m: 0.9, knx: 'fill' },
  ar_ceramica:   { c: '#f2efe9', r: 0.15, knx: 'fill' },
  ar_specchio:   { c: '#c9d2d8', r: 0.04, m: 1, env: 1.5 },
  ar_schermo:    { c: '#08090b', r: 0.15, m: 0.2 },
  ar_vetro:      { fisico: true, c: '#b8ccd6', r: 0.05, op: 0.22, env: 1.4 },
  ar_pianta:     { c: '#2c4a26', r: 0.8, knx: 'fill' },
  ar_vaso:       { c: '#2a2826', r: 0.6, knx: 'fill' },
  ar_deck:       { c: '#5a3c26', r: 0.75 },
  ar_cuscino_ext:{ c: '#cfc5b4', r: 0.95 },
  ar_led:        { c: '#ffd2a0', r: 0.6, emi: '#ffb46b', knx: 'led' },       // circuito generale / bagno / ambiente
  ar_led_let:    { c: '#ffd2a0', r: 0.6, emi: '#ffb46b', knx: 'led_let' },   // circuito lettura (testata, applique)
  ar_led_cor:    { c: '#ffd2a0', r: 0.6, emi: '#ffb46b', knx: 'led_cor' },   // circuito cortesia (LED a pavimento)
  // interni delle camere e degli ambienti: emissivo guidato dallo stato dei circuiti KNX (vedi finestreKNX)
  interno:       { c: '#d9b892', r: 0.8, knx: true },
  interno_sc:    { c: '#8a5a38', r: 0.8, knx: true },
};
// materiali luminosi (neon, LED, icone, insegne): restano emissivi, attenuati di giorno
const LUMINOSI = /^(led_|neon_|lama_rossa|icona|pannello|uscita|luci_borgo|colonnina_ev|led_esterno)/;
const K_LUMINOSI = { giorno: 0.35, sera: 0.85, notte: 1 };

const cache = new Map();
const variabili = [];             // materiali che cambiano tra giorno, sera e notte
let texLuciInt = null;
let ambienteAttuale = 'notte';
const uKInt = { value: 1 };
const uQ = { value: new THREE.Vector2(4.5, 8) };

export function rifinisciMateriale(mat, liv) {
  const nome = (mat.name || '').replace(/\.\d+$/, '');
  const key = `${liv}|${nome}`;
  if (cache.has(key)) return cache.get(key);
  const t = TAB[nome];
  let m;
  if (t) {
    const C = t.fisico ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    m = new C({ name: nome, color: t.c, roughness: t.r, metalness: t.m ?? 0, envMapIntensity: t.env ?? (t.knx === 'fill' ? (t.m ? 0.5 : 0.12) : 0.8) });   // negli interni il cielo viola non deve tingere le superfici
    if (t.op !== undefined) Object.assign(m, { transparent: true, opacity: t.op, depthWrite: false });
    if (t.po) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: t.po, polygonOffsetUnits: t.po });
    if (t.foroPiscina) forarePiscina(m);
    if (t.cc) Object.assign(m, { clearcoat: t.cc, clearcoatRoughness: t.ccr ?? 0.05 });
    if (nome === 'vetro') Object.assign(m, { side: THREE.DoubleSide, specularIntensity: 1, ior: 1.5 });
    if (t.emi || t.emiK) m.emissive.set(t.emi || (mat.emissive ? mat.emissive.getHex() : 0x000000));
    m.userData.tab = t;
    m.userData.notte = { c: new THREE.Color(t.c), r: t.r };
    m.userData.giorno = { c: new THREE.Color(t.g || t.c), r: t.rg ?? t.r };
    if (t.knx === true) m.emissive.set(mat.emissive && mat.emissive.getHex() ? mat.emissive.getHex() : 0xffb070);
    if (t.knx) collegaFinestre(m, t.knx === true ? 'interno' : t.knx);
    if (t.emiK || t.g) variabili.push(m);
  } else {
    m = mat;
    if (m.isMeshStandardMaterial) {
      m.envMapIntensity = 0.8;
      if (LUMINOSI.test(nome)) { m.userData.lum = true; m.userData.emiBase = m.emissiveIntensity || 1; variabili.push(m); }
    }
  }
  cache.set(key, m);
  applicaAmbiente(m, ambienteAttuale);
  return m;
}

// il piazzale (spessore 0,3 m) copriva l'acqua della piscina esterna: lo si fora sulla vasca
function forarePiscina(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPosP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWPosP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPosP;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (vWPosP.x > -18.95 && vWPosP.x < -13.95 && vWPosP.z > -29.05 && vWPosP.z < -16.95) discard;');
  };
  m.customProgramCacheKey = () => 'foro-piscina';
}

// ------------------------------------------------------------------ luce degli interni guidata dal KNX
// Una texture in pianta (4 texel/m, 4 piani) porta per ogni punto:
//  R = luce diffusa dagli apparecchi accesi vicini (decresce con la distanza, non passa i muri del bagno)
//  G = livello del circuito lettura della camera   (testata, applique)
//  B = livello del circuito cortesia della camera  (LED sotto letto, consolle, armadio)
//  A = livello del circuito generale (camera) o del bagno (zona bagno) o dell'ambiente (spazi comuni)
const TW = 160, TH = 128, PIANI = 4, TPM = 4;
const uFill = { value: 0.34 };
const CANALE = { interno: 'a', fill: 'r', led: 'a', led_let: 'g', led_cor: 'b' };
function collegaFinestre(m, modo = 'interno') {
  if (!texLuciInt) {
    texLuciInt = new THREE.DataTexture(new Uint8Array(TW * TH * PIANI * 4), TW, TH * PIANI, THREE.RGBAFormat);
    texLuciInt.magFilter = texLuciInt.minFilter = THREE.LinearFilter;
    texLuciInt.needsUpdate = true;
  }
  const ch = CANALE[modo] || 'a';
  m.onBeforeCompile = sh => {
    sh.uniforms.tLuciInt = { value: texLuciInt };
    sh.uniforms.uKInt = uKInt; sh.uniforms.uQ = uQ; sh.uniforms.uFill = uFill;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPosI;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWPosI = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPosI;\nuniform sampler2D tLuciInt;\nuniform float uKInt;\nuniform float uFill;\nuniform vec2 uQ;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float pianoI = vWPosI.y < -0.2 ? 0.0 : (vWPosI.y < uQ.x ? 1.0 : (vWPosI.y < uQ.y ? 2.0 : 3.0));
      vec2 uvI = vec2((vWPosI.x + 1.0) / 40.0, ((clamp((-vWPosI.z + 2.0) / 32.0, 0.002, 0.998)) + pianoI) / 4.0);
      float livI = texture2D(tLuciInt, uvI).${ch};
      ${modo === 'interno' ? 'totalEmissiveRadiance *= uKInt * (0.03 + 0.6 * livI);\n      diffuseColor.rgb *= 0.35 + 0.65 * livI;'
      : modo === 'fill' ? 'totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.86, 0.68) * uFill * uKInt * livI;'
      : 'totalEmissiveRadiance *= uKInt * 2.2 * livI;'}`);
  };
  m.customProgramCacheKey = () => 'luce-interna-' + modo;
}
// regioni: [{liv, rect:[x0,y0,x1,y1], a, g, b}] (0..1, le più piccole sovrascrivono le grandi)
// sorgenti: [{liv, x, y, k, r, clip:[rect], excl:[rect]|null}] in coordinate di pianta
const PIANO = { INT: 0, PT: 1, P1: 2, P2: 3 };
const _R = new Float32Array(TW * TH * PIANI);
export function aggiornaFinestre(regioni, sorgenti, quote) {
  if (!texLuciInt) return;
  uQ.value.set(quote.P1, quote.P2);
  const d = texLuciInt.image.data; d.fill(0); _R.fill(0);
  const tx = x => Math.floor((x + 1) * TPM), ty = y => Math.floor((y + 2) * TPM);
  const area = r => (r[2] - r[0]) * (r[3] - r[1]);
  for (const g of [...regioni].sort((a, b) => area(b.rect) - area(a.rect))) {
    const f = PIANO[g.liv]; if (f === undefined) continue;
    const [x0, y0, x1, y1] = g.rect;
    for (let j = Math.max(0, ty(y0)); j < Math.min(TH, ty(y1)); j++)
      for (let i = Math.max(0, tx(x0)); i < Math.min(TW, tx(x1)); i++) {
        const o = ((f * TH + j) * TW + i) * 4;
        d[o + 1] = g.g * 255; d[o + 2] = g.b * 255; d[o + 3] = g.a * 255;
      }
  }
  for (const s of sorgenti) {
    const f = PIANO[s.liv]; if (f === undefined || s.k <= 0) continue;
    const c = s.clip, e = s.excl;
    const i0 = Math.max(0, tx(Math.max(c[0], s.x - s.r))), i1 = Math.min(TW - 1, tx(Math.min(c[2], s.x + s.r)));
    const j0 = Math.max(0, ty(Math.max(c[1], s.y - s.r))), j1 = Math.min(TH - 1, ty(Math.min(c[3], s.y + s.r)));
    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) / TPM - 2;
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) / TPM - 1;
        if (e && px > e[0] && px < e[2] && py > e[1] && py < e[3]) continue;
        const dist = Math.hypot(px - s.x, py - s.y); if (dist >= s.r) continue;
        _R[(f * TH + j) * TW + i] += s.k * Math.pow(1 - dist / s.r, 1.4);
      }
    }
  }
  for (let n = 0; n < _R.length; n++) d[n * 4] = Math.min(255, _R[n] * 230);
  texLuciInt.needsUpdate = true;
}

// ------------------------------------------------------------------ cielo synthwave con stelle
export const cieloShader = {
  uniforms: { alto: { value: new THREE.Color() }, orizzonte: { value: new THREE.Color() }, basso: { value: new THREE.Color() },
    alone: { value: new THREE.Color() }, stelle: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 alto, orizzonte, basso, alone; uniform float stelle; varying vec3 vP;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      float h = vP.y;
      vec3 c = h > 0.0 ? mix(orizzonte, alto, smoothstep(0.0, 0.38, h)) : mix(orizzonte, basso, pow(-h, 0.35));
      // alone caldo all'orizzonte, più intenso verso ovest (il lato del tramonto)
      float fascia = exp(-abs(h) * 9.0) * (0.55 + 0.45 * smoothstep(-0.6, 0.9, -vP.x));
      c += alone * fascia;
      if (stelle > 0.0 && h > 0.08) {
        vec2 g = vec2(atan(vP.z, vP.x) * 180.0, h * 260.0);
        vec2 id = floor(g); float r = h21(id);
        float s = step(0.993, r) * smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * (0.3 + 0.7 * h21(id + 7.0));
        c += vec3(0.85, 0.9, 1.0) * s * stelle * 0.8 * smoothstep(0.12, 0.45, h);
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// ------------------------------------------------------------------ mappa d'ambiente (cielo + riflessi neon) per vetri e metalli
export function creaAmbiente(renderer, cieloMat) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), cieloMat));
  const strisce = [];
  const aggiungi = (col, x, y, z, sx, sy, ry) => {
    const m = new THREE.MeshBasicMaterial({ color: col, toneMapped: false, side: THREE.DoubleSide });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), m); p.position.set(x, y, z); p.rotation.y = ry; sc.add(p);
    strisce.push({ m, base: new THREE.Color(col) });
  };
  // bande luminose basse come le insegne e i neon del lotto: rosso a sud/ovest, blu a nord/est, caldo dal piazzale
  aggiungi(0xff2d4b, -30, 3, 10, 40, 1.2, Math.PI / 2.4);
  aggiungi(0x2a5cff, 25, 4, -25, 45, 1.2, -Math.PI / 3);
  aggiungi(0xff2d4b, 10, 6, 35, 30, 0.8, 0);
  aggiungi(0xffb070, 0, -6, 0, 60, 60, 0); strisce.at(-1).piano = true;
  let rt = null;
  return function aggiorna(kNeon, kCaldo) {
    for (const s of strisce) s.m.color.copy(s.base).multiplyScalar(s.piano ? kCaldo : kNeon * 3);
    if (rt) rt.dispose();
    rt = pmrem.fromScene(sc, 0.03);
    return rt.texture;
  };
}

// ------------------------------------------------------------------ suolo bagnato riflettente (stile render Unreal)
const suoloShader = {
  name: 'SuoloBagnato',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uForza: { value: 0.8 }, uTempo: { value: 0 }, uTinta: { value: new THREE.Color(0x05060c) } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uForza, uTempo; uniform vec3 uTinta; varying vec4 vUv; varying vec3 vW;
    #include <logdepthbuf_pars_fragment>
    float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }
    bool dentro(vec2 p, vec4 r){ return p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w; }
    void main(){
      #include <logdepthbuf_fragment>
      // niente riflesso sotto l'edificio e sulla vasca della piscina esterna
      if (dentro(vW.xz, vec4(0.2, -28.3, 37.8, -1.2)) || dentro(vW.xz, vec4(-19.0, -29.2, -13.9, -16.9))) discard;
      float n1 = vn(vW.xz * 0.35 + vec2(uTempo * 0.05, 0.0)) + 0.5 * vn(vW.xz * 1.3 - uTempo * 0.03);
      float n2 = vn(vW.zx * 0.35 + vec2(0.0, uTempo * 0.04)) + 0.5 * vn(vW.zx * 1.2 + 13.0);
      vec4 uv = vUv; uv.xy += (vec2(n1, n2) - 0.75) * 0.007 * uv.w;
      float b = 0.004 * uv.w;
      vec3 c = texture2DProj(tDiffuse, uv).rgb * 0.36
        + texture2DProj(tDiffuse, uv + vec4(b, 0, 0, 0)).rgb * 0.16 + texture2DProj(tDiffuse, uv - vec4(b, 0, 0, 0)).rgb * 0.16
        + texture2DProj(tDiffuse, uv + vec4(0, b * 2.0, 0, 0)).rgb * 0.16 + texture2DProj(tDiffuse, uv - vec4(0, b * 2.0, 0, 0)).rgb * 0.16;
      vec3 v = normalize(cameraPosition - vW);
      float fr = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
      float dist = length(cameraPosition.xz - vW.xz);
      float a = uForza * mix(0.35, 0.78, fr) * (1.0 - smoothstep(180.0, 520.0, dist)) * (0.75 + 0.25 * n1);
      gl_FragColor = vec4(c * 0.92 + uTinta, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
export function creaSuolo(renderer) {
  const pr = renderer.getPixelRatio();
  const suolo = new Reflector(new THREE.PlaneGeometry(1200, 1200), {
    shader: suoloShader, clipBias: 0.003, multisample: 0,
    textureWidth: Math.round(innerWidth * pr * 0.5), textureHeight: Math.round(innerHeight * pr * 0.5),
  });
  suolo.rotation.x = -Math.PI / 2; suolo.position.y = 0.02;
  Object.assign(suolo.material, { transparent: true, depthWrite: false });
  suolo.renderOrder = 1;
  suolo.ridimensiona = () => suolo.getRenderTarget().setSize(Math.round(innerWidth * pr * 0.5), Math.round(innerHeight * pr * 0.5));
  return suolo;
}

// ------------------------------------------------------------------ passaggio giorno / sera / notte sui materiali
export function ambienteMateriali(nome, envTex) {
  uKInt.value = nome === 'giorno' ? 0.25 : nome === 'sera' ? 0.8 : 1;
  ambienteAttuale = nome;
  for (const m of variabili) applicaAmbiente(m, nome);
  return envTex;
}
function applicaAmbiente(m, nome) {
  const u = m.userData;
  if (u.lum) { m.emissiveIntensity = u.emiBase * K_LUMINOSI[nome]; return; }
  if (!u.tab) return;
  const s = nome === 'giorno' ? u.giorno : u.notte;
  m.color.copy(s.c); m.roughness = s.r;
  if (u.tab.emiK) m.emissiveIntensity = u.tab.emiK[nome];
}
