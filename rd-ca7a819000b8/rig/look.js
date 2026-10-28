// 👗 her look picked from searchable Danbooru tag lists, in sections (Jordan 2026-10-28: "a drop-down menu of searchable tags for
// sectioned off areas like a hair section where it asks for color"). Every field takes more than one tag and any custom tag;
// two hair colours add multicolored hair, and Tips makes the first colour her base and the others her tips.
import * as THREE from 'three';
const L = s => s.split(',');
export const LOOK_SECTIONS = [
  ['hair', '💇 Hair', [
    ['hcol', 'Colour', L('black hair,brown hair,blonde hair,red hair,orange hair,pink hair,purple hair,blue hair,light blue hair,dark blue hair,aqua hair,green hair,white hair,grey hair')],
    ['hmix', 'Mixed as', L('colored tips,two-tone hair,streaked hair,gradient hair,split-color hair,colored inner hair'), 1],
    ['hx', 'Extras', L('ahoge,braid,side braid,single braid,twin braids,wavy hair,curly hair,straight hair,messy hair,drill hair,hime cut,hair over one eye,hair intakes,hair ribbon,hair bow,hairband,hairclip,hair flower,hair ornament,headband')]]],
  ['face', '👁 Eyes and skin', [
    ['ecol', 'Eye colour', L('blue eyes,green eyes,aqua eyes,red eyes,brown eyes,yellow eyes,orange eyes,purple eyes,pink eyes,grey eyes,black eyes')],
    ['ex', 'Eyes', L('tsurime,tareme,jitome,long eyelashes,glasses,round eyewear,semi-rimless eyewear,eyepatch,eyeliner,makeup')],
    ['skin', 'Skin', L('pale skin,tan,dark skin,dark-skinned female,freckles,mole under eye,mole,blush,lipstick')]]],
  ['outfit', '👗 Outfit', [
    ['top', 'Top', L('shirt,white shirt,collared shirt,blouse,t-shirt,tank top,crop top,sweater,turtleneck,hoodie,cardigan,jacket,blazer,coat,vest,sailor collar,serafuku,school uniform,camisole,off-shoulder shirt')],
    ['bottom', 'Bottom', L('skirt,pleated skirt,miniskirt,long skirt,pencil skirt,shorts,short shorts,denim shorts,pants,jeans')],
    ['dress', 'Dress or set', L('dress,sundress,white dress,black dress,sweater dress,china dress,wedding dress,gown,maid,maid apron,kimono,yukata,overalls,bodysuit,armor,robe,witch')],
    ['legs', 'Legwear', L('thighhighs,black thighhighs,white thighhighs,pantyhose,black pantyhose,kneehighs,socks,zettai ryouiki,garter straps,leggings')],
    ['shoes', 'Shoes', L('shoes,boots,knee boots,thigh boots,ankle boots,high heels,loafers,sneakers,sandals,mary janes,barefoot')],
    ['acc', 'Accessories', L('necktie,bowtie,ribbon,choker,necklace,earrings,gloves,fingerless gloves,elbow gloves,scarf,belt,bag,hat,beret,witch hat,wristwatch,bracelet,cape,hood')]]]];
export const LOOK_FIELDS = LOOK_SECTIONS.flatMap(([s, , f]) => f.map(x => ({sec:s, k:x[0], name:x[1], opts:x[2], one:!!x[3]})));
export const lookOf = o => Object.fromEntries(LOOK_FIELDS.map(f => [f.k, Array.isArray(o && o[f.k]) ? o[f.k].filter(t => typeof t==='string' && t.trim()).map(t => t.trim()) : []]));
const colourOf = t => t.replace(/\s+hair$/, '');
// the tags her look writes, in a natural order; the colour rules: 2+ hair colours → multicolored hair (+ how they mix), 2+ eye colours → heterochromia
export function lookTags(o){ const k = lookOf(o), out = [], hc = k.hcol, mix = k.hmix[0] || '';
  out.push(...hc); if(hc.length > 1 || mix) out.push('multicolored hair');
  if(mix) out.push(mix); if(mix==='colored tips' && hc.length > 1) out.push(hc.slice(1).map(colourOf).join(' and ') + ' tips'); // base first, then her tips
  out.push(...k.hx, ...k.ecol); if(k.ecol.length > 1) out.push('heterochromia');
  for(const f of ['ex', 'skin', 'top', 'bottom', 'dress', 'legs', 'shoes', 'acc']) out.push(...k[f]);
  return [...new Set(out)].join(', '); }
