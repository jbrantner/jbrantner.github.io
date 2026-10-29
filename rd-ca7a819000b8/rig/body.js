// 🧍 the anime base body, shared by 🎬 Scene and the 🧍 Mannequin page (Jordan 2026-10-28): Anime_Female_A from Jordan's own
// Base Meshes Character Starter Kit. It is a bought model, so it lives on Render (output/3D Bodies), never in this public repo.
// Rigged, 27k vertices, grey toon, normalised to 1.7 m with her feet on y = 0 and her front +z (her left is +x).
import * as THREE from 'three';
import {addHair} from './hair.js';
export {HAIR0, HAIR_STYLES, BANG_STYLES, hairOf, hairTags, bodyTags, BODY_GROUPS, btagsOf, shapeFromTags, AUTO_TAGS} from './hair.js';
export const BODY_AT = {sub:'3D Bodies', file:'Anime_Female_A.fbx'};
export const TOON = (() => { const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
// her bones by name (the FBX nests three nodes per bone; the outermost one turns the rest of the arm or leg with it)
export function bonesOf(root){ const m = {}; root.traverse(b => { if(b.isBone && !m[b.name]) m[b.name] = b; }); return m; }
const skinned = root => { const sk = []; root.traverse(m => { if(m.isSkinnedMesh) sk.push(m); }); return sk; };
const mainOf = root => { let main = null; root.traverse(m => { if(m.isMesh && (!main || m.geometry.attributes.position.count > main.geometry.attributes.position.count)) main = m; }); return main; };
// the face points OpenPose wants (nose, eyes, ears), kept in the head bone's own space so they follow her head
export function facePoints(root){ root.updateMatrixWorld(true); const main = mainOf(root), head = bonesOf(root).bn_head, p = new THREE.Vector3(), hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld), hy = hp.y;
  const top = new THREE.Box3().setFromObject(root, true).max.y, k = (top - hy) / 0.25; let nose = null, earX = 0; // her head's size (0.25 m above the head bone at 1.7 m)
  for(let i = 0; i < main.geometry.attributes.position.count; i++){ main.getVertexPosition(i, p); p.applyMatrix4(main.matrixWorld);
    if(p.y > hy && p.y < hy + 0.1 * k && Math.abs(p.x) < 0.006 * k && (!nose || p.z > nose.z)) nose = p.clone(); if(p.y > hy && p.y < hy + 0.09 * k) earX = Math.max(earX, Math.abs(p.x)); }
  nose = nose || new THREE.Vector3(0, hy + 0.03 * k, 0.1 * k); const loc = v => head.worldToLocal(v.clone());
  return {nose:loc(nose), eyeR:loc(nose.clone().add(new THREE.Vector3(-0.034, 0.034, -0.022).multiplyScalar(k))), eyeL:loc(nose.clone().add(new THREE.Vector3(0.034, 0.034, -0.022).multiplyScalar(k))),
    earR:loc(new THREE.Vector3(-earX * 0.85, nose.y + 0.012 * k, hp.z)), earL:loc(new THREE.Vector3(earX * 0.85, nose.y + 0.012 * k, hp.z))}; }
// stood on the floor at 1.7 m, centred
function normalise(o){ o.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o, true); o.scale.multiplyScalar(1.7 / (bb.max.y - bb.min.y)); o.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(o, true); o.position.x -= (b2.min.x + b2.max.x) / 2; o.position.y -= b2.min.y; o.position.z -= (b2.min.z + b2.max.z) / 2; o.updateMatrixWorld(true); }
// loads her from a PC (its /view of the output folder); mats(name) gives each mesh its material
export async function loadBody(url, mats){
  const [{FBXLoader}, SU] = await Promise.all([import('three/addons/loaders/FBXLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
  const o = await new FBXLoader().loadAsync(url + '/view?filename=' + encodeURIComponent(BODY_AT.file) + '&subfolder=' + encodeURIComponent(BODY_AT.sub) + '&type=output');
  o.traverse(m => { if(m.isMesh){ m.material = mats ? mats(m.name) : new THREE.MeshToonMaterial({color:/Eye/i.test(m.name) ? 0x5a5f6b : 0xd8d2cc, gradientMap:TOON}); m.frustumCulled = false; } });
  normalise(o); const root = new THREE.Group(); root.add(o); root.updateMatrixWorld(true);
  return {root, SU, face:facePoints(root), shapes:new Map()}; }

// 📏 her proportions (Jordan 2026-10-28, Character Creator v2: "start with a mannequin and generate on top of it using its
// proportions"). Each is a factor on the kit's own body (1 = as she comes), baked into a copy of her mesh and bones, so she still
// poses with her own rig. Height is her real height (cm) and only sizes her; the rest are her shape at that height.
export const SHAPE0 = {cm:160, head:1, shoulders:1, bust:1, waist:1, hips:1, thighs:1, arms:1, legs:1};
export const SHAPE_KEYS = [['cm', 'Height', 135, 190, 1, 'cm'], ['head', 'Head', 0.8, 1.3, 0.01], ['shoulders', 'Shoulders', 0.8, 1.25, 0.01], ['bust', 'Bust', 0.5, 2.6, 0.01], ['waist', 'Waist', 0.75, 1.3, 0.01],
  ['hips', 'Hips', 0.8, 1.35, 0.01], ['thighs', 'Thighs', 0.75, 1.4, 0.01], ['arms', 'Arms', 0.75, 1.35, 0.01], ['legs', 'Leg length', 0.85, 1.15, 0.01]];
export const SHAPE_PRESETS = {petite:{name:'Petite', cm:148, head:1.08, shoulders:0.94, bust:0.8, waist:0.95, hips:0.95, thighs:0.95, arms:0.92, legs:0.96},
  average:{name:'Average', ...SHAPE0}, curvy:{name:'Curvy', cm:163, head:1, shoulders:1, bust:1.55, waist:0.92, hips:1.18, thighs:1.2, arms:1.05, legs:1},
  tall:{name:'Tall & slim', cm:178, head:0.94, shoulders:1.02, bust:0.9, waist:0.9, hips:0.98, thighs:0.92, arms:0.92, legs:1.08},
  athletic:{name:'Athletic', cm:168, head:0.97, shoulders:1.1, bust:0.95, waist:0.97, hips:1.02, thighs:1.12, arms:1.15, legs:1.03}};
export const shapeOf = s => Object.assign({}, SHAPE0, s || {});
export const shapeKey = s => { const x = shapeOf(s); return SHAPE_KEYS.slice(1).map(([k]) => (+x[k]).toFixed(2)).join(','); };
// her shape (not her height) on a copy of the body, kept per shape; the copy is the template bodies are cloned from
export function shapedRoot(B, s){ const key = shapeKey(s); if(key===shapeKey(SHAPE0)) return {root:B.root, face:B.face}; if(B.shapes.has(key)) return B.shapes.get(key);
  const root = B.SU.clone(B.root); root.updateMatrixWorld(true); const sk = skinned(root); sk.forEach(m => { m.geometry = m.geometry.clone(); m.skeleton.boneInverses = m.skeleton.boneInverses.map(x => x.clone()); }); // (a cloned skeleton shares the original's)
  reshape(root, sk, shapeOf(s)); root.updateMatrixWorld(true); sk.forEach(m => { m.skeleton.calculateInverses(); m.bind(m.skeleton, m.matrixWorld); }); normalise(root.children[0]); root.updateMatrixWorld(true);
  const r = {root, face:facePoints(root)}; B.shapes.set(key, r); return r; }
function reshape(root, sk, s){ const bn = bonesOf(root), J = n => new THREE.Vector3().setFromMatrixPosition(bn[n].matrixWorld);
  const head = J('bn_head'), hipY = (J('bn_thigh01L').y + J('bn_thigh01R').y) / 2, z1 = J('bn_spine01').z, z2 = (J('bn_spine02').z + J('bn_spine03').z) / 2, shX = Math.abs(J('bn_upperarm01L').x);
  const br = {L:J('bn_breastL'), R:J('bn_breastR')}, seg = {}; for(const S of 'LR'){ seg['thigh' + S] = [J('bn_thigh01' + S), J('bn_shin01' + S)]; seg['arm' + S] = [J('bn_upperarm01' + S), J('bn_hand' + S)]; }
  const off = (p, [a, b]) => { const d = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq())); return p.clone().sub(a.clone().addScaledVector(d, t)); }; // from the limb's middle line
  // where a point goes: w(re) is how much it belongs to bones whose names match
  const D = (p, w) => { const q = p.clone();
    const wh = w(/^bn_(head|jaw)/); if(wh) q.addScaledVector(p.clone().sub(head), (s.head - 1) * wh);
    for(const S of 'LR'){ const wb = w(new RegExp('^bn_breast' + S)); if(wb) q.addScaledVector(p.clone().sub(br[S]), (s.bust - 1) * wb);
      const wt = w(new RegExp('^bn_thigh0[12]' + S + '$')); if(wt) q.addScaledVector(off(p, seg['thigh' + S]), (s.thighs - 1) * wt);
      const wa = w(new RegExp('^bn_(upperarm|forearm)0[12]' + S + '$')); if(wa) q.addScaledVector(off(p, seg['arm' + S]), (s.arms - 1) * wa); }
    const ww = w(/^bn_spine0[23]$/); if(ww){ q.x += p.x * (s.waist - 1) * ww; q.z += (p.z - z2) * (s.waist - 1) * ww; }
    const wp = w(/^bn_(pelvis[LR]|spine01)$/) + 0.6 * w(/^bn_thigh01[LR]$/); if(wp){ q.x += p.x * (s.hips - 1) * wp; q.z += (p.z - z1) * (s.hips - 1) * 0.7 * wp; }
    const wsh = w(/^bn_(upperarm|forearm|hand|thumb|index|middle|ring|pinky)/) + 0.5 * w(/^bn_shoulder/); if(wsh && Math.abs(p.x) > 1e-4) q.x += Math.sign(p.x) * (s.shoulders - 1) * shX * 1.6 * wsh;
    q.y = q.y <= hipY ? q.y * s.legs : q.y + hipY * (s.legs - 1); // longer legs lift all of her above the hips
    return q; };
  // her skin: each vertex by its skin weights
  const p = new THREE.Vector3();
  for(const m of sk){ const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = m.skeleton.bones.map(b => b.name), inv = m.matrixWorld.clone().invert();
    for(let i = 0; i < pos.count; i++){ m.getVertexPosition(i, p); p.applyMatrix4(m.matrixWorld); const ws = [];
      for(let j = 0; j < 4; j++){ const wj = sw.getComponent(i, j); if(wj > 0) ws.push([names[si.getComponent(i, j)], wj]); }
      const w = re => { let t = 0; for(const [n, x] of ws) if(re.test(n)) t += x; return t; };
      pos.setXYZ(i, ...D(p, w).applyMatrix4(inv).toArray()); }
    pos.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); }
  // her bones, parents first, moved where their own part of her went
  const all = []; root.traverse(b => { if(b.isBone) all.push([b, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld)]); });
  for(const [b, w0] of all){ const t = D(w0, re => re.test(b.name) ? 1 : 0); b.parent.updateMatrixWorld(true); b.position.copy(b.parent.worldToLocal(t)); b.updateMatrixWorld(true); } }

