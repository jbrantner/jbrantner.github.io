// 📸 Pose from a photo (Jordan 2026-10-29): SAM 3D Body (core ComfyUI nodes) reads a real person's pose in 3D and BuildPoseFile writes it as a BVH.
// Its rig (MHR, 127 joints) has numbered joints only; MHR_OP names the ones her rig needs (found on a crouching test photo: thigh/shin 42 cm,
// +X is the person's left, +Z the way they face).
export const MHR_OP = {lhip:'joint_002', lkn:'joint_003', lank:'joint_004', rhip:'joint_018', rkn:'joint_019', rank:'joint_020',
  rsh:'joint_039', rel:'joint_040', rwr:'joint_041', lsh:'joint_075', lel:'joint_076', lwr:'joint_077', neck:'joint_110', head:'joint_113', eyeA:'joint_122', eyeB:'joint_124'};
const rot = (ax, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ax==='X' ? [1, 0, 0, 0, c, -s, 0, s, c] : ax==='Y' ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (a, b) => { const r = Array(9).fill(0); for(let i = 0; i < 3; i++) for(let j = 0; j < 3; j++) for(let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
const app = (m, v) => [0, 1, 2].map(i => m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2]);
// every joint's position in the first frame, by name (the file's units)
export function bvhJoints(text){ const [head, motion] = text.split(/\bMOTION\b/), t = head.trim().split(/\s+/), joints = [], stack = []; let cur = -1;
  for(let i = 0; i < t.length; i++){ const w = t[i];
    if(w==='ROOT' || w==='JOINT'){ joints.push({name:t[++i], parent:stack.length ? stack[stack.length - 1] : -1, ch:[], off:[0, 0, 0]}); cur = joints.length - 1; }
    else if(w==='End'){ joints.push({name:null, parent:stack[stack.length - 1], ch:[], off:[0, 0, 0]}); cur = joints.length - 1; i++; }
    else if(w==='{') stack.push(cur); else if(w==='}') stack.pop();
    else if(w==='OFFSET'){ joints[cur].off = [+t[i + 1], +t[i + 2], +t[i + 3]]; i += 3; }
    else if(w==='CHANNELS'){ const n = +t[i + 1]; joints[cur].ch = t.slice(i + 2, i + 2 + n); i += 1 + n; } }
  const line = (motion || '').split('\n').map(l => l.trim()).find(l => l && !/^Frame/.test(l)), v = line ? line.split(/\s+/).map(Number) : [];
  const W = [], P = [], out = {}; let k = 0;
  joints.forEach((j, n) => { let r = [1, 0, 0, 0, 1, 0, 0, 0, 1]; const pos = j.off.slice();
    for(const c of j.ch){ const x = v[k++] || 0; if(/position$/.test(c)) pos['XYZ'.indexOf(c[0])] = x; else r = mul(r, rot(c[0], x)); }
    if(j.parent < 0){ W[n] = r; P[n] = pos; } else { const pr = W[j.parent], pp = P[j.parent], d = app(pr, pos); W[n] = mul(pr, r); P[n] = [pp[0] + d[0], pp[1] + d[1], pp[2] + d[2]]; }
    if(j.name) out[j.name] = P[n]; });
  return out; }
// the joints her rig is fitted to, as OpenPose names (nose: between the eyes), or null if this isn't SAM 3D Body's rig
export function bvhPose(text){ const J = bvhJoints(text), P = {};
  for(const [k, n] of Object.entries(MHR_OP)){ if(!J[n]) return null; P[k] = J[n]; }
  P.nose = [0, 1, 2].map(i => (P.eyeA[i] + P.eyeB[i]) / 2); delete P.eyeA; delete P.eyeB; return P; }
