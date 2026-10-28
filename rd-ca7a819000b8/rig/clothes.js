// 👗 clothes for the mannequin (Jordan 2026-10-28: "how much should we utilize some basic geometry and use cloth physics").
// Illustrious only sees them through the depth guide, so they only need her silhouette: tight pieces are a shell lifted off her
// skin (they bend with her bones, so they fit every shape and pose); skirts are rings hung from her waist that never go inside
// her and flare as they fall, skinned between her hips and thighs. Layers sit further out, inner to outer.
import * as THREE from 'three';
import {lookOf, PIECES, COL, colourIn} from './look.js';

const LIFT = {legs:0.004, bottom:0.008, dress:0.011, top:0.013, shoes:0.016, gloves:0.006};
// a skirt's shape: how much it flares per metre it falls, and its pleats
// a skirt's shape: flare = how far it moves out per metre it falls, cling = how far it may fall back in towards her legs
// (Jordan 2026-10-28: "conform more to her legs"), pleats = folds round it
const SKIRTS = [[/pleated/, {flare:0.1, cling:0.3, pleats:22}], [/pencil/, {flare:0, cling:0.8}], [/long skirt/, {flare:0.05, cling:0.35}], [/miniskirt/, {flare:0.12, cling:0.25}],
  [/gown|wedding/, {flare:0.18, cling:0.2}], [/maid/, {flare:0.2, cling:0.2, pleats:14}], [/sundress|dress/, {flare:0.08, cling:0.35}], [/kimono|yukata|robe/, {flare:0, cling:0.6}], [/witch/, {flare:0.08, cling:0.3}], [/skirt/, {flare:0.08, cling:0.35}]];
const WAIST = 1.24; // her natural waist (level), where skirts hang from
const LOOSE = /skirt|dress|gown|kimono|yukata|robe|maid|witch/;

// what she wears, inner to outer: [{t, kind, how, a, sl, col, skirt}]
export function wornOf(look){ const k = lookOf(look), out = [];
  for(const f of ['legs', 'bottom', 'dress', 'top', 'shoes', 'acc']) for(const t of k[f]){ const P = PIECES.find(p => p[0].test(t)); if(!P) continue;
    const sk = P[2]==='span' && LOOSE.test(t) && !/shorts|pants|jeans/.test(t) ? (SKIRTS.find(s => s[0].test(t)) || [0, {flare:0.08, cling:0.35}])[1] : null;
    out.push({t, kind:P[1], how:P[2], a:P[3], sl:P[5] || '', col:colourIn(t) || P[4] || COL.white, skirt:sk}); }
  const ORDER = ['legs', 'bottom', 'dress', 'top', 'shoes', 'gloves']; return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)); }

// her landmarks at rest (before she is posed): levels 0 ankle … 1 hip joint … 2 neck, and her arms
function frame(w){ const body = w.userData.body; w.updateMatrixWorld(true);
  const at = n => { let b = null; body.traverse(x => { if(x.isBone && x.name===n && !b) b = x; }); return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); };
  const F = {yAnk:at('bn_footL').y, yHip:at('bn_thigh01L').y, yNeck:at('bn_head').y, sh:at('bn_upperarm01L'), hand:at('bn_handL'), hipX:Math.abs(at('bn_thigh01L').x)};
  F.lvl = y => y < F.yHip ? Math.max(0, (y - F.yAnk) / (F.yHip - F.yAnk)) : 1 + (y - F.yHip) / (F.yNeck - F.yHip);
  F.yOf = L => L < 1 ? F.yAnk + L * (F.yHip - F.yAnk) : F.yHip + (L - 1) * (F.yNeck - F.yHip); F.armLen = F.sh.distanceTo(F.hand); return F; }

