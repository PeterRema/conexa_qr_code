// Conexa Hotel – gemello digitale web (three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { creaArredi } from './arredi.js';
import { rifinisciMateriale, aggiornaFinestre, cieloShader, creaAmbiente, creaSuolo, ambienteMateriali } from './look.js';

const $ = s => document.querySelector(s);
// parametri: ?camera=105 inquadra la camera all'avvio, ?demo=1 nasconde i pannelli (vista incorporata in Conexa Room), ?ora=giorno|sera|notte
const PAR = new URLSearchParams(location.search);
if (PAR.get('demo') === '1') document.body.classList.add('demo');
const CFG = await (await fetch('config/twin_config.json')).json();
const CIRC = CFG.circuiti;
const Q = CFG.quote;
const S = { circuiti: {}, lamelle: {}, dmx: 1, livelli: { ...CFG.livelli_iniziali }, camere: {} };
for (const id in CIRC) S.circuiti[id] = 0;
for (const c in CFG.lamelle) S.lamelle[c] = { pos: 0, ori: 0 };

const TAGLIABILI = new Set(['Architettura', 'Interni', 'KNX', 'Lamelle', 'Neon', 'Meccanico', 'Elettrico', 'Antincendio']);
const COL_LIVELLO = { Architettura: '#C9C2B5', Interni: '#A89F92', Luci: '#F4B740', Neon: '#FF2D4B', Lamelle: '#8FD3FF', KNX: '#3D7BF2', Esterni: '#7FA36B', Meccanico: '#5BC0DE', Elettrico: '#F0C419', Antincendio: '#E8463A' };
const perLivello = Object.fromEntries(CFG.livelli.map(l => [l, []]));

// ------------------------------------------------------------------ rendering
const qualita = localStorage.getItem('cx-qualita') || 'bilanciata';
$('#sel-qualita').value = qualita;
const renderer = new THREE.WebGLRenderer({ antialias: qualita !== 'leggera', powerPreference: 'high-performance' });
renderer.setPixelRatio(qualita === 'leggera' ? 0.75 : qualita === 'alta' ? Math.min(devicePixelRatio, 2) : 1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // neon più saturi di AgX, come nei render Unreal
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = qualita !== 'leggera';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#vista').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 5000);
camera.position.set(...CFG.viste[0].p);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...CFG.viste[0].t);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.4, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const usaBloom = qualita !== 'leggera';

const cieloMat = new THREE.ShaderMaterial({ ...cieloShader, side: THREE.BackSide, depthWrite: false, fog: false });
const aggiornaEnv = creaAmbiente(renderer, cieloMat);
const suolo = qualita !== 'leggera' ? creaSuolo(renderer) : null;
if (suolo) {
  scene.add(suolo);
  const rifletti = suolo.onBeforeRender;    // le stelle non si specchiano: nel riflesso sfocato diventerebbero croci
  suolo.onBeforeRender = function (...a) { const s = cieloMat.uniforms.stelle.value; cieloMat.uniforms.stelle.value = 0; rifletti.apply(this, a); cieloMat.uniforms.stelle.value = s; };
}
scene.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), cieloMat), { renderOrder: -1 }));
scene.fog = new THREE.Fog(0x000000, 250, 3600);
const emi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const sole = new THREE.DirectionalLight(0xffffff, 3);
const centro = new THREE.Vector3(19, 0, -14);
sole.position.copy(new THREE.Vector3(...CFG.sole).normalize()).multiplyScalar(150).add(centro);
sole.target.position.copy(centro);
sole.castShadow = qualita !== 'leggera';
Object.assign(sole.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 });
sole.shadow.mapSize.setScalar(qualita === 'alta' ? 2048 : 1024); sole.shadow.bias = -0.0008; sole.shadow.normalBias = 0.04;
scene.add(emi, sole, sole.target);

const taglio = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
const piani = [taglio];

// ------------------------------------------------------------------ luci (pozze + bagliori + poche luci reali)
function coloreKelvin(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color(...[r, g, b].map(v => Math.min(255, Math.max(0, v)) / 255));
}
function texRadiale(dim, stops) {
  const c = document.createElement('canvas'); c.width = c.height = dim;
  const g = c.getContext('2d'), gr = g.createRadialGradient(dim / 2, dim / 2, 0, dim / 2, dim / 2, dim / 2);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, dim, dim);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const livelloDaY = y => y < -0.2 ? 'INT' : y < Q.P1 ? 'PT' : y < Q.P2 ? 'P1' : 'P2';
const luci = CFG.luci.map(l => {
  const pos = new THREE.Vector3(...l.p), dir = new THREE.Vector3(...l.d);
  const est = CIRC[l.c].zone === 'EST' && CIRC[l.c].spazio == null;
  return { ...l, pos, dir, est, pavimento: est ? null : Q[livelloDaY(pos.y)], col: coloreKelvin(l.k), raggioPozza: 1, fattore: 1, pozzaPos: null };
});
const perCircuito = {};
luci.forEach((l, i) => (perCircuito[l.c] ||= []).push(i));
function calcolaPozza(l, yPav) {
  const h = Math.max(0.2, l.pos.y - yPav);
  const r = THREE.MathUtils.clamp(h * (l.lm < 120 ? 0.45 : l.t === 'point' ? 0.6 : 0.85), 0.35, l.r * 0.65);
  l.raggioPozza = r; l.fattore = THREE.MathUtils.clamp(Math.sqrt(l.lm / (Math.PI * r * r) / 120), 0.2, 1.1);
  l.pozzaPos = new THREE.Vector3(l.pos.x, yPav + 0.03, l.pos.z);
}
for (const l of luci) if (l.pavimento !== null) calcolaPozza(l, l.pavimento);

const pozze = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: texRadiale(128, [[0, 1], [0.35, 0.55], [0.7, 0.15], [1, 0]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clippingPlanes: piani, polygonOffset: true, polygonOffsetFactor: -2, fog: false }),
  luci.length);
pozze.frustumCulled = false; pozze.renderOrder = 2;
pozze.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(luci.length * 3), 3);
const _m = new THREE.Matrix4();
function matricePozza(i) {
  const l = luci[i];
  if (!l.pozzaPos) _m.makeScale(0, 0, 0); else _m.makeScale(l.raggioPozza * 2, 1, l.raggioPozza * 2).setPosition(l.pozzaPos);
  pozze.setMatrixAt(i, _m);
}
luci.forEach((_, i) => matricePozza(i));
scene.add(pozze);

const texPunto = texRadiale(64, [[0, 1], [0.2, 0.9], [0.5, 0.25], [1, 0]]);
function nuvola(filtro, dim) {
  const idx = luci.map((l, i) => filtro(l) ? i : -1).filter(i => i >= 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap(i => luci[i].pos.toArray()), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(idx.length * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: dim, map: texPunto, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clippingPlanes: piani, fog: false }));
  // da vicino (dentro gli ambienti) i bagliori non devono riempire lo schermo: dimensione limitata e dissolvenza
  p.material.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vVic;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  gl_PointSize = min(gl_PointSize, 48.0);\n  vVic = smoothstep(2.0, 7.0, -mvPosition.z);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vVic;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vVic;');
  };
  p.frustumCulled = false; p.renderOrder = 3; scene.add(p);
  return { punti: p, idx };
}
const nuvole = [nuvola(l => !l.est, 0.4), nuvola(l => l.est, 0.7)];
const inNuvola = new Map();
nuvole.forEach((n, ni) => n.idx.forEach((li, k) => inNuvola.set(li, [ni, k])));

