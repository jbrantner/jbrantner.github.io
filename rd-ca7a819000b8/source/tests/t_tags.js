// The prompt reader: written sentences turned into Danbooru tags. Runs the app's own reader code (from the prompt
// reader section to addTag in comfy-app.html) in Node with the real tags.txt, chars.txt and words.txt, on a few hundred
// everyday prompts: typos, word forms, tags written in other words or orders, characters and their series, names that
// are also everyday words, adult tags kept out unless typed, and prompts that are already tags.
// Run: node tests/t_tags.js
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..'), ROOT = path.join(SRC, '..');
const html = fs.readFileSync(path.join(SRC, 'comfy-app.html'), 'utf8');
const tagText = html.match(/function tagText\(t\)\{[\s\S]*?\n\}\n/)[0];
const code = tagText + html.slice(html.indexOf('// ---------- prompt reader'), html.indexOf('function addTag('));
const lines = f => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
const TAGS = lines('tags.txt').filter(Boolean).map(l => { const [tag, cat, n, al, fl, ser] = l.split('\t'); return {tag, cat, n:+n, al: al ? al.split(',') : [], fl: fl || '', ser: ser || ''}; });
const CHARS = new Map(); lines('chars.txt').forEach(l => { const [tag, g, b, o] = l.split('\t'); if(tag) CHARS.set(tag, [+g, +b, +o]); });
const WORDS = new Set(), EVERY = new Set(), COMMON = new Set(); let part = 0;
lines('words.txt').forEach(l => { if(l === '#') part++; else if(l){ WORDS.add(l); if(part === 0) EVERY.add(l); if(part === 2) COMMON.add(l); } });
const S = {prompt:'', tagOn:[], tagOff:[], asTags:true, addedTags:[], peopleOff:false};
const R = new Function('TAGS', 'CHARS', 'WORDS', 'EVERY', 'COMMON', 'S', 'usesTags', code + '\nreturn {readPrompt, sentPrompt, pickedFor, indexTags};')(TAGS, CHARS, WORDS, EVERY, COMMON, S, () => true);
const FLAG = new Set(TAGS.filter(t => t.fl === 'x').map(t => t.tag));

let t0 = Date.now(); R.indexTags(); const tIndex = Date.now() - t0;
const key = s => s.replace(/\\/g, '').trim().toLowerCase().replace(/ /g, '_');
function run(prompt, opt = {}){
  Object.assign(S, {prompt, tagOn:[], tagOff:[], asTags:true, addedTags:[], peopleOff:false}, opt);
  const pieces = R.readPrompt(prompt), picked = R.pickedFor(pieces), send = R.sentPrompt();
  const chips = pieces.flatMap(p => p.phrases.flatMap(ph => ph.tags.map(t => t.tag)));
  const rows = pieces.flatMap(p => p.phrases.map(ph => ph.words));
  return {send, items: send.split(', ').map(key), chips, picked, rows, pieces};
}
let fails = 0, n = 0;
const fail = (p, why, r) => { fails++; console.log(`✗ ${p}\n    ${why}\n    sends: ${r.send}\n    chips: ${r.chips.map(t => (r.picked.has(t) ? '✓' : '·') + t).join(' ')}`); };
// has: tags (or words) Render must send; not: tags that must be neither sent nor offered; notSend: not sent (an unticked chip is fine);
// notChip: not offered (the same word may still go as a word); send / start: the exact prompt or its start; rows: the row labels
function check(prompt, x){
  n++; const r = run(prompt, x.opt);
  for(const h of [].concat(x.has || [])) if(!r.items.includes(key(h))) return fail(prompt, 'missing ' + h, r);
  for(const h of [].concat(x.not || [])) if(r.items.includes(key(h)) || r.chips.includes(key(h))) return fail(prompt, 'should not have ' + h, r);
  for(const h of [].concat(x.notSend || [])) if(r.items.includes(key(h))) return fail(prompt, 'should not send ' + h, r);
  for(const h of [].concat(x.notChip || [])) if(r.chips.includes(key(h))) return fail(prompt, 'should not offer ' + h, r);
  if(x.send != null && r.send !== x.send) return fail(prompt, 'expected: ' + x.send, r);
  if(x.start && !r.send.startsWith(x.start)) return fail(prompt, 'expected start: ' + x.start, r);
  if(x.rows && r.rows.join('|') !== x.rows) return fail(prompt, 'rows ' + r.rows.join('|') + ' expected ' + x.rows, r);
  if(!x.adult){ const bad = r.chips.concat(r.items).find(t => FLAG.has(t)); if(bad) return fail(prompt, 'adult tag ' + bad, r); }
}