// every tag a look could have written, so the 🎨 box can take the old ones out
export const lookWords = o => new Set(lookTags(o).split(', ').filter(Boolean).map(t => t.toLowerCase()));

// ---- the searchable picker: the field's own list first, then the whole Danbooru list (../tags.txt), and “Add” for anything typed
let TAGS = null; export const COUNT = new Map(); // how often Danbooru uses each tag: the wording Illustrious knows best is the most used
export function loadTags(url){ return TAGS || (TAGS = fetch(url).then(r => r.ok ? r.text() : '').then(t => t.split('\n').map(l => { const f = l.split('\t');
  if(!f[0]) return null; const x = {t:f[0].replace(/_/g, ' '), n:+f[2] || 0, a:(f[3] || '').replace(/_/g, ' ')}; COUNT.set(x.t, x.n); return /[eg]/.test(f[4] || '') ? null : x; }).filter(Boolean)).catch(() => [])); }
export const countText = t => { const n = COUNT.get(t); return n==null ? '' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };
export function search(list, own, q, max = 30){ q = q.trim().toLowerCase(); const mine = own.filter(t => !q || t.includes(q)); if(!q) return mine;
  const seen = new Set(mine), pre = [], mid = [];
  for(const x of list || []){ if(seen.has(x.t)) continue; if(x.t.startsWith(q) || x.t.includes(' ' + q)) pre.push(x); else if(x.t.includes(q) || x.a.includes(q)) mid.push(x); if(pre.length >= max) break; }
  return mine.concat(pre.concat(mid).slice(0, max).map(x => x.t)); }

// ---- 🎨 her picks as colours on the mannequin (Jordan 2026-10-28: "to help visualize"). Only the 3D view: the guides Illustrious
// gets are her skeleton and a depth picture, which never see these colours. Clothes are painted onto her skin by height and limb.
export const COL = {black:'#2a2a30', white:'#f2f2f0', grey:'#9a9ca3', gray:'#9a9ca3', silver:'#c9ccd3', brown:'#7a5236', blonde:'#f0d27a', red:'#d23b3b', orange:'#ee8a3a',
  pink:'#f49ac0', purple:'#8d5bc0', blue:'#3f6fd1', 'light blue':'#9cc8f2', 'dark blue':'#26386e', navy:'#26386e', aqua:'#3fc6c4', green:'#4f9e55',
  yellow:'#f1d24a', gold:'#d9b04a', beige:'#d9c7a6', denim:'#4b6c9c'};
