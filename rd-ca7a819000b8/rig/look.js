// 👗 her look picked from searchable Danbooru tag lists, in sections (Jordan 2026-10-28: "a drop-down menu of searchable tags for
// sectioned off areas like a hair section where it asks for color"). Every field takes more than one tag and any custom tag;
// two hair colours add multicolored hair, and Tips makes the first colour her base and the others her tips.
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