// a body to stand in a scene: her shape, sized to ht metres
export function bodyMesh(B, ht, s, hair, hairMat){ const T = shapedRoot(B, s), w = new THREE.Group(), c = B.SU.clone(T.root); w.add(c); w.userData.body = c; w.userData.face = T.face;
  if(hair) addHair(w, hair, hairMat); // 💇 (built at 1.7 m, before she is sized)
  c.scale.setScalar(ht / 1.7); c.traverse(b => { if(b.isBone) b.userData.q0 = b.quaternion.clone(); }); return w; }
// the poses: where each upper arm, forearm, thigh and shin points, in her own frame (front +z, her left +x)
export const POSES = {stand:{name:'Standing', bn_upperarm01L:[0.2, -1, 0.02], bn_forearm01L:[0.12, -1, 0.14], bn_upperarm01R:[-0.2, -1, 0.02], bn_forearm01R:[-0.12, -1, 0.14]},
  hip:{name:'Hand on hip', bn_upperarm01L:[0.75, -0.7, -0.2], bn_forearm01L:[-0.55, -0.55, 0.25], bn_upperarm01R:[-0.18, -1, 0.04], bn_forearm01R:[-0.08, -1, 0.2], bn_thigh01R:[-0.02, -1, 0.14], bn_shin01R:[-0.03, -1, -0.12]},
  walk:{name:'Walking', bn_upperarm01L:[0.16, -1, -0.32], bn_forearm01L:[0.08, -1, -0.05], bn_upperarm01R:[-0.16, -1, 0.32], bn_forearm01R:[-0.1, -0.8, 0.55], bn_thigh01L:[0, -1, 0.38], bn_shin01L:[0, -1, 0.06], bn_thigh01R:[0, -1, -0.28], bn_shin01R:[0, -0.85, -0.5]},
  sit:{name:'Sitting', bn_upperarm01L:[0.16, -1, 0.3], bn_forearm01L:[-0.15, -0.3, 1], bn_upperarm01R:[-0.16, -1, 0.3], bn_forearm01R:[0.15, -0.3, 1], bn_thigh01L:[0.06, -0.08, 1], bn_shin01L:[0, -1, 0.08], bn_thigh01R:[-0.06, -0.08, 1], bn_shin01R:[0, -1, 0.08]},
  wave:{name:'Waving', bn_upperarm01L:[0.2, -1, 0.02], bn_forearm01L:[0.12, -1, 0.14], bn_upperarm01R:[-0.85, 0.45, 0.12], bn_forearm01R:[-0.12, 1, 0.12]}};