const ARM = /upperarm|forearm|hand|index|middle|ring|pinky|thumb/;
export function addClothes(w, look, mats){ const old = w.userData.clothes; if(old) old.parent && old.parent.remove(old);
  const worn = wornOf(look); w.userData.clothes = null; if(!worn.length) return null;
  const F = frame(w), body = w.userData.body; let m = null; body.traverse(x => { if(x.isSkinnedMesh && x.name==='Anime_Female_A') m = x; }); if(!m) return null;
  const grp = new THREE.Group(); grp.name = 'clothes'; m.parent.add(grp); grp.position.copy(m.position); grp.quaternion.copy(m.quaternion); grp.scale.copy(m.scale); grp.updateMatrixWorld(true);
  const g = m.geometry, pos = g.attributes.position, n = pos.count, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, armBone = m.skeleton.bones.map(b => ARM.test(b.name));
  // each vertex at rest: level, arm reach, and a smooth normal (her mesh is split at seams, so normals are shared by position)
  const V = new THREE.Vector3(), L = new Float32Array(n), R = new Float32Array(n), key = i => pos.getX(i).toFixed(4) + ',' + pos.getY(i).toFixed(4) + ',' + pos.getZ(i).toFixed(4);
  const W = [], nrm = new Map(), nA = g.attributes.normal;
  for(let i = 0; i < n; i++){ m.getVertexPosition(i, V); V.applyMatrix4(m.matrixWorld); W.push(V.clone()); L[i] = F.lvl(V.y);
    let bi = 0, bw = -1; for(let j = 0; j < 4; j++){ const x = sw.getComponent(i, j); if(x > bw){ bw = x; bi = si.getComponent(i, j); } }
    R[i] = armBone[bi] ? V.distanceTo(F.sh.clone().setX(Math.sign(V.x || 1) * Math.abs(F.sh.x))) / F.armLen : -1;
    const k = key(i), a = nrm.get(k) || new THREE.Vector3(); a.add(new THREE.Vector3(nA.getX(i), nA.getY(i), nA.getZ(i))); nrm.set(k, a); }
  nrm.forEach(v => v.normalize());
  const mat = c => { const x = (mats && mats(c)) || new THREE.MeshToonMaterial({color:c, side:THREE.DoubleSide}); return x; };
  for(const p of worn){ const lift = LIFT[p.kind] || 0.01, top = p.how==='below' ? p.a : p.a[1], skirtFrom = p.skirt ? WAIST : -1;
    const lo = p.how==='below' ? -1 : p.skirt ? Math.max(p.a[0], skirtFrom - 0.02) : p.a[0];
    const inside = i => { if(R[i] >= 0) return p.kind==='gloves' ? R[i] >= p.a : (p.kind==='top' || p.kind==='dress') && L[i] <= top + 0.05 && ((p.sl==='long' && R[i] < 0.93) || (p.sl==='short' && R[i] < 0.35));
      return p.kind!=='gloves' && L[i] <= top && L[i] >= (p.skirt ? skirtFrom - 0.02 : lo); };
    // 🧥 the shell: her own triangles inside the piece, lifted off her skin, skinned to the same bones
    const keep = []; for(let t = 0; t < n; t += 3) if(inside(t) || inside(t + 1) || inside(t + 2)) keep.push(t); // (edge triangles too, so pieces meet without skin between)
    if(keep.length){ const P = new Float32Array(keep.length * 9), NN = new Float32Array(keep.length * 9), SI = new Float32Array(keep.length * 12), SW = new Float32Array(keep.length * 12); let o = 0;
      for(const t of keep) for(let v = t; v < t + 3; v++){ const nv = nrm.get(key(v)); NN[o * 3] = nv.x; NN[o * 3 + 1] = nv.y; NN[o * 3 + 2] = nv.z; P[o * 3] = pos.getX(v) + nv.x * lift; P[o * 3 + 1] = pos.getY(v) + nv.y * lift; P[o * 3 + 2] = pos.getZ(v) + nv.z * lift;
        for(let j = 0; j < 4; j++){ SI[o * 4 + j] = si.getComponent(v, j); SW[o * 4 + j] = sw.getComponent(v, j); } o++; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(P, 3)); sg.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); sg.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); sg.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); // (her smooth normals, not faceted ones)
      const sm = new THREE.SkinnedMesh(sg, mat(p.col)); sm.name = 'cloth'; sm.userData.piece = p.t; sm.frustumCulled = false; grp.add(sm); sm.bind(m.skeleton, m.bindMatrix); }
    if(p.skirt) grp.add(skirt(p, F, W, L, R, m, grp, mat(p.col), lift)); }
  w.userData.clothes = grp; return grp; }

