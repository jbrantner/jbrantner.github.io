// 💇 the mannequin's hair (Jordan 2026-10-28: "way better than I expected"): anime-figure hair built from her own head, as a cap
// shaped to her skull and clumps of hair, so it fits whatever 📏 shape she has. It is a guide for Illustrious (her outline and
// depth), not the final strands. Built at rest round a fresh body (w at the origin, unturned), then hung on her head bone.
// The Danbooru tags for her hair and her body are here too, so the painting is asked for what the guide shows.
import * as THREE from 'three';
const D = Math.PI / 180, sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const HAIR0 = {style:'long', len:0.55, vol:1, bangs:'choppy', side:true};
export const HAIR_STYLES = [['long', 'Long'], ['bob', 'Bob'], ['short', 'Short'], ['ponytail', 'Ponytail'], ['twintails', 'Twin tails'], ['bun', 'Bun'], ['none', 'No hair']];
export const BANG_STYLES = [['choppy', 'Choppy'], ['blunt', 'Blunt'], ['parted', 'Parted'], ['none', 'No bangs']];
export const hairOf = h => Object.assign({}, HAIR0, h || {});
// where her long hair, tails and bob end (y at 1.7 m), from Length 0-1
const ends = h => ({long:1.36 - 0.62 * h.len, bob:1.5 - 0.1 * h.len, short:1.56 - 0.05 * h.len, ponytail:1.3 - 0.5 * h.len, twintails:1.3 - 0.5 * h.len}[h.style]);
export function hairFor(w, h0, mat){ const h = hairOf(h0), grp = new THREE.Group(); if(h.style==='none') return grp; w.updateMatrixWorld(true);
  const v = h.vol; mat = mat || new THREE.MeshToonMaterial({color:0x8f857d, side:THREE.DoubleSide});
  // her head and back, from her skin
  let main; w.traverse(m => { if(m.isSkinnedMesh && (!main || m.geometry.attributes.position.count > main.geometry.attributes.position.count)) main = m; });
  const g = main.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = main.skeleton.bones.map(b => b.name), p = new THREE.Vector3(), head = [], back = new Map();
  for(let i = 0; i < g.attributes.position.count; i++){ let wh = 0, wa = 0; for(let j = 0; j < 4; j++){ const n = names[si.getComponent(i, j)], x = sw.getComponent(i, j); if(/^bn_(head|jaw)/.test(n)) wh += x; if(/^bn_(upperarm|forearm|hand|thumb|index|middle|ring|pinky)/.test(n)) wa += x; }
    main.getVertexPosition(i, p); p.applyMatrix4(main.matrixWorld); if(wh > 0.6) head.push(p.clone());
    if(wa < 0.3 && Math.abs(p.x) < 0.13){ const k = Math.round(p.y / 0.02); back.set(k, Math.min(back.has(k) ? back.get(k) : 9, p.z)); } }
  const hb = new THREE.Box3().setFromPoints(head), top = hb.max.y, k = (top - hb.min.y) / 0.256, hx = Math.max(...head.filter(q => q.y > top - 0.075 * k).map(q => Math.abs(q.x)));
  const R = new THREE.Vector3(hx + 0.012 * k * v, (0.118 + 0.01 * (v - 1)) * k, (0.115 + 0.012 * (v - 1)) * k), C = new THREE.Vector3(0, top + 0.012 * k * v - R.y, hb.min.z - 0.01 * k * v + R.z);
  // her back down the middle: the furthest-back point at or above each height (so hair falls straight), curving forward at the sides
  const run = new Map(); { let z = C.z - R.z * 0.6; for(let i = Math.round(1.5 / 0.02); i >= 0; i--){ if(back.has(i)) z = Math.min(z, back.get(i)); run.set(i, z); } }
  const hang = (y, x) => run.get(Math.max(0, Math.min(75, Math.round(Math.min(y, 1.44) / 0.02)))) + 1.3 * x * x;
  // a point on her hair: th round from her front (+ toward her left), ph down from the top; below the middle it falls straight (cap: it follows the skull)
  const S = (th, ph, s = 1, cap) => { const sp = ph < 90 || cap ? Math.sin(ph * D) : 1, y = ph <= 90 || cap ? C.y + R.y * s * Math.cos(ph * D) : C.y - R.y * (ph - 90) * D;
    return new THREE.Vector3(C.x + R.x * s * sp * Math.sin(th * D), y, C.z + R.z * s * sp * Math.cos(th * D)); };
  const phY = y => Math.acos(Math.max(-0.95, Math.min(1, (y - C.y) / R.y))) / D;
  const mesh = (pos, idx) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.name = 'hair'; grp.add(m); };
  // the cap: down to her forehead in front, over her ears at the sides, to the nape behind
  const phMax = th => { const a = Math.abs(((th + 180) % 360 + 360) % 360 - 180); return 52 + 58 * sm(25, 165, a); };
  { const NU = 64, NV = 20, pos = [], idx = []; for(let i = 0; i <= NU; i++){ const th = -180 + 360 * i / NU; for(let j = 0; j <= NV; j++) pos.push(...S(th, phMax(th) * j / NV, 1, true).toArray()); }
    for(let i = 0; i < NU; i++) for(let j = 0; j < NV; j++){ const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); } mesh(pos, idx); }
  // a clump: a run of points down its middle, its width and thickness, pointed at the tip (blunt: cut straight)
  const clump = (pts, wid, thick, out, blunt) => { const n = pts.length, pos = [], idx = [], ring = 6; if(n < 2) return;
    for(let j = 0; j < n; j++){ const t = j / (n - 1), d = pts[Math.min(n - 1, j + 1)].clone().sub(pts[Math.max(0, j - 1)]).normalize(), nrm = out(pts[j]).projectOnPlane(d).normalize(), side = new THREE.Vector3().crossVectors(d, nrm).normalize();
      const f = (blunt ? 1 : t < 0.7 ? 1 : 1 - sm(0.7, 1, t) * 0.97) * (0.85 + 0.15 * Math.sin(t * Math.PI)), W = wid * f, T = thick * f;
      for(let r = 0; r < ring; r++){ const a = r / ring * Math.PI * 2; pos.push(...pts[j].clone().addScaledVector(side, Math.cos(a) * W).addScaledVector(nrm, Math.sin(a) * T + T * 0.6).toArray()); } }
    for(let j = 0; j < n - 1; j++) for(let r = 0; r < ring; r++){ const a = j * ring + r, b = j * ring + (r + 1) % ring; idx.push(a, a + ring, b, b, a + ring, b + ring); } mesh(pos, idx); };
  const outOf = q => new THREE.Vector3(q.x, q.y > C.y ? q.y - C.y : 0, q.z - C.z).normalize(), backOut = q => new THREE.Vector3(q.x * 0.6, 0, -1);
  // the bangs: choppy (to just above her eyes, uneven, one between them), blunt (cut straight), parted (from a middle parting, swept aside)
  const eyeY = C.y - 0.04 * k;
  if(h.bangs!=='none' && h.style!=='none'){ const N = h.bangs==='blunt' ? 13 : 11;
    for(let i = 0; i < N; i++){ const th = -55 + 110 * i / (N - 1), a = Math.abs(th); if(h.bangs==='parted' && a < 9) continue;
      const endY = h.bangs==='blunt' ? eyeY + 0.016 * k : eyeY + (0.015 - 0.012 * Math.sin(i * 2.3)) * k - 0.02 * k * sm(35, 55, a) + (h.bangs==='parted' ? 0.03 * k * (1 - a / 55) : 0), pts = [];
      for(let j = 0; j <= 14; j++){ const sw2 = h.bangs==='parted' ? Math.sign(th) * 22 * j / 14 * (1 - a / 70) : 4 * Math.sin(i * 1.7) * j / 14, q = S(th + sw2, 25 + j * 6, 1.04); if(q.y < endY) break; pts.push(q); }
      clump(pts, 0.019 * v * k * (h.bangs==='blunt' ? 0.9 : 1), 0.006 * k, outOf, h.bangs==='blunt'); } }
  // sidelocks: one each side, framing her face
  if(h.side && !['short', 'none'].includes(h.style)) for(const sg of [-1, 1]){ const pts = []; for(let j = 0; j <= 20; j++){ const q = S(sg * 72, 30 + j * 6, 1.04); if(q.y < C.y - 0.17 * k) break; pts.push(q); } clump(pts, 0.017 * v * k, 0.006 * k, outOf); }
  // round the back of her head, hanging: long hair down her back, a bob or short hair round her head
  const end = ends(h);
  if(h.style==='long'){ const N = 15; for(let i = 0; i < N; i++){ const u = -1 + 2 * i / (N - 1), th = 180 - u * 82, pts = [];
      for(let ph = 6; ph < 88; ph += 6) pts.push(S(th, ph, 1.045, true));
      for(let y = C.y - 0.01; y > end; y -= 0.02){ const hd = S(th, phY(y), 1.045, true), xw = u * (0.1 + 0.07 * sm(1.5, 1.32, y)) * v, tgt = new THREE.Vector3(xw, y, hang(y, xw) - (0.025 + 0.02 * (1 - Math.abs(u))) * v);
        pts.push(new THREE.Vector3(hd.x, y, hd.z).lerp(tgt, sm(C.y - 0.03, C.y - 0.14, y))); }
      clump(pts, 0.035 * v, 0.012, backOut); } }
  if(h.style==='bob' || h.style==='short'){ const N = h.style==='bob' ? 22 : 26, span = h.style==='bob' ? 118 : 125; for(let i = 0; i < N; i++){ const th = 180 + span * (-1 + 2 * i / (N - 1)), pts = [], e = end + 0.01 * Math.sin(i * 2.1) * k;
      for(let ph = 6; ph < 180; ph += 5){ const q = S(th, ph, 1.05 + (h.style==='short' ? 0 : 0.03 * sm(60, 100, ph))); if(q.y < e) break; pts.push(q); }
      const n = pts.length; pts.forEach((q, j) => { const t = j / Math.max(1, n - 1); if(t > 0.75 && h.style==='bob'){ const c2 = new THREE.Vector3(C.x, q.y, C.z); q.lerp(c2, 0.12 * sm(0.75, 1, t)); } }); // a bob's ends turn in
      clump(pts, (h.style==='bob' ? 0.024 : 0.02) * v * k, 0.008 * k, outOf); } }
  // tails: a bundle of clumps from a tie, out and down (ponytail at the back, twin tails at the sides), with a band at the tie
  const tail = (tie, dir, lat, endY) => { const path = [tie.clone(), tie.clone().addScaledVector(dir, 0.04).add(new THREE.Vector3(0, 0.01, 0)), tie.clone().addScaledVector(dir, 0.075).add(new THREE.Vector3(0, -0.03, 0))];
    for(let y = path[2].y - 0.03; y > endY; y -= 0.025){ const x = path[2].x + lat * (1 - Math.exp(-(path[2].y - y) * 6)), z = Math.min(path[2].z + dir.z * 0.01, lat ? path[2].z - 0.02 : hang(y, x) - 0.05); path.push(new THREE.Vector3(x, y, z)); }
    const M = 7; for(let m = 0; m < M; m++){ const a = m / M * Math.PI * 2, pts = path.map((q, j) => { const t = j / (path.length - 1), r = (0.012 + 0.03 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.55) * (1 - t * 0.6)) * v; return q.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.7)); });
      clump(pts, 0.016 * v, 0.01, q => new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.016 * v, 0.006, 6, 14), mat); band.position.copy(tie).addScaledVector(dir, 0.012); band.lookAt(tie.clone().add(dir)); band.name = 'hair'; grp.add(band); };
  if(h.style==='ponytail') tail(S(180, 62, 1.0, true), new THREE.Vector3(0, 0.2, -1).normalize(), 0, end);
  if(h.style==='twintails') for(const sg of [-1, 1]) tail(S(sg * 118, 52, 1.0, true), new THREE.Vector3(sg, 0.3, -0.5).normalize(), sg * 0.06, end);
  if(h.style==='bun'){ const at = S(180, 38, 1.0, true).add(new THREE.Vector3(0, 0.03, -0.035)); const bun = new THREE.Mesh(new THREE.SphereGeometry(0.052 * v * k, 20, 14), mat); bun.scale.set(1, 0.9, 0.95); bun.position.copy(at); bun.name = 'hair'; grp.add(bun);
    for(let m = 0; m < 6; m++){ const a = m / 6 * Math.PI * 2, t = new THREE.Mesh(new THREE.TorusGeometry(0.04 * v * k, 0.012 * v * k, 6, 16, Math.PI), mat); t.position.copy(at); t.rotation.set(0, a, Math.PI / 2); t.name = 'hair'; grp.add(t); } }
  return grp; }