// ---- the prompt from Jordan's screenshot ----
check('freiren casting an epic magic spell', {has:['1girl', 'solo', 'frieren', 'sousou_no_frieren', 'casting_spell', 'magic', 'epic'],
  not:['hitachi_magic_wand', 'magic:_the_gathering', 'epic_seven'], send:'1girl, solo, frieren, sousou no frieren, casting spell, epic, magic'});
check('frieren casting a spell', {has:['frieren', 'sousou_no_frieren', 'casting_spell']});
check('1girl, freiren, casting a spell', {send:'1girl, frieren, sousou no frieren, casting spell'});

// ---- typos ----
check('a girl with long hiar holdign a sword in a classrom', {has:['long_hair', 'holding_sword', 'classroom'], not:['long_sword']});
check('pikachuu', {has:['pikachu', 'pokemon']});
check('hatsune mkiu', {has:['hatsune_miku', 'vocaloid']});
check('hatsnue miku', {has:['hatsune_miku']});
check('a girl in a schol uniform', {has:['school_uniform']});
check('a girl with blond hiar', {has:['blonde_hair']});
check('smilling', {has:['smile']});
check('a girl with twintials', {has:['twintails']});
check('a girl in a classrom', {has:['classroom']});
check('reimuu', {has:['hakurei_reimu']});
check('a beach with vibrant colors', {has:['beach', 'vibrant colors'], not:['vibrator']});
check('a girl in a sweater', {has:['sweater'], not:['sweat']});
check('a girl with a ponytial', {has:['ponytail']});

// ---- other forms of a word ----
check('she casts a spell', {has:['casting_spell']});
check('a girl holds a cup', {has:['holding_cup']});
check('she sat on a bench', {has:['sitting']});
check('a girl, the girl waves', {send:'1girl, solo, waving'});
check('she smiles and waves', {has:['smile', 'waving'], notSend:['waves']});
check('ocean waves', {has:['ocean', 'waves'], notSend:['waving']});
check('a dressed up girl', {not:['dress']});
check('a girl blushing', {has:['blush']});
check('a girl smiling', {has:['smile']});
check('two cats sleeping', {has:['cat', 'sleeping']});
check('a girl with flowers in her hair', {has:['hair_flower']});
check('a boy and a girl on a date', {has:['dating'], not:['dated']});
check('a girl casting', {not:['cast']});
check('crossed arms', {has:['crossed_arms']});
check('a girl hugging a teddy bear', {has:['hug', 'teddy_bear']});
check('two girls kissing', {has:['2girls', 'kiss']});
check('a girl winking', {has:['one_eye_closed'], not:['winking_(animated)']});
check('she is running', {has:['running']});
check('she ran', {has:['running']});
check('a girl crying', {has:['crying']});
check('a girl reading books', {has:['reading', 'book']});