const N_REALI = qualita === 'leggera' ? 4 : 8;
const reali = Array.from({ length: N_REALI }, () => { const p = new THREE.SpotLight(0xffffff, 0, 8, 1, 0.7, 2); scene.add(p, p.target); return p; });
perLivello.Luci.push(pozze, ...nuvole.map(n => n.punti), ...reali);

const AMBIENTI = {
  giorno: { alto: 0x2f6fc9, orizzonte: 0xd6e6f2, basso: 0x8d9a8a, alone: 0x000000, stelle: 0, emi: [0xdfefff, 0x6b6150, 1.1], sole: [0xfff1dc, 3.4], esp: 1.0, nebbia: 0xc9dbea, luci: 0.15, neon: 0.35, suolo: 0, bloom: [0.12, 0.3, 0.92], envNeon: 0, envCaldo: 0.15, envK: 1.0 },
  sera: { alto: 0x16245e, orizzonte: 0xc86a62, basso: 0x1c1626, alone: 0x4a1a0a, stelle: 0.25, emi: [0x9a8ad0, 0x40302a, 0.45], sole: [0xff9a5a, 1.3], esp: 1.15, nebbia: 0x5a3a60, luci: 0.65, neon: 0.85, suolo: 0.55, bloom: [0.55, 0.45, 0.85], envNeon: 0.5, envCaldo: 0.12, envK: 0.9 },
  notte: { alto: 0x050b2e, orizzonte: 0x3e1a54, basso: 0x07070f, alone: 0x2c0c32, stelle: 1, emi: [0x5a5ab0, 0x120e18, 0.32], sole: [0x8fa6ff, 0.35], esp: 1.3, nebbia: 0x1c1030, luci: 1, neon: 1, suolo: 0.85, bloom: [0.75, 0.5, 0.8], envNeon: 1, envCaldo: 0.08, envK: 1.0 },
};
let ambiente = 'notte';
function impostaAmbiente(nome) {
  ambiente = nome; const a = AMBIENTI[nome];
  const U = cieloMat.uniforms;
  U.alto.value.set(a.alto); U.orizzonte.value.set(a.orizzonte); U.basso.value.set(a.basso); U.alone.value.set(a.alone); U.stelle.value = a.stelle;
  scene.environment = aggiornaEnv(a.envNeon, a.envCaldo); scene.environmentIntensity = a.envK;
  ambienteMateriali(nome);
  if (suolo) suolo.material.uniforms.uForza.value = a.suolo;
  emi.color.set(a.emi[0]); emi.groundColor.set(a.emi[1]); emi.intensity = a.emi[2];
  sole.color.set(a.sole[0]); sole.intensity = a.sole[1];
  scene.fog.color.set(a.nebbia); renderer.toneMappingExposure = a.esp;
  [bloom.strength, bloom.radius, bloom.threshold] = a.bloom;
  document.querySelectorAll('[data-ora]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ora === nome));
  aggiornaLuci();
}

// luce degli interni (look.js): ogni apparecchio illumina solo il proprio ambiente, e quello del bagno solo il bagno;
// i LED d'arredo seguono il proprio circuito (lettura, cortesia, generale/bagno)
let camereArredi = [], zoneLuci = null;
const dentro = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const areaR = r => (r[2] - r[0]) * (r[3] - r[1]);
function calcolaZone() {
  const bagno = Object.fromEntries(camereArredi.map(c => [`${c.liv}:${c.num}`, c.bagno]));
  zoneLuci = luci.map(l => {
    if (l.est) return null;
    const liv = livelloDaY(l.pos.y), x = l.pos.x, y = -l.pos.z;
    const sp = CFG.spazi.filter(s => s.liv === liv && dentro(s.rect, x, y)).sort((a, b) => areaR(a.rect) - areaR(b.rect))[0];
    if (!sp) return null;
    const fn = CIRC[l.c].funzione, bg = sp.tipo === 'camera' ? bagno[`${sp.liv}:${sp.num}`] : null;
    const inBagno = !!bg && dentro(bg, x, y);
    const r = fn === 'LET' ? 1.4 : fn === 'COR' ? 1.6 : fn === 'BAG' ? 2.4 : fn === 'GEN' ? 3.2 : THREE.MathUtils.clamp(1.3 + Math.sqrt(l.lm) / 14, 1.5, 4);
    return { liv, r, w: THREE.MathUtils.clamp(Math.sqrt(l.lm / 600), 0.35, 1.2), clip: inBagno ? bg : sp.rect, excl: !inBagno && bg ? bg : null };
  });
}
function aggiornaLuciInterne() {
  if (!zoneLuci) calcolaZone();
  const bagno = Object.fromEntries(camereArredi.map(c => [`${c.liv}:${c.num}`, c.bagno]));
  const regioni = [], sorgenti = [];
  for (const sp of CFG.spazi) {
    if (!sp.circuiti.length) continue;
    if (sp.tipo === 'camera') {
      const f = fn => Math.max(0, ...sp.circuiti.filter(id => CIRC[id].funzione === fn).map(id => (S.circuiti[id] || 0) / 100));
      regioni.push({ liv: sp.liv, rect: sp.rect, a: f('GEN'), g: f('LET'), b: f('COR') });
      const bg = bagno[`${sp.liv}:${sp.num}`];
      if (bg) regioni.push({ liv: sp.liv, rect: bg, a: f('BAG'), g: 0, b: 0 });
    } else regioni.push({ liv: sp.liv, rect: sp.rect, a: livSpazio(sp) / 100, g: 0, b: 0 });
  }
  luci.forEach((l, i) => {
    const z = zoneLuci[i], v = (S.circuiti[l.c] || 0) / 100;
    if (z && v > 0) sorgenti.push({ liv: z.liv, x: l.pos.x, y: -l.pos.z, k: v * z.w, r: z.r, clip: z.clip, excl: z.excl });
  });
  aggiornaFinestre(regioni, sorgenti, Q);
}

const _c = new THREE.Color();
let realiSporche = true;
function aggiornaLuci(solo) {
  const k = AMBIENTI[ambiente].luci;
  const lista = solo ? solo.flatMap(c => perCircuito[c] || []) : luci.map((_, i) => i);
  for (const i of lista) {
    const l = luci[i], liv = (S.circuiti[l.c] || 0) / 100;
    _c.copy(l.col).multiplyScalar(liv * l.fattore * k * (l.est ? 0.06 : 0.1));   // negli interni la luce la fanno anche arredi e pareti (look.js)
    pozze.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    const [ni, kk] = inNuvola.get(i);
    _c.copy(l.col).multiplyScalar(liv > 0 ? (0.35 + liv * 0.9) * (0.4 + 0.6 * k) : 0);
    nuvole[ni].punti.geometry.attributes.color.setXYZ(kk, _c.r, _c.g, _c.b);
  }
  pozze.instanceColor.needsUpdate = true;
  aggiornaLuciInterne();
  nuvole.forEach(n => n.punti.geometry.attributes.color.needsUpdate = true);
  realiSporche = true;
}
let ultimoAssegno = 0;
const _v = new THREE.Vector3();
function assegnaLuciReali(t) {
  if (!realiSporche && t - ultimoAssegno < 400) return;
  realiSporche = false; ultimoAssegno = t;
  const k = AMBIENTI[ambiente].luci, attive = S.livelli.Luci;
  const cand = [];
  for (const l of luci) {
    const liv = S.circuiti[l.c] || 0;
    if (!liv || l.lm < 120 || l.dir.y > 0.3) continue;   // niente luci reali per gli uplight: brucerebbero chiome e facciate
    if (taglio.constant < 1e4 && l.pos.y > taglio.constant) continue;
    cand.push([l.lm * liv / (_v.copy(l.pos).sub(camera.position).lengthSq() + 25), l]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  reali.forEach((p, i) => {
    const c = cand[i];
    if (!c || k < 0.3 || !attive) { p.intensity = 0; return; }
    const l = c[1];
    p.position.copy(l.pos).addScaledVector(l.dir, 0.05);
    p.target.position.copy(l.pos).addScaledVector(l.dir, 3);
    p.angle = l.t === 'point' ? 1.45 : 0.85;
    p.color.copy(l.col); p.distance = l.r * 1.3;
    p.intensity = (l.lm / (2 * Math.PI * (1 - Math.cos(p.angle)))) * (S.circuiti[l.c] / 100) * k * (l.est ? 0.12 : 0.08);
  });
}

// ------------------------------------------------------------------ neon DMX (shader non illuminato, animato)
const COL_NEON = { neon_rosso: [1, 0.06, 0.12], neon_blu: [0.12, 0.3, 1], neon_bianco: [0.95, 0.95, 1], led_caldo: [1, 0.72, 0.42] };
const patch = {}; CFG.neon.forEach((n, i) => { patch[n.oggetto] ??= { ...n, ordine: i }; });
const neonMats = [];
const uNeon = { uScena: { value: 1 }, uTempo: { value: 0 }, uGuadagno: { value: 1 } };
function materialeNeon(nome, colBase) {
  const p = patch[nome];
  const col = p ? COL_NEON[p.colore] || colBase : colBase;
  const torre = /TORRE|CIRC/.test(nome) ? 1 : 0;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...uNeon, uCol: { value: new THREE.Color(...col) }, uFase: { value: p ? p.ordine : 0 }, uTorre: { value: torre } },
    clippingPlanes: piani, clipping: true,
    vertexShader: `
      attribute float aLungo;
      varying float vL;
      #include <clipping_planes_pars_vertex>
      void main() {
        vL = aLungo;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uCol;
      uniform float uScena, uTempo, uFase, uTorre, uGuadagno;
      varying float vL;
      #include <clipping_planes_pars_fragment>
      vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        #include <clipping_planes_fragment>
        float s = uScena; float k = 1.0; vec3 c = uCol;
        if (s < 0.5) k = 0.0;
        else if (s < 1.5) k = 1.0;
        else if (s < 2.5) k = 0.55 + 0.45 * sin(uTempo * 0.9 - uFase * 0.12);
        else if (s < 3.5) k = uTorre > 0.5 ? 0.12 + 1.1 * pow(max(0.0, sin(vL * 0.9 - uTempo * 5.0 + uFase)), 8.0) : 0.35;
        else if (s < 4.5) { c = mix(uCol, hsv(fract(uTempo * 0.08 + vL * 0.02 + uFase * 0.03)), 0.75); k = 0.8 + 0.25 * sin(uTempo * 3.0 + vL * 0.5); }
        else k = 0.3;
        vec3 outc = k > 0.001 ? c * 1.5 * uGuadagno * k : vec3(0.035, 0.035, 0.04);
        gl_FragColor = vec4(outc, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  m.toneMapped = true;
  neonMats.push(m);
  return m;
}
function aggiungiLungo(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, d = new THREE.Vector3().subVectors(b.max, b.min);
  const asse = d.x >= d.y && d.x >= d.z ? 'x' : d.y >= d.z ? 'y' : 'z';
  const p = g.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = p['get' + asse.toUpperCase()](i) - b.min[asse];
  g.setAttribute('aLungo', new THREE.BufferAttribute(a, 1));
}

// ------------------------------------------------------------------ lamelle
const lamelleObj = {};      // camera -> { tipo, lame: [{mesh}], raffstore: mesh, att: {pos, ori} }
function registraLamella(o, ud) {
  const m = ud.nome.match(/^KNX_(\d{3})_LM\d+(?:_L(\d+))?$/);
  if (!m || !CFG.lamelle[m[1]]) return false;
  const cam = m[1], def = CFG.lamelle[cam];
  const L = lamelleObj[cam] ||= { tipo: def.tipo, lame: [], raffstore: null, att: { pos: 0, ori: 0 } };
  const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
  const mat = o.material.clone(); mat.clippingPlanes = piani;
  if (m[2]) {
    const piv = def.lamelle.find(x => x.nome === ud.nome)?.pivot;
    geo.computeBoundingBox();
    const pv = piv ? new THREE.Vector3(...piv) : geo.boundingBox.getCenter(new THREE.Vector3());
    pv.y = (geo.boundingBox.min.y + geo.boundingBox.max.y) / 2;
    geo.translate(-pv.x, -pv.y, -pv.z);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(pv);
    L.lame.push(mesh); scene.add(mesh); perLivello.Lamelle.push(mesh);
  } else if (def.tipo === 'raffstore') {
    geo.computeBoundingBox();
    const b = geo.boundingBox, top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    geo.translate(-top.x, -top.y, -top.z);
    mat.transparent = true;
    const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(top); mesh.userData.colBase = mat.color.clone();
    L.raffstore = mesh; scene.add(mesh); perLivello.Lamelle.push(mesh);
  } else return false;
  return true;
}
function animaLamelle(dt) {
  const v = Math.min(1, dt * 3);
  for (const [cam, L] of Object.entries(lamelleObj)) {
    const obb = S.lamelle[cam]; if (!obb) continue;
    L.att.pos += (obb.pos - L.att.pos) * v; L.att.ori += (obb.ori - L.att.ori) * v;
    for (const m of L.lame) m.rotation.y = -THREE.MathUtils.degToRad(L.att.ori * 0.9);
    if (L.raffstore) {
      L.raffstore.scale.y = Math.max(0.03, L.att.pos / 100);
      L.raffstore.material.opacity = 0.35 + 0.6 * (L.att.ori / 100);
    }
  }
}

// ------------------------------------------------------------------ caricamento
const draco = new DRACOLoader().setDecoderPath('lib/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const statici = [], dispositivi = [];
const progresso = (txt, f) => { $('#car-testo').textContent = txt; if (f !== undefined) $('#car-progr').style.width = `${Math.round(f * 100)}%`; };
function datiNodo(o) { let n = o; while (n) { if (n.userData?.livello) return n.userData; n = n.parent; } return {}; }
function normalizza(g, uv) {
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', ...(uv ? ['uv'] : [])].includes(a)) g.deleteAttribute(a);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  return g;
}
// icone dimostrative del render (fuoco, audio, termometro, camera smart, scudo e totem security): non sono elementi
// dell'edificio e nel gemello non servono. Restano il logo CONEXA HOTEL, il cartello di uscita e le telecamere.
const ESCLUSI = /^(ICONA_(AUDIO|CAMERA_SMART|INCENDIO_.*|TERMOMETRO|SCUDO)|TOTEM_SECURITY|NEON_ICONA_INCENDIO|NEON_TOTEM_SECURITY|ALA_[AE]_interni_camere|LOGGIA_interno|HALL_interno_fondo|HALL_divani|HALL_reception)$/;
// i volumi luminosi "finti" del render (interni camere, fondo hall, divani e reception provvisori) lasciano il posto agli arredi veri
async function caricaFile(file, i, n) {
  const gltf = await loader.loadAsync(`modello/${file}`, e => e.total && progresso(`Caricamento ${file}…`, (i + e.loaded / e.total) / n));
  gltf.scene.updateMatrixWorld(true);
  const gruppi = new Map();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const ud = datiNodo(o), liv = ud.livello || 'Architettura';
    if (ESCLUSI.test(ud.nome || o.name)) return;
    if (!perLivello[liv]) perLivello[liv] = [];
    if (liv === 'Neon') {
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld); aggiungiLungo(g);
      const m = new THREE.Mesh(g, materialeNeon(ud.nome, o.material.emissive ? o.material.emissive.toArray() : [1, 1, 1]));
      m.userData = { ...ud }; scene.add(m); perLivello.Neon.push(m); return;
    }
    o.material = rifinisciMateriale(o.material, liv);
    if (liv === 'Lamelle' && registraLamella(o, ud)) return;
    if (ud.knx_sigla) {
      const m = new THREE.Mesh(o.geometry, o.material.clone());
      m.applyMatrix4(o.matrixWorld); m.userData = { ...ud };
      m.material.clippingPlanes = piani;
      dispositivi.push(m); perLivello[liv].push(m); scene.add(m); return;
    }
    const key = `${liv}|${o.material.uuid}`;
    if (!gruppi.has(key)) gruppi.set(key, { liv, mat: o.material, geos: [] });
    gruppi.get(key).geos.push(normalizza(o.geometry.clone().applyMatrix4(o.matrixWorld), !!o.material.map));
  });
  for (const g of gruppi.values()) {
    const geo = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false);
    if (!geo) continue;
    if (TAGLIABILI.has(g.liv)) g.mat.clippingPlanes = piani;
    if (g.mat.transparent && g.mat.opacity < 0.6) g.mat.depthWrite = false;
    const m = new THREE.Mesh(geo, g.mat);
    m.userData = { livello: g.liv }; m.matrixAutoUpdate = false;
    m.castShadow = m.receiveShadow = !g.mat.transparent;
    statici.push(m); perLivello[g.liv].push(m); scene.add(m);
  }
}
// arredi generati da codice (arredi.js): un mesh per materiale, nel livello Interni
async function caricaArredi() {
  progresso('Arredo le camere…', 1);
  await new Promise(r => setTimeout(r, 20));
  let camere = [];
  try { camere = await (await fetch('config/arredi_camere.json', { cache: 'no-cache' })).json(); } catch { /* senza camere arreda solo i comuni */ }
  camereArredi = camere; zoneLuci = null;
  // posizione delle luci di lettura del progetto KNX: decidono su quale parete va la testata del letto
  const lettura = {};
  for (const l of luci) { const c = CIRC[l.c]; if (c.camera && c.funzione === 'LET') (lettura[c.camera] ||= []).push([l.pos.x, -l.pos.z]); }
  for (const { mat, geo } of creaArredi(CFG.spazi, camere, Q, lettura)) {
    const m = new THREE.Mesh(geo, rifinisciMateriale(new THREE.MeshStandardMaterial({ name: mat }), 'Interni'));
    m.material.clippingPlanes = piani;
    m.userData = { livello: 'Interni', arredo: true }; m.matrixAutoUpdate = false;
    m.receiveShadow = true;
    statici.push(m); perLivello.Interni.push(m); scene.add(m);
  }
}
async function caricaModello() {
  const ind = await (await fetch('modello/indice.json', { cache: 'no-cache' })).json();
  for (const [i, f] of ind.file.entries()) await caricaFile(f, i, ind.file.length);
  progresso('Posiziono le luci esterne…', 1);
  await new Promise(r => setTimeout(r, 20));
  const bersagli = statici.filter(m => m.userData.livello === 'Esterni' || m.userData.livello === 'Architettura');
  const rc = new THREE.Raycaster(); rc.far = 25;
  luci.forEach((l, i) => {
    if (!l.est) return;
    rc.set(l.pos.clone().addScaledVector(l.dir, 0.15), l.dir);
    const hit = rc.intersectObjects(bersagli, false)[0];
    calcolaPozza(l, hit ? hit.point.y : l.pos.y - 4); matricePozza(i);
  });
  pozze.instanceMatrix.needsUpdate = true;
  await caricaArredi();
  return ind;
}

// ------------------------------------------------------------------ livelli
function applicaLivelli() {
  for (const [l, objs] of Object.entries(perLivello)) for (const o of objs) o.visible = !!S.livelli[l];
  document.querySelectorAll('#strati input').forEach(i => { i.checked = !!S.livelli[i.dataset.l]; });
  realiSporche = true;
}
function costruisciLivelli() {
  const box = $('#strati'); box.innerHTML = '';
  for (const l of CFG.livelli) {
    const presente = perLivello[l]?.length > 0;
    const lab = document.createElement('label');
    lab.className = presente ? '' : 'assente';
    lab.title = presente ? '' : 'Non presente nel modello esportato';
    lab.innerHTML = `<input type="checkbox" data-l="${l}" ${presente ? '' : 'disabled'}><span class="campione" style="background:${COL_LIVELLO[l]}"></span>${l}`;
    lab.querySelector('input').addEventListener('change', e => {
      if (permessi.modifica) comanda(`livello/${l}/${e.target.checked}`);
      else { S.livelli[l] = e.target.checked; applicaLivelli(); }   // vista personale, non cambia lo stato condiviso
    });
    box.appendChild(lab);
  }
  applicaLivelli();
}

// ------------------------------------------------------------------ viste e taglio
CFG.viste.forEach((v, i) => $('#sel-vista').add(new Option(v.nome, i)));
$('#sel-vista').add(new Option('Libera', 'libera'));
let volo = null;
const volaA = (p, t, durata = 1100) => { volo = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), inizio: performance.now(), durata }; };
function vaiAVista(i) { const v = CFG.viste[i]; volaA(new THREE.Vector3(...v.p), new THREE.Vector3(...v.t)); impostaTaglio(v.taglio || ''); }
$('#sel-vista').addEventListener('change', e => { if (e.target.value !== 'libera') vaiAVista(+e.target.value); });
$('#sel-taglio').innerHTML = '<option value="">Nessuno</option><option value="INT">Interrato</option><option value="PT">Piano terra</option><option value="P1">Piano primo</option><option value="P2">Piano secondo</option>';
function impostaTaglio(p) { $('#sel-taglio').value = p || ''; taglio.constant = p ? Q[p] + 2.0 : 1e5; realiSporche = true; }
$('#sel-taglio').addEventListener('change', e => impostaTaglio(e.target.value));
document.querySelectorAll('[data-ora]').forEach(b => b.addEventListener('click', () => impostaAmbiente(b.dataset.ora)));
$('#sel-qualita').addEventListener('change', e => { localStorage.setItem('cx-qualita', e.target.value); location.reload(); });

// ------------------------------------------------------------------ pianta
let pianoAttivo = 'P1', spazioSel = null;
const NS = 'http://www.w3.org/2000/svg';
const lmCircuito = id => (perCircuito[id] || []).reduce((a, i) => a + luci[i].lm, 0) || 1;
const livSpazio = sp => { let s = 0, t = 0; for (const id of sp.circuiti) { const w = lmCircuito(id); s += w * S.circuiti[id]; t += w; } return t ? s / t : 0; };
const rampa = v => { const a = new THREE.Color('#2B3747'), b = new THREE.Color('#F4B740'), c = new THREE.Color('#FFE3A3'); return (v <= 60 ? a.lerp(b, v / 60) : b.lerp(c, (v - 60) / 40)).getStyle(); };
const chiave = sp => `${sp.liv}:${sp.num}`;
const centroCircuito = id => { const ii = perCircuito[id] || []; return ii.length ? ii.reduce((a, i) => a.add(luci[i].pos), new THREE.Vector3()).divideScalar(ii.length) : null; };
const ESTERNI = Object.keys(CIRC).filter(id => CIRC[id].zone === 'EST' && !CIRC[id].spazio);

function disegnaPianta() {
  const box = $('#pianta'); box.innerHTML = '';
  document.querySelectorAll('[data-piano]').forEach(b => b.setAttribute('aria-selected', b.dataset.piano === pianoAttivo));
  const svg = document.createElementNS(NS, 'svg');
  const add = (tag, attr, testo, padre = svg) => { const e = document.createElementNS(NS, tag); for (const k in attr) e.setAttribute(k, attr[k]); if (testo !== undefined) e.textContent = testo; padre.appendChild(e); return e; };
  if (pianoAttivo === 'EST') {
    svg.setAttribute('viewBox', '-2 -2 64 44');
    $('#nota-pianta').textContent = 'Tocca un circuito esterno.';
    ESTERNI.forEach((id, i) => {
      const x = 8 + (i % 3) * 22, y = 6 + Math.floor(i / 3) * 18;
      const c = add('circle', { class: 'stanza punto', 'data-circ': id, cx: x, cy: y, r: 4.2 });
      add('title', {}, CIRC[id].label, c);
      add('text', { x, y: y + 8, 'text-anchor': 'middle', fill: '#93A3B8', style: 'font-size:2.6px' }, CIRC[id].label.replace(/^Lampioni /, '').slice(0, 20));
    });
  } else {
    svg.setAttribute('viewBox', '-1 -2.2 40 31.5');
    $('#nota-pianta').textContent = pianoAttivo === 'INT' ? 'Interrato tecnico: tocca uno spazio.' : 'Tocca una camera o un ambiente per comandarlo e inquadrarlo.';
    add('text', { class: 'nord', x: 38, y: -0.8, 'text-anchor': 'end' }, 'N ↑');
    for (const sp of CFG.spazi.filter(s => s.liv === pianoAttivo)) {
      const [x0, y0, x1, y1] = sp.rect;
      const attivo = sp.circuiti.length > 0 || CFG.lamelle[sp.num];
      const r = add('rect', { x: x0 + .1, y: 28.5 - y1 + .1, width: Math.max(.2, x1 - x0 - .2), height: Math.max(.2, y1 - y0 - .2), rx: .25,
        class: attivo ? `stanza ${sp.tipo === 'camera' ? '' : 'comune'}` : 'fisso' });
      if (attivo) r.dataset.spazio = chiave(sp);
      add('title', {}, sp.nome, r);
      const lab = sp.tipo === 'camera' ? sp.num : (x1 - x0 > 3.5 && y1 - y0 > 1.8 ? sp.nome.split(/[ /]/)[0] : '');
      if (lab) add('text', { x: (x0 + x1) / 2, y: 28.5 - (y0 + y1) / 2 + .6, 'text-anchor': 'middle', 'data-testo': chiave(sp), fill: attivo ? '#E7EBF0' : '#6F7E92', style: sp.tipo === 'camera' ? '' : 'font-size:1.35px' }, lab);
    }
  }
  svg.addEventListener('click', e => {
    const t = e.target.closest('[data-spazio],[data-circ]'); if (!t) return;
    if (t.dataset.spazio) selezionaSpazio(t.dataset.spazio, true); else selezionaEsterno(t.dataset.circ);
  });
  box.appendChild(svg);
  coloraPianta();
}
function coloraPianta() {
  document.querySelectorAll('#pianta [data-spazio]').forEach(r => {
    const sp = CFG.spazi.find(s => chiave(s) === r.dataset.spazio), v = livSpazio(sp);
    r.style.fill = rampa(v); r.classList.toggle('sel', r.dataset.spazio === spazioSel);
    const t = document.querySelector(`#pianta [data-testo="${r.dataset.spazio}"]`); if (t) t.setAttribute('fill', v > 45 ? '#2A2210' : '#E7EBF0');
  });
  document.querySelectorAll('#pianta [data-circ]').forEach(c => { c.style.fill = rampa(S.circuiti[c.dataset.circ]); c.classList.toggle('sel', c.dataset.circ === spazioSel); });
}
document.querySelectorAll('[data-piano]').forEach(b => b.addEventListener('click', () => { pianoAttivo = b.dataset.piano; disegnaPianta(); }));