export const colourIn = t => { const m = Object.keys(COL).sort((a, b) => b.length - a.length).find(c => new RegExp('\\b' + c + '\\b').test(t)); return m ? COL[m] : null; };
const SKIN = {'pale skin':'#f7e9df', tan:'#d3a27c', 'dark skin':'#8c5d40', 'dark-skinned female':'#8c5d40'}, SKIN0 = '#f2dccb';
// what each piece covers: rest heights as a share of her joints (0 ankle … 1 hip joint … 2 neck), sleeves, and its usual colour
export const PIECES = [
  [/thighhighs|thigh highs|over-kneehighs/, 'legs', 'below', 0.72, '#2a2a30'], [/pantyhose|leggings|tights/, 'legs', 'below', 1.05, '#2a2a30'], [/kneehighs/, 'legs', 'below', 0.42, '#2a2a30'], [/socks/, 'legs', 'below', 0.15, '#f2f2f0'],
  [/jeans|pants|trousers/, 'bottom', 'span', [0, 1.12], '#3a3d48'], [/long skirt/, 'bottom', 'span', [0.3, 1.12], '#26386e'], [/pencil skirt/, 'bottom', 'span', [0.5, 1.12], '#2a2a30'],
  [/shorts/, 'bottom', 'span', [0.78, 1.12], '#4b6c9c'], [/skirt/, 'bottom', 'span', [0.72, 1.12], '#26386e'],
  [/gown|wedding dress|kimono|yukata|robe/, 'dress', 'span', [0.02, 1.95], '#f2f2f0', 'long'], [/sweater dress/, 'dress', 'span', [0.68, 1.95], '#d9c7a6', 'long'],
  [/maid/, 'dress', 'span', [0.55, 1.95], '#2a2a30', 'short'], [/witch/, 'dress', 'span', [0.15, 1.95], '#2a2a30', 'long'], [/china dress/, 'dress', 'span', [0.4, 1.95], '#d23b3b'],
  [/sundress/, 'dress', 'span', [0.55, 1.88], '#f2f2f0'], [/overalls/, 'dress', 'span', [0, 1.8], '#4b6c9c'], [/bodysuit/, 'dress', 'span', [0.9, 1.95], '#2a2a30', 'long'],
  [/armor/, 'dress', 'span', [0.6, 1.95], '#c9ccd3', 'long'], [/dress/, 'dress', 'span', [0.55, 1.95], '#9cc8f2', 'short'],
  [/tank top|camisole/, 'top', 'span', [1.15, 1.88], '#f2f2f0'], [/crop top/, 'top', 'span', [1.45, 1.88], '#f2f2f0'],
  [/hoodie/, 'top', 'span', [1.05, 1.98], '#9a9ca3', 'long'], [/jacket|blazer|coat/, 'top', 'span', [1.05, 1.98], '#26386e', 'long'], [/sweater|turtleneck|cardigan/, 'top', 'span', [1.05, 1.98], '#d9c7a6', 'long'], [/vest/, 'top', 'span', [1.1, 1.9], '#7a5236'],
  [/serafuku|sailor|school uniform/, 'top', 'span', [1.1, 1.97], '#f2f2f0', 'long'], [/shirt|blouse|t-shirt/, 'top', 'span', [1.1, 1.96], '#f2f2f0', 'short'],
  [/thigh boots/, 'shoes', 'below', 0.75, '#2a2a30'], [/knee boots/, 'shoes', 'below', 0.5, '#7a5236'], [/boots/, 'shoes', 'below', 0.22, '#7a5236'],
  [/sneakers/, 'shoes', 'below', 0.03, '#f2f2f0'], [/high heels|mary janes|loafers|shoes|sandals/, 'shoes', 'below', 0.03, '#2a2a30'],
  [/elbow gloves/, 'gloves', 'arm', 0.55], [/gloves/, 'gloves', 'arm', 0.92]];