// hangs it on her head bone, so it follows her when she is posed (built at rest)
export function addHair(w, h, mat){ const hg = hairFor(w, h, mat); if(!hg.children.length) return null; let head = null; w.traverse(b => { if(b.isBone && b.name==='bn_head' && !head) head = b; }); (head || w).attach(hg); w.userData.hair = hg; return hg; }

// 🏷 Danbooru tags (checked against the tag list, 2026-10-28) for what the guide shows, so Illustrious paints the same
export function hairTags(h0){ const h = hairOf(h0), e = ends(h), t = [];
  if(h.style==='long') t.push(e > 1.28 ? 'medium hair' : e > 1.02 ? 'long hair' : 'long hair, very long hair');
  if(h.style==='bob') t.push('short hair, bob cut'); if(h.style==='short') t.push('short hair');
  if(h.style==='ponytail') t.push(e > 1.2 ? 'short ponytail' : 'long hair, ponytail'); if(h.style==='twintails') t.push(e > 1.2 ? 'short twintails' : 'long hair, twintails');
  if(h.style==='bun') t.push('hair bun, single hair bun'); if(h.style==='none') return '';
  t.push({choppy:'hair between eyes', blunt:'blunt bangs', parted:'parted bangs', none:'forehead'}[h.bangs]); if(h.bangs==='none' && ['ponytail', 'bun'].includes(h.style)) t.push('hair pulled back');
  if(h.side && !['short'].includes(h.style)) t.push('sidelocks'); return t.join(', '); }