// 🅰 the character sheet pose: arms about 35° out from her sides, palms in, feet a little apart
export const APOSE = {name:'A pose', bn_upperarm01L:[0.68, -1, 0.02], bn_forearm01L:[0.6, -1, 0.1], bn_upperarm01R:[-0.68, -1, 0.02], bn_forearm01R:[-0.6, -1, 0.1], bn_thigh01L:[0.07, -1, 0], bn_shin01L:[0.04, -1, 0], bn_thigh01R:[-0.07, -1, 0], bn_shin01R:[-0.04, -1, 0]};
const NEXT_BONE = {bn_upperarm01L:'bn_forearm01L', bn_upperarm01R:'bn_forearm01R', bn_forearm01L:'bn_handL', bn_forearm01R:'bn_handR', bn_thigh01L:'bn_shin01L', bn_thigh01R:'bn_shin01R', bn_shin01L:'bn_footL', bn_shin01R:'bn_footR'};
// (bq: 🤸 the Pose Creator's own bends, {bone: local quaternion}, laid over the preset; bq._root: where her hips have been moved to with the
// IK rig's hip control, her body's own position, which then also stands in for the feet-on-the-floor step: she can jump or crouch)
export function poseBody(w, key, bq){ const c = w.userData.body, ck = key + (bq ? JSON.stringify(bq) : ''); if(!c || w.userData.pose===ck) return; w.userData.pose = ck; const P = key==='apose' ? APOSE : POSES[key] || POSES.stand, bn = bonesOf(c), rq = new THREE.Quaternion();
  c.position.y = 0; c.traverse(b => { if(b.isBone && b.userData.q0) b.quaternion.copy(b.userData.q0); }); c.updateMatrixWorld(true); c.getWorldQuaternion(rq);
  const root = bq && bq._root, sk = skinned(c), v = new THREE.Vector3(); const low0 = () => { let lo = 1e9; for(const m of sk) for(let i = 0; i < m.geometry.attributes.position.count; i += 7){ m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if(v.y < lo) lo = v.y; } return lo; }, lowRest = root ? 0 : low0(); // her lowest point, before and after
  for(const name of Object.keys(NEXT_BONE)){ if(!P[name]) continue; const b = bn[name], n2 = bn[NEXT_BONE[name]]; if(!b || !n2) continue; c.updateMatrixWorld(true);
    const p0 = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld), cur = new THREE.Vector3().setFromMatrixPosition(n2.matrixWorld).sub(p0).normalize(), want = new THREE.Vector3(...P[name]).normalize().applyQuaternion(rq);
    const qW = new THREE.Quaternion().setFromUnitVectors(cur, want), pq = new THREE.Quaternion(), bq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq); b.getWorldQuaternion(bq); b.quaternion.copy(pq.invert().multiply(qW.multiply(bq))); }
  if(bq) for(const [n, q] of Object.entries(bq)) if(bn[n]) bn[n].quaternion.fromArray(q);
  if(root){ c.position.fromArray(root); c.updateMatrixWorld(true); return; }
  c.updateMatrixWorld(true); const dy = low0() - lowRest; if(Math.abs(dy) > 1e-4){ c.position.y -= dy / w.getWorldScale(new THREE.Vector3()).y; c.updateMatrixWorld(true); } } // feet back on the floor (sitting drops her)
