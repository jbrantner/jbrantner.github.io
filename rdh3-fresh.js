// 🧹 Fresh start (Jordan 2026-11-08: "purge all images from the app… I want to start over. The app is good, keep the app").
// Runs once per phone, before Render Deck or H3 Deck reads its storage: every take, film, picture, Library entry, character,
// pose and scene goes; settings stay (which PCs, model and look choices, LoRA trigger words, Civitai key stays on the PCs).
(function(){
  var MARK = 'rdh3-fresh', WHEN = '2026-11-08';
  if(location.hostname!=='jbrantner.github.io') return; // (tests and local copies keep their storage)
  try{ if(localStorage.getItem(MARK)===WHEN) return; }catch(e){ return; }
  var get = function(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } };
  var put = function(k, v){ try{ if(v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); }catch(e){} };
  var prims = function(o, drop){ var out = {}; if(!o) return out; Object.keys(o).forEach(function(k){ var v = o[k];
    if(drop.indexOf(k) < 0 && ((typeof v==='string' && !/^data:|^blob:/.test(v) && v.length < 2000) || typeof v==='number' || typeof v==='boolean')) out[k] = v; }); return out; };
  // H3 Deck: PCs and the look of the form (model, size, how many takes, where) stay; takes, films' casts, pictures, Library go
  var d = get('h3deck');
  if(d){ var n = prims(d, ['fkey', 'fmig']); if(d.pcs) n.pcs = d.pcs;
    var f = {}, LOOK = ['model', 'turbo', 'aspect', 'mp', 'takes', 'where', 'steps', 'maxPiece', 'h3', 'h3Style']; if(d.f) LOOK.forEach(function(k){ if(d.f[k] !== undefined) f[k] = d.f[k]; });
    n.f = f; n.fkey = ''; n.lib = []; n.cast = []; n.casts = {}; n.forms = {}; n.takes = []; n.media = {}; put('h3deck', n); }
  // 🎞 Films: settings stay (strength, model pick, bare bones…), every film goes
  var e2 = get('h3edit'); if(e2) put('h3edit', prims(e2, []));
  ['h3film', 'h3pk-v1', 'h3touch', 'rd-scenes', 'rd-pose-sprites', 'rd-mocap', 'rd-mocap-draft', 'rd-posebook', 'rd-envs', 'rd-poses', 'rd-mq-ch1', 'rd-pose-rig-v1'].forEach(function(k){ put(k, null); });
  try{ for(var i = localStorage.length - 1; i >= 0; i--){ var k = localStorage.key(i); if(k && /^rd-pose-rig-|^rd-chars|^rd-char-|^h3touch/.test(k)) localStorage.removeItem(k); } }catch(e){}
  // Render Deck: the computers, the recipe blocks, model styles and LoRA words stay; the gallery, queue, Hidden, characters, comic go
  var r = get('render-deck-v1');
  if(r){ var m = prims(r, ['prompt', 'negative', 'hidden']); ['servers', 'pcOff', 'styles', 'styleText', 'loraWords'].forEach(function(k){ if(r[k] !== undefined) m[k] = r[k]; });
    m.blocks = (r.blocks || []).filter(function(b){ return b && (b.type==='model' || b.type==='sampler'); }); m.prompt = ''; m.negative = r.negative || ''; m.gallery = []; m.queue = []; m.hidden = false; put('render-deck-v1', m); }
  try{ indexedDB.deleteDatabase('h3deck'); indexedDB.deleteDatabase('h3touch'); }catch(e){}
  try{ if(window.caches) caches.keys().then(function(ks){ ks.forEach(function(k){ if(/media|thumb|img/i.test(k)) caches.delete(k); }); }); }catch(e){}
  try{ localStorage.setItem(MARK, WHEN); }catch(e){}
})();