// 🏷 her body picked as tags (Jordan 2026-10-28: "instead of sliders you have tags"): each group is one choice ('' = not said),
// and each tag sets the mannequin to that size; later groups win where two set the same part
export const BODY_GROUPS = [
  ['height', 'Height', [['petite', {cm:148, head:1.06, legs:0.97}], ['', {}, 'Average'], ['tall female', {cm:176, head:0.96, legs:1.05}]], ''],
  ['build', 'Build', [['', {}, 'Average'], ['skinny', {arms:0.82, waist:0.88, thighs:0.82, hips:0.92}], ['curvy', {waist:0.9, hips:1.15, thighs:1.12}], ['toned', {shoulders:1.08, arms:1.15, thighs:1.08, waist:0.95}], ['plump', {waist:1.2, hips:1.15, thighs:1.25, arms:1.2}]], ''],
  ['breasts', 'Breasts', [['flat chest', {bust:0.5}], ['small breasts', {bust:0.75}], ['medium breasts', {bust:1}], ['large breasts', {bust:1.3}], ['huge breasts', {bust:1.7}], ['gigantic breasts', {bust:2.3}]], 'medium breasts'],
  ['waist', 'Waist', [['', {}], ['narrow waist', {waist:0.84}]], ''],
  ['hips', 'Hips', [['', {}], ['wide hips', {hips:1.22}]], ''],
  ['thighs', 'Thighs', [['', {}], ['thick thighs', {thighs:1.28}]], ''],
  ['legs', 'Legs', [['', {}], ['long legs', {legs:1.08}]], '']];
export const btagsOf = t => Object.assign(Object.fromEntries(BODY_GROUPS.map(([k, , , d]) => [k, d])), t || {});
export function shapeFromTags(t0){ const t = btagsOf(t0), s = {cm:160, head:1, shoulders:1, bust:1, waist:1, hips:1, thighs:1, arms:1, legs:1};
  for(const [k, , opts] of BODY_GROUPS){ const o = opts.find(x => x[0]===t[k]); if(o) Object.assign(s, o[1]); } return s; }
export const bodyTags = t0 => { const t = btagsOf(t0); return BODY_GROUPS.map(([k]) => t[k]).filter(Boolean).join(', '); };
// every tag this page may write into the prompt box, so a change takes the old ones out wherever they are
export const AUTO_TAGS = new Set(BODY_GROUPS.flatMap(([, , o]) => o.map(x => x[0])).concat(['medium hair', 'long hair', 'very long hair', 'short hair', 'bob cut', 'short ponytail', 'ponytail', 'short twintails', 'twintails', 'hair bun', 'single hair bun', 'hair between eyes', 'blunt bangs', 'parted bangs', 'forehead', 'hair pulled back', 'sidelocks']).filter(Boolean));