// 👗 a skirt: rings from her waist to the hem; each ring is at least clear of her (and of the ring above), then flares and pleats
function skirt(p, F, W, L, R, m, grp, material, lift){ const S = p.skirt, y0 = F.yOf(WAIST), y1 = F.yOf(Math.max(0.02, p.a[0])), NR = 14, NA = 64;
  const cx = 0, cz = W.reduce((s, v, i) => L[i] > 0.95 && L[i] < 1.15 && R[i] < 0 ? (s[0] += v.z, s[1]++, s) : s, [0, 0]).reduce((a, b) => a / b);
  const rings = []; let prev = null;
  for(let r = 0; r <= NR; r++){ const t = r / NR, y = y0 + (y1 - y0) * t, band = 0.025, br = new Float32Array(NA);
    for(let i = 0; i < W.length; i += 2){ const v = W[i]; if(R[i] >= 0 || Math.abs(v.y - y) > band) continue; const a = Math.atan2(v.z - cz, v.x - cx), b = ((Math.round(a / (Math.PI * 2) * NA) % NA) + NA) % NA, d = Math.hypot(v.x - cx, v.z - cz); if(d > br[b]) br[b] = d; }
    const sm = new Float32Array(NA); for(let b = 0; b < NA; b++){ let mx = 0; for(let k = -3; k <= 3; k++) mx = Math.max(mx, br[(b + k + NA) % NA]); sm[b] = mx; }
    const ring = []; for(let b = 0; b < NA; b++){ let rad = sm[b] + lift + 0.006; if(prev) rad = Math.max(rad, prev[b] + (S.flare - (S.cling || 0)) * (y0 - y1) / NR); ring.push(rad); }
    // a skirt hangs round her, not between her legs: no ring narrower than its widest neighbours allow
    for(let pass = 0; pass < 3; pass++) for(let b = 0; b < NA; b++) ring[b] = Math.max(ring[b], 0.5 * (ring[(b + NA - 4) % NA] + ring[(b + 4) % NA]) - 0.002);
    rings.push({y, t, rad:ring}); prev = ring; }
  const P = [], SI = [], SWt = [], idx = [], inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), Vv = new THREE.Vector3();
  const bones = m.skeleton.bones, bi = n => bones.findIndex(b => b.name===n), hip = bi('bn_spine01'), tl = bi('bn_thigh01L'), tr = bi('bn_thigh01R');
  for(const {y, t, rad} of rings) for(let b = 0; b < NA; b++){ const a = b / NA * Math.PI * 2, pl = S.pleats ? 1 + 0.07 * Math.min(1, t * 2) * Math.abs(Math.sin(a * S.pleats / 2)) : 1, r = rad[b] * pl;
    Vv.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r).applyMatrix4(inv); P.push(Vv.x, Vv.y, Vv.z);
    const leg = Math.min(0.7, t * 0.8), s = THREE.MathUtils.clamp(0.5 + Math.cos(a) * 0.9, 0, 1); SI.push(hip, tl, tr, 0); SWt.push(1 - leg, leg * s, leg * (1 - s), 0); }
  for(let r = 0; r < NR; r++) for(let b = 0; b < NA; b++){ const a = r * NA + b, c = r * NA + (b + 1) % NA; idx.push(a, a + NA, c, c, a + NA, c + NA); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SWt, 4)); g.setIndex(idx); g.computeVertexNormals();
  const sk = new THREE.SkinnedMesh(g, material); sk.name = 'cloth'; sk.userData.piece = p.t + ' (skirt)'; sk.frustumCulled = false; sk.bind(m.skeleton, m.bindMatrix); return sk; }