// ---- tags written in other words, or another order ----
check('a girl with long red hair and green eyes', {has:['long_hair', 'red_hair', 'green_eyes']});
check('her hair is long and blonde', {has:['long_hair', 'blonde_hair']});
check('a girl holding a sword and a shield', {has:['holding_sword', 'holding_shield']});
check('a girl holding a cat in her arms', {has:['holding_cat']});
check('a girl without glasses', {has:['no_eyewear'], not:['glasses']});
check('a girl not wearing a hat', {not:['hat'], send:'1girl, solo, not wearing a hat'});
check('a girl without a sword or a shield', {not:['sword', 'shield'], send:'1girl, solo, without a sword or a shield'});
check('a girl with no shoes', {has:['no_shoes'], not:['shoes']});
check('a mermaid sitting on a rock by the sea', {has:['mermaid', 'sitting', 'on_rock'], not:['sitting_on_person']});
check('a girl sitting cross legged reading a book', {has:['sitting', 'indian_style', 'reading', 'book'], not:['cross']});
check('a girl lying on her back in a field of flowers', {has:['lying', 'on_back', 'flower_field']});
check('a girl sitting on the floor hugging her knees', {has:['sitting', 'on_floor', 'hugging_own_legs']});
check("close up of a girl's face", {has:['close-up'], not:['facing_up']});
check('dramatic lighting with rim light', {has:['backlighting']});
check('a fox girl with nine tails', {has:['fox_girl', 'multiple_tails']});
check('a knight with a sword in her hand', {has:['knight', 'holding_sword']});
check('she has her hands on her hips', {has:['hands_on_own_hips']});
check('a girl with her hand on her chest', {has:['hand_on_own_chest']});
check('lying on her back in a field of flowers', {has:['on_back', 'flower_field']});
check('a girl lying on her stomach', {has:['on_stomach']});
check('looking at the camera with a smile', {has:['looking_at_viewer', 'smile']});
check('makima smiling at the viewer', {has:['makima_(chainsaw_man)', 'smile', 'looking_at_viewer']});
check('seen from behind', {send:'from behind'});
check('a view from above of a city at night', {has:['from_above', 'city', 'night']});
check('a girl from below', {has:['from_below']});
check('her eyes closed and smiling', {has:['closed_eyes', 'smile']});
check('spell casting with a glowing staff', {has:['casting_spell', 'staff']});
check('arms crossed and pouting', {has:['crossed_arms', 'pout']});
check('sitting on a chair with her legs crossed', {has:['sitting', 'crossed_legs']});
check('a girl with a ribbon in her hair', {has:['hair_ribbon']});
check('a tattoo on her back', {has:['back_tattoo'], not:['on_back']});
check('a girl with a sword on her back', {has:['sword_on_back']});
check('a girl with a cat on her head', {has:['cat_on_head']});
check('a girl with very long hair', {has:['very_long_hair'], not:['long_hair']});
check('a girl with red and blue eyes', {has:['red_eyes', 'blue_eyes']});
check('a girl with blue eyes and blonde hair', {has:['blue_eyes', 'blonde_hair'], not:['blue_hair']});
check('a red dress and long hair', {has:['red_dress', 'long_hair'], not:['red_hair']});
check('two girls holding hands', {has:['2girls', 'holding_hands'], not:['two-handed']});
check("a woman holding her daughter's hand", {send:'2girls, multiple girls, mature female, holding hands'});
check('a girl in a hoodie with headphones around her neck', {has:['hoodie', 'headphones_around_neck']});
check('a girl riding a bike', {has:['riding_bicycle']});
check('hatsune miku holding a leek', {has:['hatsune_miku', 'holding_spring_onion']});
check('a girl playing the guitar', {has:['playing_guitar']});
check('a black and white photo', {has:['greyscale']});
check('close up of her face', {has:['close-up']});
check('a girl doing a peace sign', {has:['v']});
check('a cat girl with cat ears and a tail', {has:['cat_girl', 'cat_ears', 'tail']});
check('a girl in a school uniform in a classroom', {has:['school_uniform', 'classroom']});
check('a girl wearing a red dress and a hat', {has:['red_dress', 'hat'], not:['red_hat', 'wearing']});
check('a woman in a kimono under cherry blossoms', {has:['mature_female', 'kimono', 'cherry_blossoms'], not:['under']});
check('a girl with short silver hair', {has:['short_hair', 'grey_hair']});
check('a girl wearing glasses and a sweater', {has:['glasses', 'sweater']});
check('a girl with angel wings and a halo', {has:['angel_wings', 'halo']});
check('a demon girl with horns and a tail', {has:['demon_girl', 'horns', 'tail']});
check('a witch with a pointy hat riding a broom', {has:['witch_hat', 'broom_riding']});
check('a girl with her hands behind her head', {has:['arms_behind_head']});
check('a girl stretching her arms up', {has:['stretching', 'arms_up']});
check('a girl with a magic circle under her feet', {has:['magic_circle']});
check('a magical girl with a magic wand', {has:['magical_girl', 'wand'], not:['hitachi_magic_wand']});
check('a girl wearing a one piece swimsuit', {has:['one-piece_swimsuit'], not:['one_piece']});
check('a girl with a bow and arrow', {has:['bow_(weapon)'], not:['hair_bow']});
check('a girl with a red bow in her hair', {has:['hair_bow']});
check('a cyberpunk city with neon lights', {has:['cyberpunk', 'neon_lights']});
check('a girl taking a selfie with her phone', {has:['selfie']});
check('full body shot of a girl standing', {has:['full_body', 'standing']});
check('a girl sitting on a bed reading a book', {has:['sitting', 'on_bed', 'reading', 'book']});
check('a girl in a white dress at the beach at sunset', {has:['white_dress', 'beach', 'sunset']});
check('a girl with red eyes and white hair holding an umbrella in the rain', {has:['red_eyes', 'white_hair', 'holding_umbrella', 'rain']});
check('a maid serving tea', {has:['maid', 'tea']});
check('a girl with freckles and glasses', {has:['freckles', 'glasses']});
check('an old man with a beard', {has:['old_man', 'beard']});
check('a girl drinking tea', {has:['drinking', 'tea']});
check('a girl eating a banana', {has:['eating', 'banana']});
check('a fox girl with nine tails', {has:['fox_girl']});
check('a girl hypnotized with empty eyes', {has:['hypnosis', 'empty_eyes']});
check('A girl who is doing jumping jacks', {send:'1girl, solo, jumping, exercising, arms up', rows:'girl|jumping jacks'});