// her OpenPose points from her bones (COCO order: nose, neck, right shoulder/elbow/wrist, left ..., right hip/knee/ankle, left ..., eyes, ears)
export function bodyJoints(w, face){ const c = w.userData.body, bn = bonesOf(c), at = n => new THREE.Vector3().setFromMatrixPosition(bn[n].matrixWorld), f = w.userData.face || face, h = bn.bn_head; c.updateMatrixWorld(true);
  const sh = s2 => at('bn_upperarm01' + s2).lerp(at('bn_forearm01' + s2), 0.22), sR = sh('R'), sL = sh('L');
  return [h.localToWorld(f.nose.clone()), sR.clone().lerp(sL, 0.5), sR, at('bn_forearm01R'), at('bn_handR'), sL, at('bn_forearm01L'), at('bn_handL'), at('bn_thigh01R'), at('bn_shin01R'), at('bn_footR'), at('bn_thigh01L'), at('bn_shin01L'), at('bn_footL'),
    h.localToWorld(f.eyeR.clone()), h.localToWorld(f.eyeL.clone()), h.localToWorld(f.earR.clone()), h.localToWorld(f.earL.clone())]; }
export const DEPTH_MAT = new THREE.ShaderMaterial({uniforms:{uNear:{value:1}, uFar:{value:2}}, vertexShader:'#include <common>\n#include <skinning_pars_vertex>\nvarying float vz; void main(){\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\nvec4 p = modelViewMatrix * vec4(transformed, 1.0); vz = -p.z; gl_Position = projectionMatrix * p; }',
  fragmentShader:'uniform float uNear; uniform float uFar; varying float vz; void main(){ float d = clamp((uFar - vz) / (uFar - uNear), 0.0, 1.0); gl_FragColor = vec4(vec3(0.2 + 0.8 * d), 1.0); }'});
