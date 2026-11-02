// Conexa Hotel – arredi generati da codice (stile "tech caldo": noce scuro, bronzo, tessuti naturali, LED 2700 K)
// Coordinate di pianta: x = x mondo, y pianta = −z mondo. Quote dei piani da twin_config.quote.
// Le camere usano config/arredi_camere.json (lato corridoio, bagno, tipologia) ricavato dai muri di interni.glb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function creaArredi(spazi, camere, Q, lettura = {}) {
  const geos = {};
  let fl = 0;                                   // quota del pavimento corrente
  const metti = (mat, g) => { g.deleteAttribute('uv'); (geos[mat] ||= []).push(g); };
  // parallelepipedo in pianta: x0..x1, y0..y1, altezze h0..h1 sopra il pavimento
  const B = (mat, x0, y0, x1, y1, h0, h1) => {
    const sx = Math.abs(x1 - x0), sz = Math.abs(y1 - y0), sy = h1 - h0;
    if (sx < 0.005 || sz < 0.005 || sy < 0.005) return;
    const g = new THREE.BoxGeometry(sx, sy, sz); g.translate((x0 + x1) / 2, fl + (h0 + h1) / 2, -(y0 + y1) / 2); metti(mat, g);
  };
  const C = (mat, x, y, r, h0, h1, seg = 14, r2 = r) => {
    const g = new THREE.CylinderGeometry(r2, r, h1 - h0, seg); g.translate(x, fl + (h0 + h1) / 2, -y); metti(mat, g);
  };
  const SF = (mat, x, y, r, h, sy = 1) => {
    const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.translate(x, fl + h, -y); metti(mat, g);
  };

  // ------------------------------------------------------------ elementi ricorrenti (in pianta, orientati lungo gli assi)
  // dir: verso in cui "guarda" chi siede: 'N' (+y), 'S' (−y), 'E' (+x), 'O' (−x)
  const ruota = (dir, a, b) => dir === 'N' ? [a, b] : dir === 'S' ? [-a, -b] : dir === 'E' ? [b, -a] : [-b, a];
  const Bl = (mat, x, y, dir, a0, b0, a1, b1, h0, h1) => {   // box in coordinate locali (a = lato, b = fronte)
    const [p0x, p0y] = ruota(dir, a0, b0), [p1x, p1y] = ruota(dir, a1, b1);
    B(mat, x + Math.min(p0x, p1x), y + Math.min(p0y, p1y), x + Math.max(p0x, p1x), y + Math.max(p0y, p1y), h0, h1);
  };
  const sedia = (x, y, dir, mat = 'ar_cuoio') => {           // sedia da pranzo: struttura bronzo, seduta in cuoio
    Bl(mat, x, y, dir, -0.22, -0.2, 0.22, 0.22, 0.44, 0.5);
    Bl(mat, x, y, dir, -0.22, -0.24, 0.22, -0.2, 0.5, 0.86);
    for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) Bl('ar_bronzo', x, y, dir, a - 0.015, b - 0.015, a + 0.015, b + 0.015, 0, 0.44);
  };
  const sgabello = (x, y) => { C('ar_cuoio', x, y, 0.19, 0.72, 0.78, 16); C('ar_bronzo', x, y, 0.025, 0, 0.72, 8); C('ar_bronzo', x, y, 0.2, 0, 0.02, 16); C('ar_bronzo', x, y, 0.17, 0.3, 0.32, 16); };
  const poltrona = (x, y, dir, mat = 'ar_cuoio') => {
    Bl(mat, x, y, dir, -0.4, -0.38, 0.4, 0.4, 0.12, 0.42);
    Bl(mat, x, y, dir, -0.4, -0.45, 0.4, -0.25, 0.42, 0.8);
    Bl(mat, x, y, dir, -0.45, -0.45, -0.32, 0.4, 0.12, 0.6); Bl(mat, x, y, dir, 0.32, -0.45, 0.45, 0.4, 0.12, 0.6);
    Bl('ar_bronzo', x, y, dir, -0.42, -0.42, 0.42, 0.38, 0, 0.12);
  };
  const divano = (x, y, dir, l = 2.2, mat = 'ar_velluto') => {
    Bl(mat, x, y, dir, -l / 2, -0.45, l / 2, 0.45, 0.12, 0.43);
    Bl(mat, x, y, dir, -l / 2, -0.45, l / 2, -0.22, 0.43, 0.82);
    Bl(mat, x, y, dir, -l / 2, -0.45, -l / 2 + 0.16, 0.45, 0.43, 0.62); Bl(mat, x, y, dir, l / 2 - 0.16, -0.45, l / 2, 0.45, 0.43, 0.62);
    Bl('ar_noce', x, y, dir, -l / 2 + 0.05, -0.4, l / 2 - 0.05, 0.4, 0, 0.12);
    Bl('ar_led', x, y, dir, -l / 2 + 0.1, -0.35, l / 2 - 0.1, 0.35, 0.0, 0.02);
  };
  const tavoloQ = (x, y, a = 0.8, b = 0.8, h = 0.75, piano = 'ar_noce') => {
    B(piano, x - a / 2, y - b / 2, x + a / 2, y + b / 2, h - 0.04, h);
    C('ar_bronzo', x, y, 0.04, 0, h - 0.04, 8); B('ar_bronzo', x - 0.25, y - 0.25, x + 0.25, y + 0.25, 0, 0.02);
  };
  const tavoloT = (x, y, r = 0.55, h = 0.75, piano = 'ar_marmo') => { C(piano, x, y, r, h - 0.04, h, 28); C('ar_bronzo', x, y, 0.05, 0, h - 0.04, 10); C('ar_bronzo', x, y, 0.28, 0, 0.03, 20); };
  const tavolinoBasso = (x, y, a = 1.1, b = 0.65) => { B('ar_pietra', x - a / 2, y - b / 2, x + a / 2, y + b / 2, 0.36, 0.4); B('ar_bronzo', x - a / 2 + 0.06, y - b / 2 + 0.06, x + a / 2 - 0.06, y + b / 2 - 0.06, 0, 0.36); };
  const pianta = (x, y, h = 1.4) => { C('ar_vaso', x, y, 0.28, 0, 0.55, 14, 0.22); SF('ar_pianta', x, y, 0.42, 0.55 + h * 0.45, h / 0.9); };
  const pendente = (x, y, hSoff, quota = 2.3) => { C('ar_bronzo', x, y, 0.006, quota + 0.12, hSoff, 4); C('ar_bronzo', x, y, 0.2, quota + 0.06, quota + 0.12, 20); C('ar_led', x, y, 0.18, quota, quota + 0.06, 20); };
  const tappeto = (x0, y0, x1, y1) => B('ar_tappeto', x0, y0, x1, y1, 0.02, 0.03);
  const pavimento = (mat, r, h = 0.02) => B(mat, r[0], r[1], r[2], r[3], 0, h);

  // ------------------------------------------------------------ camere
  const H_CAM = { P1: 3.15, P2: 3.0 };
  for (const c of camere) {
    fl = Q[c.liv];
    const H = H_CAM[c.liv] ?? 3.0;
    const [x0, y0, x1, y1] = c.rect, b = c.bagno;
    const uX = c.corridoio === 'xmax' || c.corridoio === 'xmin';
    const uS = c.corridoio === 'xmax' || c.corridoio === 'ymax' ? 1 : -1;
    // i muri sono centrati sul bordo della camera e sporgono 5 cm all'interno: si arreda dal filo interno
    const uO = (uX ? (uS > 0 ? x0 : x1) : (uS > 0 ? y0 : y1)) + uS * 0.05;
    const D = (uX ? x1 - x0 : y1 - y0) - 0.1, W = (uX ? y1 - y0 : x1 - x0) - 0.1;
    const [va, vb] = uX ? [y0, y1] : [x0, x1];
    const [ba, bbv] = uX ? [b[1], b[3]] : [b[0], b[2]];
    const vS = Math.abs(ba - va) < 0.05 ? 1 : -1, vO = (vS > 0 ? va : vb) + vS * 0.05;
    const bw = bbv - ba - 0.1, bd = (uX ? b[2] - b[0] : b[3] - b[1]) - 0.1;
    const P = (u, v) => uX ? [uO + uS * u, vO + vS * v] : [vO + vS * v, uO + uS * u];
    const R = (mat, u0, u1, v0, v1, h0, h1) => { const [p, q] = P(u0, v0), [r, s] = P(u1, v1); B(mat, Math.min(p, r), Math.min(q, s), Math.max(p, r), Math.max(q, s), h0, h1); };
    const Cy = (mat, u, v, rr, h0, h1, seg) => { const [x, y] = P(u, v); C(mat, x, y, rr, h0, h1, seg); };
    const dirV = v => { const [ax, ay] = P(0, 0), [bx, by] = P(0, v); return uX ? (by > ay ? 'N' : 'S') : (bx > ax ? 'E' : 'O'); };   // verso +v
    const dirU = () => { const [ax, ay] = P(0, 0), [bx, by] = P(1, 0); return uX ? (bx > ax ? 'E' : 'O') : (by > ay ? 'N' : 'S'); };
    const opp = d => ({ N: 'S', S: 'N', E: 'O', O: 'E' })[d];

    const T = c.tipo, bedW = T === 'standard' ? 1.6 : T === 'superior' ? 1.8 : 2.0, bedL = 2.05;
    const Ds = D - bd, u0b = D - bd;
    // la testata va sulla parete delle luci di lettura del progetto KNX, centrata tra le due applique
    const loc = ([x, y]) => uX ? [(x - uO) * uS, (y - vO) * vS] : [(y - uO) * uS, (x - vO) * vS];
    const let_ = (lettura[c.num] || []).map(loc);
    const spec = let_.length ? let_.reduce((a, p) => a + p[1], 0) / let_.length > W / 2 : false;
    const ucLet = let_.length ? let_.reduce((a, p) => a + p[0], 0) / let_.length : Ds / 2 + 0.1;
    const uc = Math.max(bedW / 2 + 0.55, Math.min(ucLet, Ds - bedW / 2 - 0.5));
    // zona notte: coordinate v ribaltate se la testata è sulla parete opposta al bagno
    const Rn = (mat, u0, u1, v0, v1, h0, h1) => spec ? R(mat, u0, u1, W - v1, W - v0, h0, h1) : R(mat, u0, u1, v0, v1, h0, h1);
    const Pn = (u, v) => P(u, spec ? W - v : v);
    const Cyn = (mat, u, v, rr, h0, h1, seg) => Cy(mat, u, spec ? W - v : v, rr, h0, h1, seg);
    const dirVn = () => spec ? opp(dirV(1)) : dirV(1);

    // pavimenti e controsoffitto con taglio di luce verso la finestra
    R('ar_parquet', 0, D, 0, W, 0, 0.02);
    R('ar_gres', u0b + 0.06, D - 0.06, 0.06, bw - 0.06, 0.02, 0.03);
    R('ar_soffitto', 0, D, 0, W, H - 0.05, H - 0.02);
    R('ar_led', 0.12, 0.17, 0.3, W - 0.3, H - 0.08, H - 0.05);
    // letto: testata in noce a tutta altezza tavolo, filo bronzo e LED radente
    const hb0 = uc - bedW / 2 - 0.62, hb1 = uc + bedW / 2 + 0.62;
    Rn('ar_noce', hb0, hb1, 0, 0.05, 0, 1.25);
    Rn('ar_bronzo', hb0, hb1, 0.05, 0.065, 1.2, 1.23);
    Rn('ar_led_let', hb0 + 0.04, hb1 - 0.04, 0.05, 0.06, 1.23, 1.26);
    Rn('ar_noce', uc - bedW / 2 + 0.1, uc + bedW / 2 - 0.1, 0.12, bedL - 0.05, 0.06, 0.28);
    Rn('ar_led_cor', uc - bedW / 2 + 0.12, uc + bedW / 2 - 0.12, 0.14, bedL - 0.07, 0.03, 0.06);
    Rn('ar_lenzuola', uc - bedW / 2, uc + bedW / 2, 0.08, bedL, 0.28, 0.55);
    Rn(T === 'junior' ? 'ar_cuoio' : 'ar_plaid', uc - bedW / 2 - 0.02, uc + bedW / 2 + 0.02, bedL - 0.6, bedL + 0.02, 0.5, 0.57);
    Rn('ar_lenzuola', uc - bedW / 2 + 0.1, uc - 0.04, 0.12, 0.48, 0.55, 0.72);
    Rn('ar_lenzuola', uc + 0.04, uc + bedW / 2 - 0.1, 0.12, 0.48, 0.55, 0.72);
    for (const s of [-1, 1]) {                                   // comodini sospesi con LED di cortesia
      const un = uc + s * (bedW / 2 + 0.31);
      Rn('ar_noce', un - 0.22, un + 0.22, 0.05, 0.45, 0.42, 0.6);
      Rn('ar_led_cor', un - 0.2, un + 0.2, 0.07, 0.43, 0.39, 0.42);
    }
    // applique di lettura nelle posizioni del progetto KNX (circuito lettura)
    const appl = let_.length ? let_.map(p => p[0]) : [uc - bedW / 2 + 0.1, uc + bedW / 2 - 0.1];
    for (const ua of appl) {
      Rn('ar_bronzo', ua - 0.06, ua + 0.06, 0.05, 0.08, 1.3, 1.42);
      Rn('ar_bronzo', ua - 0.012, ua + 0.012, 0.08, 0.3, 1.38, 1.4);
      Cyn('ar_led_let', ua, 0.3, 0.06, 1.3, 1.4, 14);
    }
    if (bedL + 0.75 < W - 0.5) Rn('ar_tappeto', uc - bedW / 2 - 0.35, uc + bedW / 2 + 0.35, 0.9, bedL + 0.7, 0.02, 0.03);
    // consolle sospesa con TV di fronte al letto
    const cw = W < 3.4 ? 0.32 : 0.42;
    const cu0 = Math.max(0.95, uc - 0.95), cu1 = Math.min(Ds - 0.1, uc + 0.95);
    Rn('ar_noce', cu0, cu1, W - cw, W, 0.34, 0.62);
    Rn('ar_led_cor', cu0 + 0.03, cu1 - 0.03, W - cw + 0.02, W - 0.02, 0.31, 0.34);
    Rn('ar_schermo', uc - 0.6, uc + 0.6, W - 0.045, W - 0.015, 1.05, 1.75);
    // angolo finestra: poltrona (superior e junior anche tavolino; junior anche seconda poltrona e panca)
    const [pax, pay] = Pn(0.6, W - 0.6);
    if (W > 3.3 || T !== 'standard') poltrona(pax, pay, dirU(), T === 'junior' ? 'ar_velluto' : 'ar_cuoio');
    if (T !== 'standard') { const [tx, ty] = Pn(0.55, W - 1.35); C('ar_pietra', tx, ty, 0.24, 0.5, 0.54, 20); C('ar_bronzo', tx, ty, 0.03, 0, 0.5, 6); }
    if (T === 'junior') {
      const [qx, qy] = Pn(0.6, W - 2.05); poltrona(qx, qy, dirU(), 'ar_velluto');
      if (W - cw - (bedL + 0.1) > 1.15) Rn('ar_cuoio', uc - bedW / 2 + 0.1, uc + bedW / 2 - 0.1, bedL + 0.08, bedL + 0.48, 0.38, 0.46), Rn('ar_bronzo', uc - bedW / 2 + 0.15, uc + bedW / 2 - 0.15, bedL + 0.12, bedL + 0.44, 0, 0.38);
    }
    if (T !== 'standard') { const [sx, sy] = Pn(Math.min(cu1 - 0.35, cu0 + 0.45), W - cw - 0.42); sedia(sx, sy, dirVn()); }
    // tende di lino raccolte ai lati della vetrata
    R('ar_tenda', 0.04, 0.14, 0.05, 0.42, 0.04, H - 0.1); R('ar_tenda', 0.04, 0.14, W - 0.42, W - 0.05, 0.04, H - 0.1);
    // ingresso: armadio in noce con maniglia a filo in bronzo, panca portavaligie
    if (bd - 1.0 >= 0.5) {
      R('ar_noce', u0b + 0.02, D - 1.0, W - 0.6, W, 0, 2.5);
      R('ar_bronzo', (u0b + D - 1.0) / 2 - 0.01, (u0b + D - 1.0) / 2 + 0.01, W - 0.615, W - 0.6, 0.85, 1.95);
      R('ar_led_cor', u0b + 0.05, D - 1.03, W - 0.6, W - 0.04, 0, 0.02);
    }
    // bagno: doccia filo pavimento lato corridoio, lavabo sospeso e specchio retroilluminato, vaso sospeso
    R('ar_pietra', D - 0.95, D - 0.06, 0.06, bw - 0.06, 0.03, 0.04);
    R('ar_vetro', D - 0.97, D - 0.95, 0.06, bw * 0.55, 0.04, 2.0);
    R('ar_pietra', D - 0.95, D - 0.06, 0.06, 0.09, 0.04, 2.2);
    Cy('ar_acciaio', D - 0.5, 0.25, 0.11, 2.05, 2.08, 16);
    R('ar_pietra', u0b + 0.08, u0b + 0.98, 0.06, 0.56, 0.82, 0.87);
    R('ar_noce', u0b + 0.08, u0b + 0.98, 0.06, 0.53, 0.6, 0.82);
    Cy('ar_ceramica', u0b + 0.53, 0.32, 0.19, 0.87, 0.97, 20);
    R('ar_specchio', u0b + 0.1, u0b + 0.96, 0.06, 0.075, 1.05, 1.85);
    R('ar_led', u0b + 0.12, u0b + 0.94, 0.06, 0.07, 1.02, 1.05);
    R('ar_ceramica', u0b + 0.06, u0b + 0.6, bw - 0.6, bw - 0.24, 0.32, 0.48);
    R('ar_soffitto', u0b + 0.06, D - 0.06, 0.06, bw - 0.06, H - 0.4, H - 0.37);
  }

  // ------------------------------------------------------------ spazi comuni
  const sp = {}; for (const s of spazi) sp[`${s.liv}:${s.num}`] = s.rect;
  const r = k => sp[k];

  // corridoi di piano: moquette scura e LED radente a battiscopa
  for (const k of ['P1:COR-A', 'P1:COR-B', 'P2:COR-A', 'P2:COR-B', 'INT:DISIMP']) {
    const c = r(k); if (!c) continue; fl = Q[k.split(':')[0]];
    pavimento(k.startsWith('INT') ? 'ar_gres' : 'ar_moquette', c);
    const lungoX = c[2] - c[0] > c[3] - c[1];
    if (k.startsWith('INT')) continue;
    if (lungoX) { B('ar_led', c[0] + 0.1, c[1] + 0.02, c[2] - 0.1, c[1] + 0.05, 0.08, 0.11); B('ar_led', c[0] + 0.1, c[3] - 0.05, c[2] - 0.1, c[3] - 0.02, 0.08, 0.11); }
    else { B('ar_led', c[0] + 0.02, c[1] + 0.1, c[0] + 0.05, c[3] - 0.1, 0.08, 0.11); B('ar_led', c[2] - 0.05, c[1] + 0.1, c[2] - 0.02, c[3] - 0.1, 0.08, 0.11); }
  }

  // ---------------- PIANO TERRA: open space hall + bar + ristorante, pavimento continuo in resina
  fl = Q.PT;
  for (const k of ['PT:HALL', 'PT:BAR']) pavimento('ar_resina', r(k));
  pavimento('ar_parquet', r('PT:RIST'));
  // controsoffitto caldo su bar e ristorante (la hall ha già il suo), con gola LED lungo la vetrata
  for (const k of ['PT:BAR', 'PT:RIST']) { const c = r(k); B('ar_soffitto', c[0], c[1], c[2], c[3], 3.6, 3.63); B('ar_led', c[0] + 0.15, c[1] + 0.2, c[0] + 0.21, c[3] - 0.2, 3.55, 3.6); }
  // hall: reception scultorea in noce cannettato con piano in bronzo e LED a terra
  {
    const [cx0, cy0, cx1, cy1] = [14.8, 8.3, 19.2, 9.15];
    B('ar_noce', cx0, cy0, cx1, cy1, 0.06, 1.08);
    for (let x = cx0 + 0.06; x < cx1 - 0.04; x += 0.12) B('ar_noce_chiaro', x, cy0 - 0.03, x + 0.05, cy0, 0.1, 1.04);
    B('ar_bronzo', cx0 - 0.05, cy0 - 0.08, cx1 + 0.05, cy1 + 0.05, 1.08, 1.12);
    B('ar_led', cx0 + 0.05, cy0 - 0.02, cx1 - 0.05, cy1 - 0.05, 0, 0.06);
    // parete di fondo in listelli di noce con logo retroilluminato
    for (let x = 13.6; x < 20.4; x += 0.16) B('ar_noce', x, 9.82, x + 0.1, 9.92, 0, 3.4);
    B('ar_led', 15.4, 9.78, 18.6, 9.82, 2.05, 2.08); B('ar_led', 15.4, 9.78, 18.6, 9.82, 2.85, 2.88);
    B('ar_bronzo', 15.6, 9.76, 18.4, 9.8, 2.3, 2.62);
    sedia(16.0, 9.5, 'S'); sedia(18.0, 9.5, 'S');
  }
  // salotto della hall verso la vetrata
  tappeto(9.9, 3.6, 13.9, 7.2);
  divano(11.9, 6.6, 'S', 2.4); poltrona(10.5, 4.3, 'N'); poltrona(13.3, 4.3, 'N'); tavolinoBasso(11.9, 5.4);
  pianta(10.0, 7.6, 1.6); pianta(14.3, 3.6, 1.8); pianta(22.0, 9.6, 1.6);
  // seduta lungo la vetrata accanto all'ingresso
  divano(15.6, 3.7, 'N', 2.6, 'ar_cuoio');
  C('ar_pietra', 15.6, 5.0, 0.4, 0.38, 0.42, 24); C('ar_bronzo', 15.6, 5.0, 0.3, 0, 0.38, 20);

  // bar: isola in noce con piano in marmo, sgabelli, retrobanco luminoso che fa da quinta verso il ristorante
  {
    B('ar_noce', 3.0, 6.7, 7.6, 7.6, 0.08, 1.05);
    C('ar_noce', 3.0, 7.15, 0.45, 0.08, 1.05, 20); C('ar_noce', 7.6, 7.15, 0.45, 0.08, 1.05, 20);
    B('ar_marmo', 2.95, 6.55, 7.65, 7.75, 1.05, 1.1);
    C('ar_marmo', 2.95, 7.15, 0.6, 1.05, 1.1, 24); C('ar_marmo', 7.65, 7.15, 0.6, 1.05, 1.1, 24);
    B('ar_led', 2.8, 6.55, 7.8, 7.75, 0, 0.06);
    for (let x = 3.0; x <= 7.6; x += 0.75) sgabello(x, 6.05);
    // retrobanco: mobile basso + mensole con bottiglie retroilluminate
    B('ar_noce', 1.6, 9.35, 8.9, 9.95, 0, 0.95);
    B('ar_marmo', 1.55, 9.3, 8.95, 9.98, 0.95, 0.99);
    for (const h of [1.35, 1.75, 2.15]) { B('ar_bronzo', 1.7, 9.6, 8.8, 9.9, h, h + 0.03); B('ar_led', 1.7, 9.86, 8.8, 9.9, h + 0.03, h + 0.06); }
    for (let x = 1.85; x < 8.7; x += 0.22) for (const h of [1.38, 1.78, 2.18]) C('ar_vetro', x, 9.75, 0.04, h, h + 0.28, 6);
    for (let x = 3.4; x <= 7.4; x += 1.3) pendente(x, 7.15, 3.6, 2.25);
    // tavolini alti verso la vetrata
    for (const y of [4.9, 6.2]) { tavoloT(1.9, y, 0.32, 1.05, 'ar_pietra'); sgabello(1.9, y - 0.5); }
  }
  // ristorante: tavoli da 4 lungo la vetrata, tavolo conviviale al centro, panca continua con tavoli da 2
  {
    for (let y = 11.3; y < 27.4; y += 2.25) {
      tavoloT(2.65, y, 0.55, 0.75, 'ar_marmo');
      sedia(1.85, y, 'E'); sedia(3.45, y, 'O'); sedia(2.65, y - 0.8, 'N'); sedia(2.65, y + 0.8, 'S');
      pendente(2.65, y, 3.6, 2.2);
    }
    B('ar_noce', 4.6, 17.4, 5.8, 23.6, 0.72, 0.76); B('ar_bronzo', 4.75, 17.6, 5.65, 17.7, 0, 0.72); B('ar_bronzo', 4.75, 23.3, 5.65, 23.4, 0, 0.72);
    for (let y = 17.9; y < 23.4; y += 0.75) { sedia(4.2, y, 'E'); sedia(6.2, y, 'O'); }
    for (const y of [18.4, 20.5, 22.6]) pendente(5.2, y, 3.6, 2.15);
    for (const [ya, yb] of [[10.5, 14.7], [16.8, 23.8]]) {           // panca: si interrompe davanti alla porta della cucina
      B('ar_noce', 8.75, ya, 9.42, yb, 0, 0.18); B('ar_velluto', 8.8, ya, 9.42, yb, 0.18, 0.45); B('ar_velluto', 9.2, ya, 9.42, yb, 0.45, 1.0);
      B('ar_led', 8.75, ya, 8.78, yb, 0.02, 0.06);
      for (let y = ya + 0.75; y < yb - 0.4; y += 1.45) { tavoloQ(8.1, y, 0.7, 0.7, 0.75, 'ar_marmo'); sedia(7.35, y, 'E'); }
    }
    // cantina vini a vista verso la scala ovest
    B('ar_noce', 4.0, 26.9, 8.6, 27.4, 0, 2.6);
    for (let x = 4.15; x < 8.5; x += 0.3) for (let h = 0.3; h < 2.4; h += 0.32) C('ar_vetro', x, 27.1, 0.04, h, h + 0.26, 6);
    B('ar_vetro', 3.95, 26.82, 8.65, 26.85, 0, 2.6); B('ar_led', 4.0, 26.86, 8.6, 26.9, 2.55, 2.6);
    pianta(1.6, 10.4, 1.4); pianta(8.4, 25.9, 1.5);
  }
  // bagni pubblici, back office, cucina
  { const c = r('PT:WC'); pavimento('ar_gres', c); B('ar_pietra', c[0] + 0.1, c[3] - 0.6, c[2] - 0.1, c[3] - 0.08, 0.82, 0.88); B('ar_specchio', c[0] + 0.15, c[3] - 0.1, c[2] - 0.15, c[3] - 0.08, 1.05, 1.9); B('ar_led', c[0] + 0.15, c[3] - 0.6, c[2] - 0.15, c[3] - 0.56, 0.78, 0.82);
    for (let x = c[0] + 0.6; x < c[2] - 0.3; x += 1.1) C('ar_ceramica', x, c[3] - 0.34, 0.18, 0.88, 0.97, 18); }
  { const c = r('PT:BO'); pavimento('ar_gres', c); B('ar_noce', c[0] + 0.1, c[1] + 0.1, c[2] - 0.1, c[1] + 0.8, 0.72, 0.76); sedia(c[0] + 1.0, c[1] + 1.2, 'S'); sedia(c[2] - 1.0, c[1] + 1.2, 'S');
    for (const h of [0.4, 1.0, 1.6]) B('ar_acciaio', c[0] + 0.1, c[3] - 0.5, c[2] - 0.1, c[3] - 0.08, h, h + 0.03); }
  { const c = r('PT:CUC'); pavimento('ar_gres', c);
    B('ar_acciaio', c[0] + 0.1, c[1] + 0.1, c[0] + 0.8, c[3] - 0.1, 0, 0.9); B('ar_acciaio', c[2] - 0.8, c[1] + 0.1, c[2] - 0.1, c[3] - 0.1, 0, 0.9);
    const mx = (c[0] + c[2]) / 2, my = (c[1] + c[3]) / 2;
    B('ar_acciaio', mx - 0.6, my - 2.0, mx + 0.6, my + 2.0, 0, 0.9); B('ar_acciaio', mx - 0.8, my - 2.2, mx + 0.8, my + 2.2, 2.2, 2.6); B('ar_led', mx - 0.7, my - 2.1, mx + 0.7, my + 2.1, 2.17, 2.2); }
  // piscina interna, spogliatoi, sauna, relax
  { const c = r('PT:PISC');
    pavimento('ar_pietra', [c[0], c[1], 27.6, c[3]]); pavimento('ar_pietra', [35.6, c[1], c[2], c[3]]);
    pavimento('ar_pietra', [27.6, c[1], 35.6, 3.0]); pavimento('ar_pietra', [27.6, 7.0, 35.6, c[3]]);
    for (let x = 27.4; x < 36.4; x += 1.5) { B('ar_noce_chiaro', x - 0.33, 7.8, x + 0.33, 9.7, 0.18, 0.3); B('ar_cuscino_ext', x - 0.3, 7.85, x + 0.3, 9.65, 0.3, 0.36); B('ar_cuscino_ext', x - 0.3, 9.25, x + 0.3, 9.65, 0.36, 0.62); B('ar_bronzo', x - 0.3, 7.9, x + 0.3, 9.6, 0, 0.18); }
    pianta(26.9, 1.6, 1.8); pianta(37.1, 1.6, 1.8); pianta(37.1, 9.4, 1.5); }
  { const c = r('PT:SPOG'); pavimento('ar_gres', c); B('ar_noce_chiaro', c[0] + 0.1, c[3] - 0.5, c[2] - 0.1, c[3] - 0.05, 0, 2.1); B('ar_noce', c[0] + 0.6, c[1] + 1.8, c[2] - 0.6, c[1] + 2.2, 0.38, 0.44); }
  { const c = r('PT:SAUNA'); pavimento('ar_noce_chiaro', c, 0.05); B('ar_noce_chiaro', c[0] + 0.1, c[3] - 0.7, c[2] - 0.1, c[3] - 0.05, 0.4, 0.46); B('ar_noce_chiaro', c[0] + 0.1, c[3] - 0.5, c[2] - 0.1, c[3] - 0.05, 0.9, 0.96); B('ar_led', c[0] + 0.1, c[3] - 0.7, c[2] - 0.1, c[3] - 0.66, 0.36, 0.4); }
  { const c = r('PT:RELAX'); pavimento('ar_parquet', c); for (let x = c[0] + 0.6; x < c[2] - 0.4; x += 1.0) { B('ar_velluto', x - 0.32, c[1] + 0.6, x + 0.32, c[1] + 2.4, 0.2, 0.42); B('ar_velluto', x - 0.32, c[1] + 0.6, x + 0.32, c[1] + 1.0, 0.42, 0.75); } pianta(c[2] - 0.4, c[3] - 0.4, 1.3); }

  // ---------------- PIANO PRIMO: lounge, loggia esterna, terrazza, office
  fl = Q.P1;
  { const c = r('P1:LOUNGE'); pavimento('ar_parquet', c);
    divano(7.0, 8.0, 'S', 2.6); divano(10.6, 8.0, 'S', 2.6); tavolinoBasso(7.0, 7.0, 1.0, 0.55); tavolinoBasso(10.6, 7.0, 1.0, 0.55); pianta(12.6, 6.4, 1.4); pianta(4.9, 6.4, 1.2);
    for (const x of [7.0, 10.6]) pendente(x, 7.0, 3.15, 2.2); }
  { const c = r('P1:LOGGIA'); pavimento('ar_deck', [c[0], 0.2, c[2], c[3]], 0.05);
    for (const [x, y] of [[6.6, 2.0], [10.4, 2.0]]) { B('ar_noce_chiaro', x - 1.1, y + 0.5, x + 1.1, y + 1.3, 0.05, 0.35); B('ar_cuscino_ext', x - 1.05, y + 0.55, x + 1.05, y + 1.25, 0.35, 0.48); B('ar_cuscino_ext', x - 1.05, y + 1.05, x + 1.05, y + 1.25, 0.48, 0.85); B('ar_pietra', x - 0.5, y - 0.6, x + 0.5, y, 0.32, 0.36); B('ar_bronzo', x - 0.45, y - 0.55, x + 0.45, y - 0.05, 0.05, 0.32); }
    for (const x of [5.0, 8.5, 12.0]) pianta(x, 4.9, 1.6); }
  { const c = r('P1:TERR'); pavimento('ar_deck', c, 0.05);
    for (const x of [14.8, 17.5, 20.2]) { tavoloT(x, 1.5, 0.4, 0.75, 'ar_pietra'); sedia(x - 0.62, 1.5, 'E', 'ar_cuscino_ext'); sedia(x + 0.62, 1.5, 'O', 'ar_cuscino_ext'); } pianta(13.4, 2.6, 1.3); pianta(21.6, 2.6, 1.3); }
  { const c = r('P1:OFF'); pavimento('ar_gres', c); for (const h of [0.3, 0.9, 1.5, 2.1]) B('ar_acciaio', c[0] + 0.15, c[3] - 0.55, c[2] - 0.15, c[3] - 0.1, h, h + 0.03); B('ar_acciaio', c[0] + 1.0, c[1] + 1.4, c[0] + 2.0, c[1] + 1.9, 0.2, 1.0); }

  // ---------------- PIANO SECONDO: sala colazioni e galleria
  fl = Q.P2;
  { const c = r('P2:COLAZ'); pavimento('ar_parquet', c);
    B('ar_noce', 15.4, 6.5, 19.6, 7.3, 0.06, 0.9); B('ar_marmo', 15.35, 6.45, 19.65, 7.35, 0.9, 0.95); B('ar_led', 15.45, 6.45, 19.55, 7.35, 0, 0.06);
    B('ar_vetro', 15.5, 6.6, 19.5, 7.2, 0.95, 1.3); B('ar_bronzo', 15.3, 6.4, 19.7, 7.4, 2.35, 2.42); B('ar_led', 15.4, 6.5, 19.6, 7.3, 2.32, 2.35);
    for (const x of [14.4, 16.4, 18.4, 20.5]) for (const y of [2.3, 4.3]) { tavoloQ(x, y, 0.75, 0.75, 0.75, 'ar_marmo'); sedia(x, y - 0.6, 'N'); sedia(x, y + 0.6, 'S'); }
    pianta(13.8, 7.5, 1.5); pianta(21.2, 7.5, 1.5); }
  { const c = r('P2:GALL'); pavimento('ar_parquet', c);
    for (const x of [6.0, 9.0, 12.0]) { B('ar_noce', x - 0.9, 7.85, x + 0.9, 8.3, 0.0, 0.45); B('ar_cuoio', x - 0.85, 7.88, x + 0.85, 8.28, 0.45, 0.5); }
    for (const x of [7.5, 10.5]) { B('ar_pietra', x - 0.25, 6.45, x + 0.25, 6.95, 0, 1.0); SF('ar_bronzo', x, 6.7, 0.18, 1.2, 1.4); B('ar_led', x - 0.25, 6.45, x + 0.25, 6.95, 1.0, 1.02); } }

  // ------------------------------------------------------------ unione per materiale
  const out = [];
  for (const [mat, gs] of Object.entries(geos)) {
    const g = mergeGeometries(gs.map(x => x.index ? x.toNonIndexed() : x), false);
    if (g) out.push({ mat, geo: g });
  }
  return out;
}