const ORDER = ['legs', 'bottom', 'dress', 'top', 'shoes', 'gloves'];
const hairCol = t => colourIn(t.replace(/\s+hair$/, '')) || COL.brown;
export function paintLook(w, look, on = true){ const k = lookOf(look), body = w.userData.body; w.updateMatrixWorld(true);
  const bone = n => { let b = null; body.traverse(x => { if(x.isBone && x.name===n && !b) b = x; }); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  const yAnk = bone('bn_footL').y, yHip = bone('bn_thigh01L').y, yNeck = bone('bn_head').y, sh = bone('bn_upperarm01L'), hand = bone('bn_handL');
  const lvl = y => y < yHip ? Math.max(0, (y - yAnk) / (yHip - yAnk)) : 1 + (y - yHip) / (yNeck - yHip); // 0 ankle, 1 hip joint, 2 neck
  const skin = new THREE.Color(SKIN[k.skin.find(t => SKIN[t])] || SKIN0), C = new THREE.Color(), V = new THREE.Vector3();
  // her clothes, layered from the inside out
  const worn = []; for(const f of ['legs', 'bottom', 'dress', 'top', 'shoes', 'acc']) for(const t of k[f]){ const P = PIECES.find(p => p[0].test(t)); if(P) worn.push({t, kind:P[1], how:P[2], a:P[3], col:new THREE.Color(colourIn(t) || P[4] || '#f2f2f0'), sl:P[5] || ''}); }
  worn.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const armLen = sh.distanceTo(hand), ARM = /upperarm|forearm|hand|index|middle|ring|pinky|thumb/; // how far down her arm: 0 shoulder … 1 wrist
  body.traverse(m => { if(!m.isSkinnedMesh) return; m.material = m.userData.mat0 || m.material; m.userData.mat0 = m.material; if(!on) return;
    const pos = m.geometry.attributes.position, n = pos.count, col = new Float32Array(n * 3), eye = /EyeBall/i.test(m.name), mouth = /Mouth/i.test(m.name);
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, armBone = m.skeleton.bones.map(b => ARM.test(b.name));
    const ec = k.ecol.map(t => new THREE.Color(colourIn(t.replace(/\s+eyes$/, '')) || '#5a4a3a'));
    for(let i = 0; i < n; i++){ m.getVertexPosition(i, V).applyMatrix4(m.matrixWorld);
      if(eye){ C.set(ec.length ? ec[ec.length > 1 && V.x < 0 ? 1 : 0] : '#5a5f6b'); }
      else if(mouth) C.set('#b0505a');
      else { C.copy(skin); let bi = 0, bw = -1; for(let j = 0; j < 4; j++){ const wj = sw.getComponent(i, j); if(wj > bw){ bw = wj; bi = si.getComponent(i, j); } }
        const L = lvl(V.y), arm = armBone[bi], r = arm ? V.distanceTo(sh.clone().setX(Math.sign(V.x || 1) * Math.abs(sh.x))) / armLen : -1;
        for(const x of worn){
          if(x.kind==='gloves'){ if(arm && r >= x.a) C.copy(x.col); continue; }
          if(arm){ if((x.kind==='top' || x.kind==='dress') && L <= x.a[1] + 0.05 && ((x.sl==='long' && r < 0.93) || (x.sl==='short' && r < 0.35))) C.copy(x.col); continue; }
          if(x.how==='below' ? L <= x.a : L >= x.a[0] && L <= x.a[1]) C.copy(x.col); } }
      col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); const mt = m.material.clone(); mt.vertexColors = true; mt.color.set(0xffffff); m.material = mt; });
  // her hair: one colour, or how two mix (tips, two-tone, split, streaks, gradient, inner)
  const hg = w.userData.hair; if(!hg) return; const hc = (k.hcol.length ? k.hcol : ['brown hair']).map(t => new THREE.Color(hairCol(t))), mix = k.hmix[0] || (hc.length > 1 ? 'streaked hair' : '');
  let ci = 0; hg.traverse(m => { if(!m.isMesh) return; m.material = m.userData.mat0 || m.material; m.userData.mat0 = m.material; if(!on) return;
    const pos = m.geometry.attributes.position, n = pos.count, col = new Float32Array(n * 3); let lo = 9, hi = -9; for(let i = 0; i < n; i++){ lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
    const other = hc[1 + (ci % Math.max(1, hc.length - 1))] || hc[0], streak = ci % 3===1; ci++;
    for(let i = 0; i < n; i++){ const t = hi - lo > 0.05 ? (hi - pos.getY(i)) / (hi - lo) : 0; let c = hc[0];
      if(hc.length > 1){ if(mix==='colored tips') c = t > 0.68 ? other : hc[0]; else if(mix==='gradient hair') c = C.copy(hc[0]).lerp(hc[1], t);
        else if(mix==='split-color hair') c = pos.getX(i) < 0 ? hc[1] : hc[0]; else if(mix==='two-tone hair') c = t > 0.5 ? hc[1] : hc[0];
        else if(mix==='colored inner hair') c = pos.getZ(i) < -0.02 && t > 0.3 ? hc[1] : hc[0]; else c = streak ? other : hc[0]; }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); const mt = m.material.clone(); mt.vertexColors = true; mt.color.set(0xffffff); m.material = mt; }); }