// ---- characters and their series ----
check('miku singing on a stage', {has:['hatsune_miku', 'vocaloid', 'singing', 'stage']});
check('reimu and marisa drinking tea at the shrine', {has:['2girls', 'hakurei_reimu', 'kirisame_marisa', 'touhou']});
check('luffy from one piece laughing', {has:['1boy', 'monkey_d._luffy', 'one_piece', 'laughing'], not:['from']});
check('luffy and zoro from one piece', {has:['2boys', 'monkey_d._luffy', 'roronoa_zoro', 'one_piece']});
check('asuka in her plugsuit', {has:['souryuu_asuka_langley', 'neon_genesis_evangelion', 'plugsuit'], not:['asuka_(senran_kagura)']});
check('asuka from senran kagura', {has:['asuka_(senran_kagura)'], not:['souryuu_asuka_langley']});
check('rem in a maid outfit', {has:['rem_(re:zero)', 'maid']});
check('2b standing in the ruins', {has:['2b_(nier:automata)', 'standing', 'ruins']});
check('gojo with a blindfold', {has:['1boy', 'gojou_satoru', 'jujutsu_kaisen', 'blindfold']});
check('nezuko running through a forest', {has:['kamado_nezuko', 'running', 'forest'], not:['through']});
check('naruto eating ramen', {has:['1boy', 'uzumaki_naruto', 'eating', 'ramen']});
check('frieren and fern walking on a road', {has:['2girls', 'frieren', 'fern_(sousou_no_frieren)', 'sousou_no_frieren', 'walking']});
check('stark and fern', {has:['stark_(sousou_no_frieren)', 'fern_(sousou_no_frieren)']});
check('zelda and purah', {send:'2girls, multiple girls, princess zelda, the legend of zelda, purah', rows:'zelda|purah'});
check('zelda and purah and link', {start:'2girls, multiple girls, 1boy, '});
check('zelda and link', {has:['princess_zelda', 'link', 'the_legend_of_zelda']});
check('mikasa from attack on titan', {has:['mikasa_ackerman', 'shingeki_no_kyojin']});
check('saber from fate holding excalibur', {has:['saber_(fate)', 'fate_(series)']});
check('rin from fate', {has:['tohsaka_rin']});
check('aqua from konosuba crying', {has:['aqua_(konosuba)', 'crying']});
check('hatsune miku and kagamine rin', {has:['hatsune_miku', 'kagamine_rin', 'vocaloid']});
check('raiden shogun from genshin', {has:['raiden_shogun', 'genshin_impact']});
check('a girl from blue archive with a halo', {has:['blue_archive', 'halo'], not:['king_halo_(umamusume)']});
check('pikachu and a girl', {has:['pikachu', 'pokemon']});
check('kirby', {has:['kirby', 'kirby_(series)']});
check('princess peach', {has:['princess_peach', 'mario_(series)'], not:['princess_peach_(cosplay)']});
check('sonic the hedgehog', {has:['sonic_the_hedgehog']});
check('goku', {has:['1boy', 'son_goku', 'dragon_ball']});
check('a boy named Link', {has:['1boy', 'link'], not:['2boys']});
check('dark magician girl from yugioh', {has:['1girl', 'dark_magician_girl', 'yu-gi-oh!'], not:['2girls']});
check('naruto and sasuke fighting', {has:['2boys', 'uzumaki_naruto', 'uchiha_sasuke', 'fighting']});
check('jojo', {has:['jojo_no_kimyou_na_bouken']});
check('Misty and Brock', {has:['misty_(pokemon)', 'brock_(pokemon)']});
check('frieren, sousou no frieren', {send:'1girl, solo, frieren, sousou no frieren'});
check('miku and teto', {has:['hatsune_miku', 'kasane_teto']});
check('megumin casting explosion', {has:['megumin']});
check('nahida from genshin impact', {has:['nahida_(genshin_impact)', 'genshin_impact']});
check('marin kitagawa', {has:['kitagawa_marin']});