// OpenPose's limbs and colours, and the skeleton drawn on black (show[i]: whether point i is seen)
export const OP_LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]];
export const OP_COL = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]];
export function drawPose(W, H, pts, show){ const pose = document.createElement('canvas'); pose.width = W; pose.height = H; const px = pose.getContext('2d'); px.fillStyle = '#000'; px.fillRect(0, 0, W, H); const sw = Math.max(4, Math.round(H / 170));
  OP_LIMBS.forEach(([a2, b2], i) => { if(!show[a2] || !show[b2]) return; const [ax, ay] = pts[a2], [bx, by] = pts[b2], len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    px.fillStyle = `rgba(${OP_COL[i].join(',')},0.6)`; px.beginPath(); px.ellipse((ax + bx) / 2, (ay + by) / 2, len / 2, sw, ang, 0, Math.PI * 2); px.fill(); });
  pts.forEach(([x2, y2], i) => { if(!show[i]) return; px.fillStyle = `rgb(${OP_COL[i].join(',')})`; px.beginPath(); px.arc(x2, y2, sw, 0, Math.PI * 2); px.fill(); });
  return pose; }
// talking to a PC: its lists, an upload, the face fix
export async function comboOf(url, cls, field){ try{ const j = await (await fetch(url + '/object_info/' + cls, {cache:'no-store'})).json(); const inp = j[cls] && j[cls].input || {}, r = (inp.required || {})[field] || (inp.optional || {})[field]; return !r ? [] : Array.isArray(r[0]) ? r[0] : r[0]==='COMBO' && r[1] && Array.isArray(r[1].options) ? r[1].options : []; }catch(e){ return []; } } // newer core nodes (BiRefNet's loader) list as ['COMBO', {options}]
export const hasNode = async (url, cls) => { try{ const j = await (await fetch(url + '/object_info/' + cls, {cache:'no-store'})).json(); return !!j[cls]; }catch(e){ return false; } };
export async function upload(url, canvas, name){ const b = await new Promise(r => canvas.toBlob(r, 'image/png')), fd = new FormData(); fd.append('image', b, name); fd.append('overwrite', 'true');
  const r = await fetch(url + '/upload/image', {method:'POST', body:fd}); if(!r.ok) throw new Error('Upload failed (' + r.status + ')'); return (await r.json()).name; }
// 🙂 Fix faces as the Render tab's Painting block does it (face_yolov8m, SAM outline, wide feather, gentle 0.35 redraw)
export function faceFix(add, img, model, clip, vae, pos, neg, seed, sam){ const extra = {noise_mask_feather:32}; if(sam) extra.sam_model_opt = [add('SAMLoader', {model_name:'sam_vit_b_01ec64.pth', device_mode:'AUTO'}), 0];
  return [add('FaceDetailer', Object.assign({image:img, model, clip, vae, guide_size:512, guide_size_for:true, max_size:1024, seed, steps:20, cfg:5.5,
    sampler_name:'euler_ancestral', scheduler:'normal', positive:pos, negative:neg, denoise:0.35, feather:32, noise_mask:true, force_inpaint:true,
    bbox_threshold:0.5, bbox_dilation:16, bbox_crop_factor:3, sam_detection_hint:'center-1', sam_dilation:12, sam_threshold:0.93, sam_bbox_expansion:0,
    sam_mask_hint_threshold:0.7, sam_mask_hint_use_negative:'False', drop_size:10, bbox_detector:[add('UltralyticsDetectorProvider', {model_name:'bbox/face_yolov8m.pt'}), 0], wildcard:'', cycle:1}, extra)), 0]; }
export const NEG = 'worst quality, low quality, bad quality, lowres, displeasing, very displeasing, old, early, nsfw, bad anatomy, bad hands, extra digits, fewer digits, jpeg artifacts, signature, username, watermark, logo, multiple views, comic, monochrome, greyscale, multiple girls, 2girls';
