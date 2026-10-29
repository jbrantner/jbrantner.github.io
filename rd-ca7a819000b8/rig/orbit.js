// 🔄 pose from an orbit, shared with the Pose Rig (rig/index.html has the same solver): a turnaround of one held pose is read
// in every view, and the one 3D pose (plus each view's exact turn, size and shift, and the camera's height angle) that lines up
// with all of them at once is found. The orbit is never a perfect turntable, so each view's turn is searched near its even step;
// readers often mix up left and right when she faces away, so each view is also tried swapped; points that disagree are dropped.
import * as THREE from 'three';
const D2R = Math.PI / 180, V = (x, y, z) => new THREE.Vector3(x, y, z), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const OJ = ['nose', 'lear', 'rear', 'lsh', 'rsh', 'lel', 'rel', 'lwr', 'rwr', 'lhip', 'rhip', 'lkn', 'rkn', 'lank', 'rank', 'lidx', 'ridx', 'lpinky', 'rpinky', 'lheel', 'rheel', 'ltoe', 'rtoe'];
const swapName = n => n[0]==='l' ? 'r' + n.slice(1) : n[0]==='r' ? 'l' + n.slice(1) : n;
function orbProj(X, c){ const ct = Math.cos(c.th), st = Math.sin(c.th), ce = Math.cos(c.e), se = Math.sin(c.e);
  return [c.s * (ct * X.x - st * X.z) + c.tx, c.s * (se * st * X.x - ce * X.y + se * ct * X.z) + c.ty]; }