// ------------------------------------------------------------------ pannello di destra
const SCENE_CAMERA = [['CameraBenvenuto', 'Benvenuto'], ['CameraLettura', 'Lettura'], ['CameraNotte', 'Notte'], ['CameraOff', 'Spegni']];
function righeCircuiti(ids) {
  const ul = $('#circuiti'); ul.innerHTML = '';
  for (const id of ids) {
    const c = CIRC[id];
    const li = document.createElement('li'); li.className = 'circ'; li.dataset.id = id;
    const nome = c.camera ? ({ GEN: 'Luce generale', LET: 'Lettura', BAG: 'Bagno', COR: 'Cortesia LED' }[c.funzione] || c.label) : c.label;
    li.innerHTML = `<div class="riga"><span class="nome">${nome}</span><span class="val"></span><button class="interr" role="switch" aria-label="Accendi ${nome}"></button></div>
      <input type="range" min="0" max="100" step="1" aria-label="Livello ${nome}">
      <div class="meta">${id} · ${c.actuator} can. ${c.channel} · GA ${c.ga_proposta || '–'}</div>`;
    li.querySelector('.interr').addEventListener('click', () => comanda(`circuito/${id}/toggle`));
    const r = li.querySelector('input'); let tmr;
    r.addEventListener('input', () => { li.querySelector('.val').textContent = `${r.value}%`; clearTimeout(tmr); tmr = setTimeout(() => comanda(`circuito/${id}/${r.value}`), 120); });
    ul.appendChild(li);
  }
}
function pannelloLamelle(cam) {
  const box = $('#lamelle');
  const def = CFG.lamelle[cam];
  if (!def) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<h3>${def.tipo === 'raffstore' ? 'Raffstore' : 'Frangisole'}</h3>
    <div class="meta tenue" style="font-size:12px">${def.oggetto} · GA pos. ${def.ga_posizione} · or. ${def.ga_orientamento}</div>
    <div class="riga"><span>Posizione</span><span data-v="pos"></span></div><input type="range" min="0" max="100" data-k="posizione" aria-label="Posizione lamelle">
    <div class="riga"><span>Orientamento</span><span data-v="ori"></span></div><input type="range" min="0" max="100" data-k="orientamento" aria-label="Orientamento lamelle">
    <div class="preset"><button data-p="0,0">Aperte</button><button data-p="100,50">Ombra</button><button data-p="100,100">Chiuse</button></div>`;
  box.querySelectorAll('input').forEach(r => { let t; r.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => comanda(`lamelle/${cam}?${r.dataset.k}=${r.value}`), 120); }); });
  box.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { const [p, o] = b.dataset.p.split(','); comanda(`lamelle/${cam}?posizione=${p}&orientamento=${o}`); }));
}
// collegamento all'interfaccia Conexa Room della camera (nuova scheda; nascosto quando il gemello è incorporato in Conexa Room)
function linkRoom(cam) {
  if (!$('#stile-link-room')) document.head.insertAdjacentHTML('beforeend', `<style id="stile-link-room">
    #link-room{display:flex;align-items:center;justify-content:center;gap:8px;margin:10px 0 4px;padding:10px 12px;border-radius:10px;
      background:linear-gradient(135deg,#ff2d4b,#3d7bf2);color:#fff;font-weight:600;text-decoration:none;font-size:14px;
      box-shadow:0 2px 12px rgba(255,45,75,.25)}
    #link-room:hover{filter:brightness(1.12)}#link-room:focus-visible{outline:2px solid #fff;outline-offset:2px}
    #link-room svg{width:16px;height:16px;flex:none}</style>`);
  let a = $('#link-room');
  if (!a) { a = document.createElement('a'); a.id = 'link-room'; a.target = '_blank'; a.rel = 'noopener'; }
  a.href = `room.html?camera=${encodeURIComponent(cam)}&ora=${ambiente}`;
  a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></svg>Apri Conexa Room · camera ${cam}`;
  a.title = `Assistente vocale della camera ${cam} (si apre in una nuova scheda)`;
  return a;
}
// clima, sveglia, musica e porta della camera (Conexa Room / iLevia)
function pannelloCameraInfo(cam) {
  let box = $('#camera-info');
  if (!box) { box = document.createElement('div'); box.id = 'camera-info'; box.className = 'camera-info'; $('#lamelle').after(box); }
  box.dataset.cam = cam || '';
  box.hidden = !cam || !S.camere[cam];
}
function aggiornaCameraInfo() {
  const box = $('#camera-info'); if (!box || box.hidden) return;
  const r = S.camere[box.dataset.cam]; if (!r) return;
  const n = v => Number(v).toLocaleString('it-IT', { maximumFractionDigits: 1 });
  const d = r.setpoint - r.tamb, modo = Math.abs(d) < 0.25 ? 'in temperatura' : d > 0 ? 'riscalda' : 'raffresca';
  const righe = [
    ['Clima', `${n(r.tamb)} °C → ${n(r.setpoint)} °C (${modo})`],
    ['Sveglia', r.sveglia ? `${r.sveglia.ora}${r.sveglia.musica ? `, ${r.sveglia.genere} ${r.sveglia.volume}%` : ''}` : 'non impostata'],
    ['Musica', r.audio?.on ? `${r.audio.genere}, ${r.audio.volume}%` : 'spenta'],
    ['Porta', r.dnd ? 'non disturbare' : r.mur ? 'rifare la camera' : 'nessun avviso'],
  ];
  box.innerHTML = `<h3>Camera</h3>${righe.map(([k, v]) => `<div class="riga"><span>${k}</span><span>${v}</span></div>`).join('')}`;
}
function selezionaSpazio(key, inquadra) {
  const sp = CFG.spazi.find(s => chiave(s) === key); if (!sp) return;
  spazioSel = key; $('#dispositivo').hidden = true;
  const cam = sp.tipo === 'camera' ? sp.num : null;
  $('#zona-titolo').textContent = sp.nome;
  $('#zona-sotto').textContent = `${sp.circuiti.length} circuiti · ${{ INT: 'interrato', PT: 'piano terra', P1: 'piano primo', P2: 'piano secondo' }[sp.liv]}${cam && CFG.lamelle[cam] ? ` · ${CFG.lamelle[cam].tipo}` : ''}`;
  const sc = $('#zona-scene'); sc.hidden = false; sc.innerHTML = '';
  if (cam) for (const [f, n] of SCENE_CAMERA) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => comanda(`scena/${f}/${cam}`); sc.appendChild(b); }
  else for (const [v, n] of [[100, 'Accendi'], [30, 'Ridotto 30%'], [0, 'Spegni']]) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => comanda(`spazio/${encodeURIComponent(key)}/${v}`); sc.appendChild(b); }
  if (cam && !document.body.classList.contains('demo')) sc.after(linkRoom(cam)); else $('#link-room')?.remove();
  righeCircuiti(sp.circuiti);
  pannelloLamelle(cam);
  pannelloCameraInfo(cam);
  aggiornaPannello(); coloraPianta();
  if (!inquadra) return;
  const [x0, y0, x1, y1] = sp.rect, q = Q[sp.liv];
  const t = new THREE.Vector3((x0 + x1) / 2, q + 0.8, -(y0 + y1) / 2);
  impostaTaglio(sp.liv);
  const dim = Math.max(x1 - x0, y1 - y0);
  volaA(t.clone().add(new THREE.Vector3(-dim * 0.35, 6 + dim * 0.9, dim * 0.7 + 3)), t);
  $('#sel-vista').value = 'libera';
}
function selezionaEsterno(id) {
  spazioSel = id; $('#dispositivo').hidden = true;
  $('#zona-titolo').textContent = CIRC[id].label; $('#zona-sotto').textContent = 'Esterni';
  const sc = $('#zona-scene'); sc.hidden = true;
  $('#link-room')?.remove();
  righeCircuiti([id]); pannelloLamelle(null); pannelloCameraInfo(null); aggiornaPannello(); coloraPianta();
  const c = centroCircuito(id); if (c) { impostaTaglio(''); volaA(c.clone().add(new THREE.Vector3(-18, 22, 26)), c); }
}
function aggiornaPannello() {
  aggiornaCameraInfo();
  document.querySelectorAll('#circuiti .circ').forEach(li => {
    const v = S.circuiti[li.dataset.id];
    li.classList.toggle('on', v > 0);
    li.querySelector('.val').textContent = v > 0 ? `${v}%` : 'spento';
    li.querySelector('.interr').setAttribute('aria-checked', v > 0);
    const r = li.querySelector('input'); if (document.activeElement !== r) r.value = v;
  });
  const box = $('#lamelle');
  if (!box.hidden) {
    const cam = spazioSel?.split(':')[1], l = S.lamelle[cam]; if (!l) return;
    box.querySelector('[data-v=pos]').textContent = `${l.pos}%`; box.querySelector('[data-v=ori]').textContent = `${l.ori}%`;
    box.querySelectorAll('input').forEach(r => { if (document.activeElement !== r) r.value = r.dataset.k === 'posizione' ? l.pos : l.ori; });
  }
}
function aggiornaDmx() {
  const box = $('#scene-dmx');
  if (!box.children.length) {
    for (const [n, nome] of Object.entries(CFG.scene_dmx).sort((a, b) => (a[0] === '0') - (b[0] === '0') || a[0] - b[0])) {
      const b = document.createElement('button'); b.setAttribute('role', 'radio'); b.dataset.dmx = n;
      b.innerHTML = `<span class="n">${n}</span>${nome}`; b.onclick = () => comanda(`dmx/${n}`); box.appendChild(b);
    }
  }
  box.querySelectorAll('[data-dmx]').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.dmx) === S.dmx));
  uNeon.uScena.value = S.dmx;
}
document.querySelectorAll('[data-hotel]').forEach(b => b.addEventListener('click', () => comanda(`scena/${b.dataset.hotel}`)));

// ------------------------------------------------------------------ accesso
let permessi = { modifica: false, modalita: 'protetto', login: false };
let token = localStorage.getItem('cx-token') || '';
const intestazioni = () => ({ 'X-Twin-Fonte': 'UI', ...(token ? { 'X-Twin-Token': token } : {}) });
let tAvviso;
function avviso(t) { const a = $('#avviso'); a.textContent = t; a.hidden = false; clearTimeout(tAvviso); tAvviso = setTimeout(() => { a.hidden = true; }, 3500); }
async function aggiornaPermessi() {
  try { permessi = await (await fetch('api/permessi', { headers: intestazioni() })).json(); } catch { return; }
  if (token && !permessi.utente) { token = ''; localStorage.removeItem('cx-token'); }
  document.body.classList.toggle('sola-lettura', !permessi.modifica);
  const r = $('#ruolo');
  r.dataset.modifica = permessi.modifica;
  r.textContent = permessi.utente ? `${permessi.utente} · può comandare` : permessi.modifica ? (permessi.modalita === 'aperto' ? 'Comandi aperti a tutti' : 'Può comandare') : 'Sola visualizzazione';
  $('#btn-accedi').hidden = !permessi.login && !permessi.utente;
  $('#btn-accedi').textContent = permessi.utente ? 'Esci' : 'Accedi';
  $('#admin-aperto').hidden = !permessi.utente;
  $('#admin-aperto input').checked = permessi.modalita === 'aperto';
}
$('#btn-accedi').addEventListener('click', async () => {
  if (permessi.utente) { await fetch('api/logout', { method: 'POST', headers: intestazioni() }); token = ''; localStorage.removeItem('cx-token'); return aggiornaPermessi(); }
  $('#login-errore').textContent = ''; $('#form-login').reset(); $('#dlg-login').showModal();
});
$('#login-annulla').addEventListener('click', () => $('#dlg-login').close());
$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-errore').textContent = 'Verifica in corso…';
  let r, j;
  try {
    r = await fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utente: String(f.get('utente')).trim(), password: String(f.get('password')) }) });
    j = await r.json();
  } catch { $('#login-errore').textContent = 'Server non raggiungibile, riprovare.'; return; }
  if (!r.ok) { $('#login-errore').textContent = j.errorMessage || `Errore ${r.status}`; return; }
  token = j.token; localStorage.setItem('cx-token', token);
  $('#dlg-login').close(); aggiornaPermessi();
});
$('#admin-aperto input').addEventListener('change', async e => {
  const r = await fetch(`api/modalita/${e.target.checked ? 'aperto' : 'protetto'}`, { method: 'POST', headers: intestazioni() });
  if (!r.ok) avviso((await r.json()).errorMessage);
  aggiornaPermessi();
});

async function comanda(percorso) {
  if (!permessi.modifica) { avviso(permessi.login ? 'Sola visualizzazione: accedi per comandare.' : 'Sola visualizzazione.'); aggiornaPannello(); return; }
  try {
    const r = await fetch(`api/${percorso}`, { method: 'POST', headers: intestazioni() });
    if (!r.ok) { avviso((await r.json()).errorMessage); if (r.status === 401) aggiornaPermessi(); aggiornaPannello(); }
  } catch { /* il LED di connessione segnala il problema */ }
}

// ------------------------------------------------------------------ selezione 3D
const rc = new THREE.Raycaster(), ptr = new THREE.Vector2();
let giu = null, evidenziato = null;
renderer.domElement.addEventListener('pointerdown', e => { giu = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 5) return;
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  rc.setFromCamera(ptr, camera);
  const ok = h => !(taglio.constant < 1e4 && h.point.y > taglio.constant);
  const d = rc.intersectObjects(dispositivi.filter(x => x.visible), false).filter(ok)[0];
  if (d) return mostraDispositivo(d.object);
  const s = rc.intersectObjects(statici.filter(x => x.visible), false).filter(ok)[0];
  if (!s) return;
  const p = s.point, bx = p.x, by = -p.z, liv = livelloDaY(p.y + 0.3);
  const sp = CFG.spazi.filter(x => x.liv === liv && (x.circuiti.length || CFG.lamelle[x.num]) && bx >= x.rect[0] && bx <= x.rect[2] && by >= x.rect[1] && by <= x.rect[3])
    .sort((a, b) => (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]) - (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]))[0];
  if (sp) { pianoAttivo = sp.liv; disegnaPianta(); selezionaSpazio(chiave(sp), false); }
});
function mostraDispositivo(m) {
  if (evidenziato) evidenziato.material.emissive.setRGB(0, 0, 0);
  m.material.emissive = new THREE.Color('#8FD3FF'); m.material.emissiveIntensity = 0.8; evidenziato = m;
  const u = m.userData;
  $('#dispositivo').hidden = false;
  $('#disp-titolo').textContent = u.knx_sigla;
  const linea = u.knx_linea ? `${u.knx_linea}${CFG.linee[u.knx_linea] ? ` – ${CFG.linee[u.knx_linea]}` : ''}` : '';
  const righe = [['Descrizione', u.knx_descrizione], ['Categoria', u.knx_categoria], ['Camera', u.knx_camera], ['Linea', linea], ['Ind. fisico', u.knx_ind_fisico_proposta && `${u.knx_ind_fisico_proposta} (proposta)`], ['Oggetto', u.nome]];
  $('#disp-dati').innerHTML = righe.filter(r => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  if (u.knx_camera) { const sp = CFG.spazi.find(s => s.num === u.knx_camera); if (sp) { selezionaSpazio(chiave(sp), false); $('#dispositivo').hidden = false; } }
}

// ------------------------------------------------------------------ eventi dal server
function registra(ev) {
  const li = document.createElement('li'); li.className = 'nuovo';
  const chi = ev.chi || (ev.fonte === 'UI' ? 'Pannello' : 'HTTP');
  li.innerHTML = `<span class="ora">${new Date(ev.ts).toLocaleTimeString('it-IT')}</span><span><span class="fonte ${ev.fonte === 'UI' ? 'ui' : ''}">${chi}</span> ${ev.descr.replace(/[<>]/g, '')}</span>`;
  const ol = $('#registro'); ol.prepend(li); while (ol.children.length > 40) ol.lastChild.remove();
}
function collega() {
  const es = new EventSource('api/eventi'), led = $('#connessione');
  es.onopen = () => { aggiornaPermessi(); led.dataset.stato = 'on'; led.querySelector('.txt').textContent = `In ascolto su ${location.host}`; };
  es.onerror = () => { led.dataset.stato = 'off'; led.querySelector('.txt').textContent = 'Server non raggiungibile, nuovo tentativo…'; };
  es.onmessage = m => {
    const ev = JSON.parse(m.data);
    if (ev.tipo === 'iniziale') { Object.assign(S.circuiti, ev.circuiti); Object.assign(S.lamelle, ev.lamelle); S.dmx = ev.dmx; Object.assign(S.livelli, ev.livelli); S.camere = ev.camere || {}; aggiornaLuci(); applicaLivelli(); pannelloCameraInfo($('#camera-info')?.dataset.cam || null); }
    else if (ev.tipo === 'camere') { Object.assign(S.camere, ev.camere); aggiornaCameraInfo(); return; }
    else if (ev.tipo === 'sveglia') { if (ev.fase === 'inizio' && !document.body.classList.contains('demo')) avviso(`Sveglia in corso nella camera ${ev.camera}`); return; }
    else if (ev.tipo === 'permessi') { aggiornaPermessi(); avviso(ev.modalita === 'aperto' ? 'Comandi aperti a tutti.' : 'Comandi riservati agli utenti autorizzati.'); return; }
    else if (ev.tipo === 'stato') {
      Object.assign(S.circuiti, ev.cambi);
      if (ev.lamelle) for (const [c, v] of Object.entries(ev.lamelle)) S.lamelle[c] = v;
      if (ev.dmx !== undefined) S.dmx = ev.dmx;
      if (ev.camere) Object.assign(S.camere, ev.camere);
      if (ev.livelli) { Object.assign(S.livelli, ev.livelli); applicaLivelli(); }
      aggiornaLuci(Object.keys(ev.cambi)); registra(ev);
    }
    aggiornaPannello(); coloraPianta(); aggiornaDmx();
  };
}

// ------------------------------------------------------------------ ciclo
let frame = 0, tFps = performance.now(), tPrec = performance.now();
function ciclo(t) {
  const dt = Math.min(0.1, (t - tPrec) / 1000); tPrec = t;
  if (volo) {
    const k = Math.min(1, (t - volo.inizio) / volo.durata), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(volo.p0, volo.p1, e); controls.target.lerpVectors(volo.t0, volo.t1, e);
    if (k >= 1) volo = null; realiSporche = true;
  }
  controls.update();
  uNeon.uTempo.value = t / 1000;
  uNeon.uGuadagno.value = AMBIENTI[ambiente].neon;
  animaLamelle(dt);
  if (suolo) {
    suolo.visible = AMBIENTI[ambiente].suolo > 0 && !!S.livelli.Esterni && $('#sel-taglio').value !== 'INT';
    suolo.material.uniforms.uTempo.value = t / 1000;
  }
  assegnaLuciReali(t);
  if (usaBloom && ambiente !== 'giorno') composer.render(); else renderer.render(scene, camera);
  frame++;
  if (t - tFps > 1000) { $('#fps').textContent = `${Math.round(frame * 1000 / (t - tFps))} fps`; frame = 0; tFps = t; }
  requestAnimationFrame(ciclo);
}
controls.addEventListener('change', () => { if (!volo) $('#sel-vista').value = 'libera'; realiSporche = true; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); suolo?.ridimensiona(); });
$('#apri-pannelli').addEventListener('click', e => {
  const a = document.body.classList.toggle('pannelli-aperti');
  e.target.setAttribute('aria-expanded', a); e.target.textContent = a ? 'Chiudi' : 'Comandi';
});

// ------------------------------------------------------------------ avvio
impostaAmbiente(['giorno', 'sera', 'notte'].includes(PAR.get('ora')) ? PAR.get('ora') : 'notte');
disegnaPianta(); aggiornaDmx();
await aggiornaPermessi();
collega();
requestAnimationFrame(ciclo);
try {
  const ind = await caricaModello();
  costruisciLivelli(); aggiornaLuci();
  $('#caricamento').hidden = true;
  $('#sel-vista').value = 0;
  if (ind.nota) console.info(ind.nota);
  inquadraCameraIniziale();
} catch (e) {
  console.error(e);
  $('#caricamento').classList.add('errore');
  progresso(`Modello non caricato: ${e.message}`);
  costruisciLivelli();
}
function inquadraCameraIniziale() {
  const sp = PAR.get('camera') && CFG.spazi.find(s => s.tipo === 'camera' && s.num === PAR.get('camera'));
  if (!sp) return;
  pianoAttivo = sp.liv; disegnaPianta(); selezionaSpazio(chiave(sp), true);
}
// comandi dalla pagina Conexa Room che incorpora il gemello (solo stessa origine): scenario e inquadratura della camera
let vistaSpostata = false;
controls.addEventListener('start', () => { vistaSpostata = true; });
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  if (e.data.tipo === 'ambiente' && AMBIENTI[e.data.valore]) impostaAmbiente(e.data.valore);
  if (e.data.tipo === 'inquadra') {
    const sp = CFG.spazi.find(s => s.tipo === 'camera' && s.num === String(e.data.camera));
    if (!sp || !(e.data.forza || vistaSpostata || spazioSel !== chiave(sp))) return;
    pianoAttivo = sp.liv; disegnaPianta(); selezionaSpazio(chiave(sp), true); vistaSpostata = false;
  }
});
if (window.parent !== window) window.parent.postMessage({ tipo: 'gemello-pronto' }, location.origin);