// ---- everyday words that are also names, and words that are also odd tags ----
check('link', {send:'link'});
check('fern', {send:'fern', not:['fern_(sousou_no_frieren)']});
check('sakura', {not:['kinomoto_sakura', 'cardcaptor_sakura', 'sakura_kyoko']});
check('a link in a chain', {send:'link, chain', notChip:['link']});
check('the red hair', {has:['red_hair'], not:['red_(pokemon)']});
check('a blue sky', {has:['blue_sky']});
check('a girl with silver hair', {not:['silver_(pokemon)']});
check('fire', {not:['fire_emblem']});
check('epic battle scene', {has:['battle'], not:['epic_seven']});
check('a cute girl with a big smile', {has:['smile'], not:['big_man_(splatoon)', 'the_big_o']});
check('a girl and her cat', {has:['cat'], not:['girl_holding_a_cat_(kancolle)']});
check('a muscular man with a sword', {has:['1boy', 'muscular', 'sword'], not:['katana_man_(chainsaw_man)']});
check('a stark contrast', {not:['stark_(sousou_no_frieren)']});
check('ruby earrings', {not:['ruby_rose']});
check('a girl at the beach', {has:['beach']});
check('a girl with a gun', {has:['gun']});
check('a girl holding a katana', {has:['holding_sword']});
check('a knight in shining armor', {has:['knight', 'armor'], not:['shining_(series)']});
check('a rainy night in tokyo', {has:['rain', 'night', 'tokyo_(city)'], not:['tokyo_afterschool_summoners']});
check('a misty forest at dawn', {has:['fog', 'forest', 'dawn'], not:['misty_(pokemon)', 'dawn_(pokemon)', '2girls']});
check('misty, dawn, forest', {not:['misty_(pokemon)', 'dawn_(pokemon)']});
check('snowy mountains under a starry night', {has:['snow', 'mountain', 'starry_sky', 'night']});

// ---- adult tags: only when their own words are typed ----
check('a magic wand', {has:['wand'], not:['hitachi_magic_wand']});
check('a girl drinking milk in the kitchen', {has:['milk', 'kitchen']});
check('a girl licking a lollipop', {has:['lollipop']});
check('a girl on a bed', {has:['on_bed'], not:['bed_invitation']});
check('a girl tied up with rope', {not:['bondage']});
check('a girl holding a cucumber', {has:['cucumber']});
check('spread her arms', {has:['spread_arms']});
check('a girl in a bikini showing cleavage', {has:['bikini', 'cleavage'], adult:true});
check('a girl with large breasts', {has:['large_breasts']});
check('a girl in a swimsuit at the pool', {has:['swimsuit', 'pool']});

// ---- prompts that are tags already, weights, and the switches ----
check('masterpiece, best quality, 1girl, solo, long hair', {send:'masterpiece, best quality, 1girl, solo, long hair'});
check('(masterpiece:1.2), a girl with (long hair:1.3) and a hat', {has:['(masterpiece:1.2)', '(long_hair:1.3)', 'hat'], not:['long_hair']});
check('embedding:easynegative, a girl', {has:['embedding:easynegative', '1girl']});
check('a girl hitting another girl', {send:'2girls, multiple girls, hitting'});
check('A girl who is doing jumping jacks', {send:'1girl, solo, A girl who is doing jumping jacks', opt:{asTags:false}});
check('a girl with long red hair', {send:'1girl, solo, long hair', opt:{tagOff:['red_hair']}});
check('a girl with long hair', {send:'1girl, solo, long hair, very long hair', opt:{tagOn:['very_long_hair']}});
check('a girl with long hair', {send:'long hair', opt:{peopleOff:true, tagOff:['1girl', 'solo']}});

// ---- the rows the panel shows: a tag appears once, the label is the words that were read ----
{
  n++; const r = run('freiren casting an epic magic spell');
  const rows = r.pieces[0].phrases.map(ph => ph.words + ' → ' + ph.tags.map(t => t.tag).join(' '));
  if(rows[0] !== 'freiren → frieren sousou_no_frieren' || !/^casting … spell → casting_spell/.test(rows[1]) || !/^magic → magic/.test(rows[2]))
    fail('rows for the screenshot prompt', rows.join(' / '), r);
  const all = r.chips; if(new Set(all).size !== all.length) fail('a chip shown twice', all.join(' '), r);
}
{
  n++; const r = run('zelda and purah, zelda');
  if(r.chips.filter(t => t === 'the_legend_of_zelda').length !== 1) fail('series chip shown twice', '', r);
}

// ---- speed: building the index once, and reading a prompt ----
{
  n++; const p = 'freiren and fern casting an epic magic spell in a classroom at night, long red hair, holding a sword and a shield';
  t0 = Date.now(); for(let i = 0; i < 20; i++){ S.prompt = p + ' ' + i; R.readPrompt(S.prompt); } const each = (Date.now() - t0) / 20;
  console.log(`index ${tIndex} ms, a long prompt ${each.toFixed(1)} ms`);
  if(tIndex > 1500 || each > 60) { fails++; console.log('✗ too slow'); }
}
console.log(fails ? `${fails} of ${n} failed` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