function orbTriangulate(F, cams){
  const X = {};
  for(const n of OJ){ const A = new Float64Array(9), b = new Float64Array(3); let views = 0;
    F.forEach((f, i) => { const c = cams[i], o = f.o[c.swap ? swapName(n) : n], w = o ? o[2] * (c.w[n] ?? 1) : 0; if(!(w > 0)) return; views++;
      const ct = Math.cos(c.th), st = Math.sin(c.th), ce = Math.cos(c.e), se = Math.sin(c.e);
      for(const [a, r] of [[[c.s * ct, 0, -c.s * st], o[0] - c.tx], [[c.s * se * st, -c.s * ce, c.s * se * ct], o[1] - c.ty]])
        for(let p = 0; p < 3; p++){ b[p] += w * a[p] * r; for(let q = 0; q < 3; q++) A[p * 3 + q] += w * a[p] * a[q]; } });
    if(views < 2) continue; for(let p = 0; p < 3; p++) A[p * 4] += 1e-4;
    const M = new THREE.Matrix3().set(A[0], A[1], A[2], A[3], A[4], A[5], A[6], A[7], A[8]); if(Math.abs(M.determinant()) < 1e-9) continue;
    X[n] = V(b[0], b[1], b[2]).applyMatrix3(M.invert()); }
  return X;
}
// one view: the best size and shift for a given turn, and how far off it is
function orbFit(X, f, c, th, swap){
  const pr = [], ob = []; let W = 0, mu = 0, mv = 0, pu = 0, pv = 0;
  for(const n of OJ){ const x = X[n], o = f.o[swap ? swapName(n) : n]; if(!x || !o) continue; const w = o[2] * (c.w[n] ?? 1); if(!(w > 0)) continue;
    const q = orbProj(x, {th, e:c.e, s:1, tx:0, ty:0}); pr.push([q[0], q[1], w, n]); ob.push(o); W += w; mu += w * o[0]; mv += w * o[1]; pu += w * q[0]; pv += w * q[1]; }
  if(W <= 0 || pr.length < 4) return null; mu /= W; mv /= W; pu /= W; pv /= W;
  let num = 0, den = 0; pr.forEach((q, i) => { num += q[2] * ((q[0] - pu) * (ob[i][0] - mu) + (q[1] - pv) * (ob[i][1] - mv)); den += q[2] * ((q[0] - pu) ** 2 + (q[1] - pv) ** 2); });
  const s = num / (den || 1); if(!(s > 0)) return null; const tx = mu - s * pu, ty = mv - s * pv;
  let e = 0; pr.forEach((q, i) => { e += q[2] * ((s * q[0] + tx - ob[i][0]) ** 2 + (s * q[1] + ty - ob[i][1]) ** 2); });
  return {th, swap, s, tx, ty, err:e / W};
}
function orbTotal(X, F, cams){ let e = 0, n = 0; F.forEach((f, i) => { const r = orbFit(X, f, cams[i], cams[i].th, cams[i].swap); if(r){ e += r.err; n++; } }); return n ? e / n : 1e9; }
function orbRun(F, dir, facing){
  // first guess: even steps, and swapped wherever the shoulders sit the wrong way round for which side of her we see
  const cams = F.map(f => { const th = dir * f.a, front = Math.cos(th) * facing, sx = f.o.lsh[0] - f.o.rsh[0];
    return {th, th0:th, e:0, s:1, tx:0, ty:0, swap:Math.abs(Math.cos(th)) > 0.4 && sx * front < 0, w:{}}; });
  let X = {};
  for(let it = 0; it < 14; it++){
    X = orbTriangulate(F, cams);
    const win = it < 4 ? 24 : it < 9 ? 8 : 3, step = it < 4 ? 2 : it < 9 ? 1 : 0.25;
    F.forEach((f, i) => { const c = cams[i]; let best = null;
      for(const swap of [false, true]) for(let d = -win; d <= win; d += step){ const th = c.th + d * D2R; if(Math.abs(th - c.th0) > 30 * D2R) continue;
        const r = orbFit(X, f, c, th, swap); if(r && (!best || r.err < best.err)) best = r; }
      if(best) Object.assign(c, {th:best.th, swap:best.swap, s:best.s, tx:best.tx, ty:best.ty}); });
    // the orbit may turn a bit more or less than it says: fit the found turns to a straight line through the even steps
    // and move each view's search window along with it
    if(it >= 2){ let n = 0, sa = 0, st = 0, saa = 0, sat = 0; F.forEach((f, i) => { const a = dir * f.a, t = cams[i].th; n++; sa += a; st += t; saa += a * a; sat += a * t; });
      const sl = clamp((sat - sa * st / n) / ((saa - sa * sa / n) || 1), 0.75, 1.25), c0 = (st - sl * sa) / n; F.forEach((f, i) => { cams[i].th0 = c0 + sl * dir * f.a; }); }
    // the camera's height angle, shared by every view
    { const c0 = cams.map(c => c.e); let be = c0[0], bt = orbTotal(X, F, cams);
      for(let e = -40; e <= 40; e += it < 4 ? 4 : 1){ cams.forEach(c => { c.e = e * D2R; }); const t = orbTotal(X, F, cams); if(t < bt){ bt = t; be = e * D2R; } }
      cams.forEach(c => { c.e = be; }); }
    // drop points that disagree with everything else (a hidden hand guessed by the reader)
    if(it >= 3){ const res = []; F.forEach((f, i) => { const c = cams[i]; for(const n of OJ){ const o = f.o[c.swap ? swapName(n) : n]; if(!o || !X[n]) continue; const q = orbProj(X[n], c); res.push([i, n, Math.hypot(q[0] - o[0], q[1] - o[1])]); } });
      const med = res.map(r => r[2]).sort((a, b) => a - b)[res.length >> 1] || 0.05; cams.forEach(c => { c.w = {}; });
      for(const [i, n, r] of res) if(r > Math.max(3 * med, 0.12)) cams[i].w[n] = 0; }
  }
  X = orbTriangulate(F, cams);
  return {X, cams, err:orbTotal(X, F, cams)};
}
export function solveOrbit(frames){
  // each view on the same footing: the hips' middle at 0, and shoulders-to-hips height 1 (it barely changes as she turns)
  const F = frames.map((f, k) => { const p = f && f.pts; if(!p || !p.lsh || !p.rsh || !p.lhip || !p.rhip) return null;
    const hx = (p.lhip[0] + p.rhip[0]) / 2, hy = (p.lhip[1] + p.rhip[1]) / 2, sc = Math.abs(hy - (p.lsh[1] + p.rsh[1]) / 2) || 1, o = {};
    for(const n of OJ) if(p[n]) o[n] = [(p[n][0] - hx) / sc, (p[n][1] - hy) / sc, p[n][2] ?? 1];
    return {k, a:f.a, o, hx, hy, sc}; }).filter(Boolean);
  if(F.length < 4) throw new Error('Only ' + F.length + ' views showed her shoulders and hips clearly; at least 4 are needed.');
  let best = null;
  for(const dir of [1, -1]) for(const facing of [1, -1]){ const r = orbRun(F, dir, facing); if(!best || r.err < best.err) best = r; }
  const {X, cams} = best;
  if(!X.lsh || !X.rsh || !X.lhip || !X.rhip) throw new Error("The views didn't agree on where her shoulders and hips are.");
  // which side is her left: left = up × forward (forward from the nose, else from the feet). A whole-pose mix-up of
  // left and right fits the views equally well, so this settles it.
  const mid = (a, b) => X[a].clone().add(X[b]).multiplyScalar(0.5), up = mid('lsh', 'rsh').sub(mid('lhip', 'rhip')).normalize();
  let fwd = null; if(X.nose) fwd = X.nose.clone().sub(X.lear && X.rear ? mid('lear', 'rear') : mid('lsh', 'rsh'));
  if((!fwd || fwd.lengthSq() < 1e-6) && X.ltoe && X.lheel) fwd = X.ltoe.clone().sub(X.lheel);
  if(fwd && X.lsh.clone().sub(X.rsh).dot(up.clone().cross(fwd)) < 0){ const Y = {}; for(const n of Object.keys(X)) Y[swapName(n)] = X[n]; for(const n of Object.keys(X)) delete X[n]; Object.assign(X, Y); cams.forEach(c => { c.swap = !c.swap; }); }
  const used = F.map((f, i) => ({k:f.k, cam:cams[i], f}));
  return {pts:X, used, err:Math.sqrt(best.err), flips:cams.filter(c => c.swap).length};
}
