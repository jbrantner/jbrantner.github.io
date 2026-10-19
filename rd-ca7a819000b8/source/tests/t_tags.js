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
const R = new Function('TAGS', 'CHARS', 'WORDS', 'EVERY', 'COMMON', 'S', 'usesTags', code + '\nreturn {readPrompt, sentPrompt, pickedFor, indexTags, ratingOf};')(TAGS, CHARS, WORDS, EVERY, COMMON, S, () => true);
const FLAG = new Set(TAGS.filter(t => t.fl).map(t => t.tag));

let t0 = Date.now(); R.indexTags(); const tIndex = Date.now() - t0;
const key = s => s.replace(/\\/g, '').trim().toLowerCase().replace(/ /g, '_');
function run(prompt, opt = {}){
  Object.assign(S, {prompt, tagOn:[], tagOff:[], asTags:true, addedTags:[], peopleOff:false, chars:[], loraWords:{}}, opt);
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
check('nezko kamado running in a forest', {has:['kamado_nezuko', 'kimetsu_no_yaiba', 'running', 'forest'], not:['cat']}); // a typo beside a word of a name is that name's word (no neko)
check('tohsaka rinn', {send:'1girl, solo, tohsaka rin, fate \\(series\\)'}); check('son goko', {send:'1boy, solo, son goku, dragon ball'}); // (no ring, no gokou ruri)
check('gojo satru', {send:'1boy, solo, gojou satoru, jujutsu kaisen'}); check('tanjro kamado with a sword', {has:['kamado_tanjirou', 'sword']});
check('a magicial girl transforming', {not:['magician', 'dark_magician_girl']}); // an everyday word beside it only for a two-word name
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

// ---- everyday words that are also adult or odd tags: mild adult tags (flag w) only in a plainly adult prompt ----
check('a girl on top of a hill at sunset', {send:'1girl, solo, hill, sunset', not:['girl_on_top']});
check('a cat girl on top of a bookshelf', {has:['cat_girl', 'bookshelf'], not:['girl_on_top']});
check('a nude girl on top of a man', {has:['nude', 'girl_on_top'], adult:true});
check('nsfw, a girl on top of a man', {has:['girl_on_top'], adult:true});
check('a girl in a missionary position', {has:['missionary'], adult:true});
check('a missionary preaching in a village', {has:['village'], not:['missionary']});
check('a bottomless pit in a dark cave', {has:['cave'], not:['bottomless']});
check('a bottomless woman in an oversized shirt', {has:['bottomless', 'oversized_shirt'], adult:true});
check('a girl presenting a bouquet of flowers', {send:'1girl, solo, presenting bouquet, flower', not:['presenting']}); // the word goes with the next item
check('a running gag', {send:'running gag'});
check('a man in boxers', {has:['1boy'], not:['boxers']});
check('a girl adjusting the strap on her bag', {has:['bag'], not:['strap-on']});
check('a violinist tuning the g string', {not:['g-string']});
check('a girl wearing a g-string', {has:['g-string'], adult:true}); // typed with its hyphen
check('a woman in a wet see-through shirt', {has:['wet_shirt', 'see-through_shirt'], adult:true});
check('a hot summer day in the heat of the city', {has:['summer', 'city'], not:['in_heat']});
check('a skateboarder grinding a rail', {not:['grinding']});
check('a gap between the rocks', {has:['rock'], not:['gaping']});
check('a girl wearing thong sandals at the beach', {has:['flip-flops', 'beach'], not:['thong']});
check('a blue tit on a branch', {has:['bird', 'branch'], not:['breasts']});
check('a chef grilling chicken breasts', {has:['chicken_(food)'], not:['breasts']});
{
  n++; const r = l => { S.prompt = l; return R.ratingOf(R.readPrompt(l)); };
  if(r('paper crane, folded') !== '' || r('nsfw, folded') !== 'e' || r('a naked woman relaxing in a hot spring') !== 'q') { fails++; console.log('✗ a mild adult tag typed alone rates the picture only in an adult prompt'); }
}
// ---- adult wording: other names, forms and orders once an adult word is typed; with only a body part or garment, a nude or sexual tag needs an adult prompt ----
check('she is naked', {has:['nude'], adult:true});
check('a woman in black lace panties and a matching bra', {has:['black_panties', 'lace_panties', 'bra'], adult:true}); // one describing word stepped over
check('a woman in a see-through blouse', {has:['see-through_clothes', 'blouse'], adult:true});
check('a see-through glass door', {start:'see-through', not:['see-through_clothes']}); // the hyphened word goes whole
check('a nude woman sitting with her legs spread', {has:['nude', 'spread_legs'], adult:true});
check('a girl lifting her skirt', {has:['skirt_lift'], adult:true});
check('a gymnast spreading her legs', {not:['spread_legs']});
check('a soldier standing with his legs spread apart', {has:['legs_apart'], not:['spread_legs']});
check('a boy pulling his pants up', {not:['pants_pull']});
check('a woman spreading her arms on a cliff', {has:['spread_arms', 'cliff']}); // an -ing word for the bare verb of a longer tag
check('a knight with a naked blade', {not:['nude']});
check('stars visible to the naked eye', {not:['nude']});
check('a woman with nude lipstick', {has:['nude lipstick'], not:['nude']}); // a leftover word that is an adult tag goes with its neighbour
check('a girl reading a comic strip', {has:['comic strip'], not:['undressing']});
check('a nude woman with a funny facial expression', {has:['nude', 'funny facial expression'], not:['facial'], adult:true});
check('a busty woman in a bikini', {has:['large_breasts', 'bikini'], not:['upper_body']});
check('a woman taking off her clothes', {has:['undressing'], adult:true});
check('a mature woman, fully nude', {has:['completely_nude'], adult:true});
check('a shirtless man at the gym', {has:['topless_male', 'gym'], adult:true});
check('her clothes are soaking wet', {send:'wet clothes'});
check('a woman on her hands and knees', {has:['all_fours'], not:['kneeling']});
check('a nakid woman', {not:['naked_snake', '1boy']}); // a typo of an everyday word is no name
{
  n++; S.prompt = 'a shirtless man at the gym';
  if(R.ratingOf(R.readPrompt(S.prompt)) !== 's') { fails++; console.log('✗ a shirtless man is only sensitive'); }
}
// everyday adult wording: other names Danbooru lacks, a topless man, someone on top, clothes pulled up, wearing nothing else
check('a topless man in jeans', {has:['topless_male', 'jeans'], not:['topless'], adult:true}); // topless is the women's tag
check('a couple making love', {has:['1girl', '1boy', 'hetero', 'sex'], adult:true}); check('a bard singing about making love', {not:['sex']}); check('a witch making love potions', {not:['sex']});
check('a man and a woman having intercourse', {has:['sex', 'hetero'], adult:true}); check('a woman with a creampie', {has:['cum_in_pussy'], adult:true});
check('a semi-nude woman', {has:['partially_undressed'], not:['nude'], adult:true}); check('a woman exposing her breasts', {has:['breasts_out'], adult:true}); check('a woman with bare breasts', {has:['breasts_out'], adult:true});
check('a woman wearing nothing but a shirt', {has:['naked_shirt', 'shirt'], adult:true}); check('woman wrapped in only a towel after her shower', {has:['naked_towel', 'towel'], adult:true});
check('a woman wearing only a towel after a bath', {has:['towel', 'after_bathing']}); check('a woman wearing only a shirt and shorts', {has:['shirt', 'shorts']}); // a towel after a bath; not only a shirt
check('a woman in a revealing outfit', {has:['revealing_clothes'], adult:true}); check('a succubus in skimpy clothes', {has:['revealing_clothes'], adult:true});
check('a woman with her skirt hiked up', {has:['skirt_lift'], adult:true}); check('a woman with her shirt pulled up over her breasts', {has:['shirt_lift'], not:['pulling'], adult:true});
check('a woman pulling her skirt up', {has:['skirt_lift'], adult:true}); check('a girl hiking up a mountain trail', {has:['hiking', 'mountain']}); check('a boy pulling his pants up', {not:['pants_pull']});
check('a nude woman on top of a man', {has:['nude', 'girl_on_top', '1girl', '1boy', 'hetero'], adult:true}); check('she is on top of him, nude', {has:['girl_on_top', '1girl', '1boy'], adult:true});
check('a nude girl on top of a mountain', {has:['nude', 'mountain'], not:['girl_on_top'], adult:true}); check('a woman on top of a mountain', {send:'1girl, solo, mature female, mountain'}); // on top of a place
check('a woman giving a blowjob', {has:['1girl', '1boy', 'hetero', 'fellatio'], notSend:['solo'], adult:true}); // an act done to a man brings him in
check('a woman bent over a desk having sex', {has:['1girl', 'sex'], notSend:['solo'], adult:true}); check('a man and a woman in the 69 position', {has:['69', 'hetero'], adult:true});
check('a man squeezing her butt', {has:['1girl', '1boy'], notSend:['solo']}); check('her panties are showing', {has:['1girl', 'panties'], adult:true}); // her before what she wears is a she
check('a girl looking at him', {has:['1girl', '1boy']}); check('a girl hugging her dog, kissing him on the nose', {has:['1girl', 'solo'], not:['1boy']}); // him is someone, unless a pet is about
check('a woman tied to a bed', {not:['tying']}); check('a girl being tickled by her sister', {has:['tickling']}); // tied to a bed is no one tying
check('a woman lying naked in bed', {has:['nude', 'bed'], not:['under_covers'], adult:true}); // in bed is no under covers
check('a woman with a love bite on her neck', {has:['hickey'], not:['biting_neck'], adult:true}); check('a girl with a love bite from her puppy', {});
check('muscular man in just his boxer briefs', {has:['boxer_briefs'], adult:true}); check('a woman in a reverse bunny suit', {has:['reverse_bunnysuit'], not:['playboy_bunny'], adult:true});
{
  n++; const r = l => { S.prompt = l; return R.ratingOf(R.readPrompt(l)); };
  if(r('a topless man in jeans') !== 's' || r('nsfw, a woman in a bikini') !== 'q' || r('explicit, a couple in bed') !== 'e' || r('rating_explicit, a woman') !== 'e' || r('nsfw, a child') !== '') { fails++; console.log('✗ a typed rating (nsfw, explicit) sets the rating, a topless man is sensitive'); }
}
// word forms, other names and turned-round reads that meant something else
check('a girl staring at the stars', {has:['staring', 'star_(sky)']}); // staring is stare, not star
check('a gril huging a cat', {has:['hug', 'cat']}); // a misspelt hugging still is
check('a tight hug', {has:['hug'], not:['pantyhose']});
check('a crisp autumn morning', {has:['autumn', 'morning'], not:['chips_(food)']});
check('a table made of wood', {has:['table'], not:['forest']});
check('she hit the ball with a bat', {has:['ball'], not:['milestone_celebration']});
check('a girl with a fox on her shoulder', {has:['fox', 'on_shoulder'], not:['fox_girl']});
check('bare trees in winter', {has:['bare_tree', 'winter'], not:['in_tree']});
check('a girl sitting in the shade of a tree', {has:['sitting', 'tree_shade'], not:['in_tree', 'sitting_in_tree']});
check('a fluffy white cloud in a blue sky', {has:['white_cloud', 'blue_sky'], not:['white_sky']});
check('a girl holding a stack of books', {has:['holding_book']});
check('a ring on her finger', {has:['ring'], not:['middle_finger']});
check('a dancer in a dynamic pose', {has:['dynamic_pose'], not:['a-pose']});
check('a mole digging in the garden', {has:['garden'], not:['mole']});
check('a girl with a mole under her eye', {has:['mole_under_eye']});
check('a bakery with fresh buns', {has:['bakery'], not:['double_bun', 'hair_bun']});
check('a girl with her hair in two buns', {has:['double_bun']});
check('a pig roasting on a spit', {has:['pig'], not:['saliva']});
check('a girl riding a horse', {has:['horseback_riding', 'horse']});
check('a girl in a jean jacket', {has:['denim_jacket'], not:['jeans']});
// general tags named for one series need it in the prompt; dictionary words are names only when plainly meant
check('a vision of the future', {not:['vision_(genshin_impact)']});
check('genshin impact, vision', {has:['vision_(genshin_impact)']});
check('a ranch in Texas', {not:['texas_(arknights)', 'arknights', '1girl']});
check('Texas from arknights', {has:['texas_(arknights)', 'arknights']});
check('the planet neptune', {has:['planet'], not:['neptune_(neptunia)', '1girl']});
check('a girl playing a euphonium', {not:['hibike!_euphonium']});
check('a bowl of lobster bisque', {has:['lobster'], not:['sono_bisque_doll_wa_koi_wo_suru']});
check('a girl who loves live music at a concert', {has:['music', 'concert'], not:['love_live!']});
check('a girl with a tiger and a bunny', {not:['tiger_&_bunny']});
check('a girl baking cookies', {has:['baking', 'cookie'], not:['cookie_(touhou)']});

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

// ---- messy input: typed tag syntax, contractions, negation, words split or joined, colour lists ----
check('masterpiece, 1girl, red dress BREAK beach, sunset', {has:['red_dress', 'BREAK', 'beach'], not:['broken']});
check('1girl, fern_(sousou_no_frieren), sitting', {send:'1girl, fern \\(sousou no frieren\\), sousou no frieren, sitting'});
check('tohsaka rin \\(fate\\), red sweater', {has:['tohsaka_rin', 'fate_(series)', 'red_sweater'], notSend:['(fate)']});
check('a girl holding a sign that says "I love you"', {has:['holding_sign', '"I love you"']});
check('a girl w/ red hair', {send:'1girl, solo, red hair'});
check("she's sitting on a chair", {send:'1girl, solo, sitting, on chair'});
check("a girl who isn't wearing a hat", {has:['1girl'], notSend:['hat']});
check('a cat with no tail', {send:'cat, no tail'});
check('a girl with a cat', {has:['cat'], not:['cat_girl']});
check('a girl in a red and black kimono', {has:['black_kimono'], not:['red_(pokemon)', 'pokemon', '1boy']});
check('a girl with black and white hair', {has:['black_hair', 'white_hair'], not:['greyscale']});
check('a black and white photo of a cat', {has:['greyscale', 'cat']});
check('a red-haired girl with blue eyes', {send:'1girl, solo, red hair, blue eyes'});
check('a girl wearing sun glasses and a rain coat', {send:'1girl, solo, sunglasses, raincoat'});
check('a girl wearing grey trousers and black tights', {has:['grey_pants', 'black_pantyhose']});
check('3 girls sitting on a couch', {send:'3girls, multiple girls, sitting, on couch'});
check('1 girl, solo, sitting', {send:'1girl, solo, sitting'});
check('1girl, 1boy, the girl is hugging the boy from behind', {send:'1girl, 1boy, hug from behind'});
check('she crossed her legs', {send:'1girl, solo, crossed legs'});
check('a gril with lnog hair', {send:'1girl, solo, long hair'});
check('a girl with long, wavy hair', {send:'1girl, solo, long hair, wavy hair'});
check('a succubus with a heart shaped tail', {send:'demon girl, heart tail'});
// the children guard reads inside weights and quotes too
check('(loli:1.2), a girl showing her nipples', {notChip:['nipples'], adult:true});
check('a "loli" showing her nipples', {notChip:['nipples'], adult:true});
check('a little girl wearing only an apron', {not:['naked_apron'], adult:true});
// any word about children: no adult tag offered or sent, and the rating stays as the style has it
check('a naked child', {}); check('a 12 year old girl showing cleavage', {}); check('a young girl in lingerie', {});
check('a teenage girl in her underwear', {}); check('a nude woman and her kid', {}); check('15yo, topless', {}); check('a child playing in the snow, nude', {has:['child', 'snow']}); // nor does a typed adult word go through
{ n++; const r = l => { S.prompt = l; return R.ratingOf(R.readPrompt(l)); };
  if(r('loli, nude') !== '' || r('a naked child') !== '' || r('a nude woman') !== 'q') { fails++; console.log('✗ the rating ignores adult words in a prompt about children'); } }
// school years, ages said another way, other words for children, and child words misspelt
check('a naked middle schooler', {}); check('a nude junior high student', {}); check('a nude sixth grader', {}); check('a nude girl in 6th grade', {}); check('a nude grade schooler', {});
check('aged 12, nude', {}); check('nude, age: 12', {}); check('a nude preschooler', {}); check('a nude adolescent', {}); check('a naked newborn', {}); check('a nude youngster', {});
check('(middle schooler:1.2), nude', {}); check('a nude chlid', {}); check('a naked toddeler', {}); check('a nude teenagr', {}); check('a nude little sistr', {});
{ n++; const r = l => { S.prompt = l; return R.ratingOf(R.readPrompt(l)); };
  if(r('a naked middle schooler') !== '' || r('aged 12, nude') !== '' || r('a nude chlid') !== '') { fails++; console.log('✗ the rating ignores adult words beside school years, ages and misspelt child words'); } }
// ...but everyday words holding a child word are no children
check('a nude woman wearing kid gloves', {has:['nude', 'gloves'], not:['child'], adult:true}); check('a nude woman holding a goat kid', {has:['nude', 'goat'], not:['child'], adult:true});
check('a nude woman kidding around with her boyfriend', {has:['nude'], adult:true}); check('a nude woman with baby blue eyes', {has:['nude', 'blue_eyes'], not:['baby'], adult:true});
check('a nude woman covered in baby oil', {has:['nude'], adult:true}); check('a topless woman with a minor scratch on her arm', {has:['topless'], adult:true}); check('a woman in a baby blue dress', {has:['blue_dress'], not:['baby']});

// ---- everyday things named with an adult word: no adult tag, no rating ----
check('a sperm whale breaching', {has:['whale']}); check('pussy willow branches in a vase', {has:['willow', 'vase']});
check('a field of rape blossoms', {has:['yellow_flower']}); check('a bowl of bukkake udon', {has:['udon']}); check('she graduated cum laude', {});
check('blue tits at a bird feeder', {has:['tit_(bird)']}); check('a swallow perched on a wire', {has:['swallow_(bird)']});
check('a nude sweater and a beige coat', {has:['beige_coat'], notSend:['nude']}); check('nude nail polish', {}); check('a girl in nude heels', {});
check('a naked tree in winter', {has:['winter']}); check('a naked light bulb hanging from the ceiling', {});
check('stripping old wallpaper', {}); check('fingering a chord on her guitar', {has:['guitar']}); check('a cat licking its foot', {has:['cat']});
check('flashing lights of a police car', {not:['epilepsy_warning']}); check('turning the page of a book', {not:['looking_back']});
check('a topless convertible car on a coast road', {has:['car']}); // a topless car, like the topless bus
{ n++; S.prompt = 'this is a questionable idea'; if(R.ratingOf(R.readPrompt(S.prompt)) !== '') { fails++; console.log('✗ "questionable" as an everyday word sets the rating'); } }
// ...while adult prompts still read as adult
check('a nude woman in a sweater', {has:['nude', 'sweater'], adult:true}); check('a nude apron', {has:['naked_apron'], adult:true});

// ---- red-team leftovers: ages, hats, two-word things, classes, what holds what ----
check('a 25 year old woman reading in a cafe', {has:['1girl', 'solo', 'reading', 'cafe'], not:['6+girls', 'old_woman']});
check('a girl in a cowgirl hat', {has:['1girl', 'solo'], not:['2girls']}); check('a girl holding a hot dog', {has:['1girl'], not:['holding_dog']});
check('a white mage casting a spell', {has:['casting_spell'], not:['white_mage_(final_fantasy)']}); check('a knight and a mage in a tavern', {has:['knight'], not:['solo']});
check('a girl with short hair holding a red umbrella', {has:['short_hair', 'holding_umbrella'], not:['holding_own_hair']});
check('a cat girl maid serving tea', {has:['1girl', 'solo', 'cat_girl', 'maid'], not:['2girls']});
check('an archer with a bow and arrow', {has:['bow_(weapon)', 'arrow_(projectile)'], not:['hair_bow', 'arrow_(symbol)']});
check('a samurai drawing his katana', {has:['unsheathing', 'katana'], not:['drawing_(action)', 'drawing_(object)']});
check('AFK Journey style, a girl in a forest', {has:['1girl', 'forest'], not:['afk_(series)']}); check('a king on his throne', {has:['throne'], not:['king_(chess)']});
check('a giant teddy bear', {not:['giant']}); check('a fallen knight', {not:['autumn']}); check('fallen leaves', {has:['autumn_leaves']});

// ---- the user's own characters (🧍 Characters) and LoRA words are theirs, never a Danbooru character, and are counted ----
const OWN = {chars:[{name:'Levi', tags:'1boy, black hair'}, {name:'Laura', tags:'1girl'}], loraWords:{a:'levi_oc, my_style'}};
check('levi swinging a sword', {send:'1boy, solo, levi, swinging, sword', opt:OWN}); check('levi swinging a sword', {has:['levi_(shingeki_no_kyojin)']});
check('levi and laura sitting on a bench', {has:['1girl', '1boy', 'levi', 'laura', 'on_bench'], not:['levi_(shingeki_no_kyojin)', 'solo'], opt:OWN});
check("laura holding levi's hand", {has:['1girl', '1boy', 'levi', 'laura', 'holding_hands'], opt:OWN});
check('levi ackerman', {has:['levi_(shingeki_no_kyojin)'], not:['mikasa_ackerman'], opt:OWN}); check('levi_oc standing in the rain', {has:['levi_oc', 'standing', 'rain'], opt:OWN});
check('a woman in black lingerie', {has:['black_lingerie'], adult:true}); check('a girl in a blue kimono with a red obi', {has:['blue_kimono', 'red_obi']}); // a colour with no tag of its own goes with its thing
check('a girl and her little brother walking to school', {has:['1girl', '1boy', 'brother_and_sister'], not:['brothers']}); check('a boy and his brother', {has:['2boys', 'brothers']});
check('a cock crowing at dawn', {has:['rooster', 'dawn']}); check('a bird with a red breast', {has:['bird'], not:['breasts']}); check('a nurse in white holding a clipboard', {has:['holding_clipboard', 'white']});
check('a nude girl, 12', {}); check('1girl, nude, 9', {}); check('2girls, 3 swords', {has:['2girls']}); // a piece that is only an age
check('nude, a woman sitting on his face', {has:['1girl', '1boy', 'sitting_on_face'], adult:true}); check('a cat sitting on his face', {not:['sitting_on_face']});
check('levi topless', {has:['levi', 'topless_male'], not:['topless'], adult:true, opt:OWN}); check('ayla giving a blowjob', {has:['1girl', '1boy', 'hetero', 'ayla', 'fellatio'], adult:true, opt:{chars:[{name:'Ayla', tags:'1girl'}]}}); // their sex counts
check('laura cosplaying as hatsune miku', {send:'1girl, solo, laura, cosplay, hatsune miku \\(cosplay\\)', opt:OWN}); // the user's characters are people: who wears a costume,
check('laura hugging levi from behind', {has:['1girl', '1boy', 'hug_from_behind'], notSend:['hug', 'from_behind'], opt:OWN}); // and the one a deed is done to
check('laura patting levi on the head', {send:'1girl, 1boy, laura, headpat, levi', opt:OWN});

// ---- clothes: the noun a word belongs to, colours by another name, one-word other names, picked tags kept ----
check('a girl with long black hair in a white serafuku', {has:['white_serafuku'], not:['white_hair']});
check('a girl in a yukata holding a paper fan', {has:['paper_fan'], not:['holding_paper']});
check('a girl with a white hair ribbon and a red bow', {has:['hair_ribbon', 'red_bow'], not:['white_hair']});
check('a girl with a fox mask on her head', {has:['fox_mask', 'mask_on_head']});
check('a girl with a ribbon tied in her hair', {send:'1girl, solo, hair ribbon'});
check('her hair tied up in a ponytail', {has:['ponytail'], not:['tying_hair', 'tied_up_(nonsexual)']});
check('a witch in a witch hat', {send:'1girl, solo, witch, witch hat'});
check('a nurse with a nurse cap', {send:'nurse, nurse cap'});
check('a girl in a red tracksuit', {send:'1girl, solo, red track suit'});
check('a girl wearing white thigh-high socks', {send:'1girl, solo, white thighhighs'});
check('a girl in a black miniskirt and red glasses', {send:'1girl, solo, black skirt, miniskirt, red-framed eyewear, glasses'});
check('a girl wearing a hoodie and grey trousers', {send:'1girl, solo, hoodie, grey pants'});
check('a girl in a black and white maid outfit', {has:['maid'], not:['greyscale']});
check('a girl in a sailor uniform', {send:'1girl, solo, serafuku'});
check('a girl wearing knee high boots', {send:'1girl, solo, knee boots'});
check('a girl in a short sleeved shirt', {has:['short_sleeves', 'shirt']});
check('a girl in a magical girl outfit', {has:['1girl', 'magical_girl'], not:['2girls']});
check('a girl in a pale blue dress', {has:['blue_dress'], not:['pale_skin']});
check('a girl standing by the side of the road', {not:['from_side']});
check('a mature man in a suit', {has:['1boy', 'suit'], not:['mature_female']});
check('a girl in a ballgown', {not:['balloon']});
check('she walks barefoot in the grass', {has:['barefoot', 'grass'], not:['walk-in']});
check('a girl with her panties pulled to the side', {has:['panties_aside'], adult:true});
check('a girl in a lavender sundress', {send:'1girl, solo, purple dress, sundress'}); // a shade before a thing Danbooru colours is its colour (no lavender flower)
check('a girl with a lavender ribbon', {send:'1girl, solo, purple ribbon'}); check('a knight with a scarlet cape', {has:['red_cape']}); check('a lavender field', {has:['lavender_(flower)']});
check('a girl in an emerald gown', {send:'1girl, solo, green dress, gown'}); check('a girl with sapphire earrings', {has:['blue_gemstone', 'earrings']}); // (no gemstone on a gown, a gem on earrings)
check('a girl in a peach colored dress', {has:['dress'], not:['peach']}); check('a girl in a baby blue dress', {send:'1girl, solo, blue dress'}); // a colour, no peach, no baby
check('a girl in a pastel pink kimono', {has:['pink_kimono'], not:['pastel_(medium)']});
check('a boy with a man bun', {send:'1boy, solo, male focus, hair bun'}); // a man bun is no second man
check('a girl in a kimono holding a paper umbrella', {has:['holding_umbrella', 'oil-paper_umbrella'], not:['holding_paper']}); // the last noun is the thing held
check('a girl wearing rubber boots in the rain', {has:['rubber_boots', 'rain']}); // boots in the rain are no rain boots
check('a girl with messy bed hair', {send:'1girl, solo, messy hair'});

// ---- looks: shades, having-words, gendered body tags, one-word other names, everyday phrasings ----
check('a girl with jet black hair and emerald green eyes', {send:'1girl, solo, black hair, green eyes'});
check('sky blue eyes', {send:'blue eyes'});
check('a girl with emerald eyes', {send:'1girl, solo, green eyes'});
check('a girl with golden hair', {send:'1girl, solo, blonde hair'});
check('ruby earrings', {has:['earrings']});
check('a golden hair ornament', {has:['hair_ornament'], not:['blonde_hair']});
check('snow white and the seven dwarfs', {not:['white_hair', 'snow']});
check('a freckled girl', {send:'1girl, solo, freckles'});
check('1girl, solo, a girl with long hair tied in a ponytail, smiling', {has:['long_hair', 'ponytail', 'smile'], not:['tying_hair']});
check('a chinese girl with black hair', {not:['chinese_text']});
check('an english garden', {has:['garden'], not:['english_text']});
check('a girl with heterochromia, one red eye and one blue eye', {has:['heterochromia', 'red_eyes', 'blue_eyes'], not:['one-eyed']});
check('a girl with one of her eyes closed', {has:['one_eye_closed']});
check('an elf with pointy ears', {send:'elf, pointy ears'});
check('a muscular girl with a six pack', {send:'1girl, solo, muscular, muscular female, abs'});
check('a muscular man', {has:['muscular_male'], notSend:['muscular_female']});
check('a muscular man and a girl', {notSend:['muscular_female', 'muscular_male']});
check('a girl with tears streaming down her face', {has:['streaming_tears'], not:['face_down']});
check('sweat running down her face', {has:['sweat'], not:['running', 'face_down']});
check('a girl staring up at her hands', {not:['hands_up']});
check('a girl with her tongue hanging out', {send:'1girl, solo, tongue out'});
check('she smirked', {has:['smirk']});
check('her hair covering one eye', {send:'1girl, solo, hair over one eye'});
check('side swept bangs', {send:'swept bangs'});
check('lilac hair', {send:'purple hair'}); check('lavender eyes', {send:'purple eyes'});
check('a girl with a single braid over her shoulder', {has:['single_braid', 'hair_over_shoulder'], not:['over_shoulder']}); // a braid over her shoulder is hair over shoulder

// ---- poses: the viewer, each other, own or another's, compound places, hands that hold nothing, gestures ----
check('a girl pointing at you', {send:'1girl, solo, pointing at viewer'}); // you, me, the camera after at/to/towards are the viewer
check('a girl pointing at the camera', {send:'1girl, solo, pointing at viewer', not:['camera']});
check('reaching toward the viewer', {send:'reaching towards viewer'});
check('a girl smiling at you', {has:['smile', 'looking_at_viewer']});
check('a girl pointing at herself', {has:['pointing_at_self']});
check('a girl pointing a finger at the viewer', {has:['pointing_at_viewer'], notSend:['looking_at_viewer']}); // the phrase "at the viewer" gives way to the tag holding it
check('lookign at the viewer', {send:'looking at viewer'});
check('a girl not looking at the viewer', {not:['looking_at_viewer']});
check('two girls looking at each other', {send:'2girls, multiple girls, looking at another'});
check('a girl with her hand on her head', {has:['hand_on_own_head'], not:["hand_on_another's_head"]});
check('a girl with her hand on his head', {has:["hand_on_another's_head"]});
check('a girl on the back of a motorcycle', {has:['motorcycle'], not:['on_back']}); // the back of, the side of: a place on the next thing
check('a girl standing on the side of the road', {has:['standing', 'road'], not:['on_side']});
check('a bow on the back of her head', {not:['head_back', 'back_bow']});
check('a girl lying on her back', {has:['lying', 'on_back']});
check('resting her chin in her hand', {send:'1girl, solo, head rest'}); // a chin or face in her hand is held by no one
check('a girl with her face in her hands', {not:['holding', 'holding_hands']});
check('a girl holding her head in her hands', {not:['holding_detached_head', 'holding_hands']});
check('a girl with a flower in her hand', {has:['holding_flower']});
check('a soldier giving a salute', {send:'solo, soldier, salute'}); // giving a gesture is no handing over
check('a girl giving a flower to a boy', {has:['giving', 'flower']});
check('a girl smiling over her shoulder', {not:['over_shoulder']});
check('she holds out her hand', {send:'1girl, solo, outstretched hand'}); check('a pov shot of a girl holding out her hand', {has:['outstretched_hand'], not:['holding_hands']}); // a hand held out is no holding hands
check('a girl glancing back over her shoulder at the camera', {send:'1girl, solo, looking back, looking at viewer'}); // glancing is looking
check('a girl with her chin resting on her knees', {send:'1girl, solo, knees to chest'}); check('a girl on her knees', {send:'1girl, solo, kneeling'});
check('a girl hands behind her back', {send:'1girl, solo, arms behind back'}); // hands after a girl is no doing
check('a girl peeking from behind a door', {has:['peeking', 'door'], not:['from_behind']}); check('a girl from behind', {send:'1girl, solo, from behind'}); // from behind a thing is where she is
check('a bag over her shoulder', {has:['shoulder_bag']});
check('a girl sitting on her heels', {send:'1girl, solo, seiza'});
check("worm's eye view of a tower", {send:'from below, tower'});
check('head tilted to the side', {has:['head_tilt'], not:['from_side']});
check('doggy style', {send:'doggystyle', adult:true}); // its own name written apart
check('a dog in a doggy bed', {not:['doggystyle']});

// ---- scene: places, light, time, camera, art media, pasted stock words ----
check('a girl outside at night', {send:'1girl, solo, outdoors, night'}); // outside alone is the place
check('the view outside the window', {has:['window'], not:['outdoors']});
check('a knight standing in front of a castle', {send:'solo, knight, standing, castle'});
check('a girl kneeling in front of the viewer', {send:'1girl, solo, kneeling, facing viewer'});
check('a moonlit night', {send:'moonlight, night'});
check('daytime at the beach', {send:'day, beach'});
check('a girl in a midnight blue dress', {send:'1girl, solo, blue dress'}); // midnight before a colour is its shade
check('upper body shot of a girl', {send:'1girl, solo, upper body'});
check('a girl on a plain background', {send:'1girl, solo, simple background'});
check('a sky full of stars', {send:'sky, starry sky'});
check('octane render, unreal engine, a girl', {send:'1girl, solo, octane render, unreal engine'}); // stock words go as typed
check('extremely detailed CG unity 8k wallpaper, a girl', {not:['wallpaper_(object)']});
check('fallen leaves on the ground', {has:['on_ground'], not:['falling_leaves']}); // done-to forms are no -ing tag
check('a girl drawn in flat color', {has:['flat_color'], not:['drawing_(object)', 'drawing_(action)']});
check('a girl with a sword drawn', {send:'1girl, solo, sword, unsheathed'});
check('a painting of a sunset', {send:'painting \\(medium\\), sunset'}); // the picture itself
check('a girl holding a painting', {has:['painting_(object)'], notSend:['painting_(action)']}); // the thing
check('a girl drawing in a sketchbook', {has:['drawing_(action)'], notSend:['drawing_(object)']}); // the doing
check('a steampunk city', {send:'steampunk, city'}); // a name that is a general tag needs its series
check('a girl holding an ak-12', {not:["ak-12_(girls'_frontline)", '2girls']});
check('in the style of makoto shinkai, a city', {not:['shinkai_kanata', '1boy']}); // a little-known character only by its whole name
check('a girl sitting under a tree', {has:['sitting', 'under_tree'], not:['sitting_in_tree']});
check('a witch with a pointy hat in a dark forest', {has:['witch', 'witch_hat', 'forest']});
check('a cyberpunk city with neon lights', {has:['city', 'neon_lights']});
check('a girl holding a stack of books', {has:['holding_book'], notSend:['holding']});
check('a woman in a wet see-through shirt', {notSend:['wet'], adult:true}); // see-through is no gap after a preposition
check('a classroom at sunset with orange light', {not:['orange_(fruit)']}); check('a girl eating an orange', {has:['orange_(fruit)']}); // a colour before a thing is no fruit
check('a vampire in a gothic castle', {has:['gothic_architecture', 'castle'], not:['goth_fashion']}); check('a girl in a gothic dress', {has:['goth_fashion']});
check('a girl, digital painting', {send:'1girl, solo, digital painting'}); check('a girl, pencil drawing', {send:'1girl, solo, graphite \\(medium\\)'}); // the medium, no one painting
check('baby blue eyes', {send:'blue eyes'});
check('a violet sky at dusk', {send:'purple sky, dusk'}); check('sakura petals falling on a river', {has:['cherry_blossoms', 'river'], not:['sakura']});

// ---- actions: holding, eating, playing, deeds done to someone, animals ----
check('a girl wielding a scythe', {send:'1girl, solo, holding scythe'}); // wielding, brandishing, clutching: holding
check('she drank tea', {has:['drinking', 'tea'], notSend:['drink']}); // a past tense is a doing: no drink, no swing
check('she swung her sword', {has:['swinging', 'sword'], notSend:['swing']});
check('she fell asleep at her desk', {send:'1girl, solo, sleeping, desk'});
check('a girl playing the drums', {send:'1girl, solo, playing instrument, drum'}); // no playing drums tag
check('a girl playing the piano', {send:'1girl, solo, playing piano'});
check('a girl taking a photo with a camera', {send:'1girl, solo, taking picture, camera'});
check('a girl eating a burger and fries', {has:['french_fries']});
check('a knight on horseback', {send:'solo, knight, horseback riding'});
check('a boy carrying a girl bridal style', {has:['princess_carry']});
check('a girl holding a cup of hot chocolate', {send:'1girl, solo, holding cup, hot chocolate'}); // holding is shared over an and, not over of
check('a girl holding a sword and a shield', {has:['holding_sword', 'holding_shield']});
check('a girl patting another girl on the head', {send:'2girls, multiple girls, headpat'}); // the one a deed is done to stands between
check('he patted her on the head', {send:'1girl, 1boy, headpat'}); // and the on after them is the deed's (no on head)
check('she hugged him from behind', {has:['hug_from_behind'], notSend:['hug', 'from_behind']}); // hugged is the hug of hug from behind
check("a boy petting a girl's head", {has:['headpat']});
check('a boy grabbing a girl by the wrist', {not:['holding_own_wrist']});
check('a bird perched on her finger', {send:'1girl, solo, bird on hand'}); // and what a thing is doing
check('a cat sleeping on her lap', {send:'1girl, solo, cat on lap'});
check('two girls giving each other a high five', {send:'2girls, multiple girls, high five'}); // the one given to comes first
check('a mother giving her daughter a hug', {send:'2girls, multiple girls, mother, daughter, hug'});
check('a boy giving a girl flowers', {has:['giving', 'flower']}); // a thing that can be held is given
check('a paladin holding a glowing shield', {has:['holding_shield', 'glowing']}); // an -ing word after a describes the thing
check('a girl sleeping in a sleeping bag', {send:'1girl, solo, sleeping, sleeping bag'}); // (a sleeping bag is one thing)
check('a girl swimming in a pool', {send:'1girl, solo, swimming, pool'}); check('a girl boxing in the ring', {send:'1girl, solo, boxing ring'}); // the doing stays
check('a girl hugging a pillow', {send:'1girl, solo, pillow hug'}); check('a girl taking a selfie', {send:'1girl, solo, selfie'}); check('venti playing a lyre', {has:['playing_instrument', 'lyre']});
check('a girl holding a baby dragon', {send:'1girl, solo, holding, baby dragon'}); check('a mother holding her baby', {has:['holding_baby']}); // a baby animal is no human baby
check('three girls posing for a photo', {send:'3girls, multiple girls, posing'});

// ---- fantasy: creatures, characters and their series, cosplay ----
check('a fox with a girl', {has:['1girl', 'fox'], not:['fox_girl']}); // a tag doesn't reach across with to or from a person
check('a cat with a long tail', {send:'cat, long tail'}); // nor from a creature with catgirl tags of its own (cat tail is a catgirl's)
check('a witch with a pointed hat and a black cat', {has:['witch', 'witch_hat', 'black_cat'], not:['pointing']}); // an -ed word after a is no doing
check('a vampir girl drinking blood', {has:['vampire']}); // a typo as close to two names of one tag is no tie
check('d.va from overwatch', {send:'1girl, solo, d.va \\(overwatch\\), overwatch'}); // a dot inside a name is no full stop
check('monkey d luffy', {send:'1boy, solo, monkey d. luffy, one piece'}); // little words of a name count when typed
check('jinx from league of legends', {has:['jinx_(league_of_legends)', 'league_of_legends']});
check('twilight from spy x family', {has:['twilight_(spy_x_family)', 'spy_x_family'], not:['peeking']});
check('sakura from naruto', {send:'1girl, solo, haruno sakura, naruto'}); // after from, a title character is the series
check('link from zelda with the master sword', {has:['1boy', 'link', 'master_sword'], not:['princess_zelda', '1girl']});
check('marine from hololive', {has:['1girl', 'houshou_marine', 'hololive']}); // one everyday word of a name, its series named after from
check('dva from overwatch', {not:['gangut_dva_(kancolle)']}); // and not one of another series
check('asuna and kirito', {has:['asuna_(sao)', 'sword_art_online'], not:['asuna_(blue_archive)', 'blue_archive']}); // a name is not helped by its own series
check('asuna from sao', {has:['asuna_(sao)'], not:['asuna_(blue_archive)']});
check('violet evergarden typing a letter', {has:['1girl', 'violet_evergarden', 'violet_evergarden_(series)']}); // a character named like its series is from it
check('spider-man swinging through the city', {has:['spider-man'], not:['spider', 'male_focus']}); // a name typed with its own hyphen
check('a cat named luna', {not:['luna_(sailor_moon)', '1girl']}); // a pet named so is no character (a boy named Link still is)
check('a girl cosplaying as hatsune miku', {send:'1girl, solo, cosplay, hatsune miku \\(cosplay\\)'}); // a costume is no second person
check('a girl wearing a pikachu costume', {has:['1girl', 'pikachu_(cosplay)'], not:['2girls']});
check('a girl cosplaying as saber', {has:['cosplay', 'saber_(fate)_(cosplay)'], notSend:['saber_(weapon)', '2girls']});
check('two catgirls cuddling', {send:'2girls, multiple girls, cat girl, cuddling'}); // catgirls are people
check('a bunny girl in a black leotard', {has:['1girl', 'playboy_bunny', 'rabbit_ears'], not:['rabbit']});
check('pikachu', {send:'solo, pikachu, pokemon'}); // drawn as often with boys as with girls: neither
check('cum on face', {has:['facial'], adult:true}); // an adult word in the words of a mild tag still makes the prompt adult

// ---- people: who is there, counted across the prompt ----
check('Zelda, a girl with long blonde hair', {send:'1girl, solo, princess zelda, the legend of zelda, long hair, blonde hair'}); // a piece describing the character named before is that character
check('zelda is a girl with long blonde hair', {has:['1girl', 'solo'], not:['2girls']});
check('miku and a girl', {send:'2girls, multiple girls, hatsune miku, vocaloid'});
check('two girls, the first girl has red hair and the second girl has blue hair', {has:['2girls', 'red_hair', 'blue_hair'], not:['3girls']}); // the second girl of two
check('a girl with her friends', {send:'1girl, friends'}); // friends, parents, a stranger: people of either sex, so no solo
check('she and her boyfriend at the beach', {send:'1girl, 1boy, boyfriend, beach'}); // she is someone when no girl is named or described
check('a maid and her master', {send:'1girl, maid, master'}); // a maid is a girl, her master someone (no solo)
check('a lesbian couple kissing', {send:'2girls, multiple girls, yuri, couple, kiss'});
check('a gay couple', {send:'2boys, multiple boys, yaoi, couple'});
check('a happy couple', {send:'1girl, 1boy, smile, happy, couple'});
check('a couple of apples on a table', {send:'apple, on table'}); // a couple of is a few
check('twins, a boy and a girl', {send:'1girl, 1boy, twins', notChip:['2girls']}); // couple only offered
check('boys and girls playing soccer', {send:'multiple girls, multiple boys, playing, soccer', notChip:['couple']}); // boys is no boy
check('a man and a woman having sex', {send:'1girl, 1boy, hetero, sex', adult:true}); // a sex act between them: hetero
check('two girls having sex', {has:['2girls', 'yuri', 'sex'], not:['hetero'], adult:true});
check('a girl and her grandmother', {send:'2girls, multiple girls, old woman'});
check('grandpa reading a newspaper', {send:'1boy, solo, old man, reading, newspaper'});
check('a young woman in a sundress', {send:'1girl, solo, sundress'}); // no mature female
check('a mature man with a beard', {send:'1boy, solo, mature male, beard'});
check('an old couple sitting on a bench', {send:'1girl, 1boy, couple, old man, old woman, sitting, on bench'});
check('an older woman with glasses', {has:['mature_female'], not:['aged_up']}); // older and group are no other names of aged up and everyone in a sentence
check('a group of friends laughing', {has:['friends', 'laughing'], not:['everyone', 'solo']});
check('dad and daughter', {send:'1girl, 1boy, father and daughter'}); // dad is father
check('scenery only, mountains and a lake', {send:'scenery, no humans, mountain, lake'});
check('an empty classroom with no one in it', {has:['classroom', 'no_humans'], notSend:['no']});
check('a girl that no one notices', {has:['1girl', 'solo'], not:['no_humans', 'scenery']}); // no one doing something is no empty scene
check('an old castle', {send:'old castle'}); // old, early, safe never go alone as Illustrious' date or rating tag
check('early morning in a forest', {send:'early morning, forest'});
check('two guys arm wrestling', {send:'2boys, multiple boys, arm wrestling'});

// ---- speed: building the index once, and reading a prompt (a long one, and one full of typos) ----
{
  n++; const p = 'freiren and fern casting an epic magic spell in a classroom at night, long red hair, holding a sword and a shield';
  t0 = Date.now(); for(let i = 0; i < 20; i++){ S.prompt = p + ' ' + i; R.readPrompt(S.prompt); } const each = (Date.now() - t0) / 20;
  const q = 'a beautfil gril wiht lnog flowng slver hiar and brigth red eys standng on a clif overloking the ocaen at sunst holdng a bouqet of flowres';
  t0 = Date.now(); for(let i = 0; i < 20; i++){ S.prompt = q + ' ' + i; R.readPrompt(S.prompt); } const typo = (Date.now() - t0) / 20;
  console.log(`index ${tIndex} ms, a long prompt ${each.toFixed(1)} ms, a typo-heavy prompt ${typo.toFixed(1)} ms`);
  if(tIndex > 1500 || each > 60 || typo > 60) { fails++; console.log('✗ too slow'); }
}
console.log(fails ? `${fails} of ${n} failed` : `all ${n} passed`);
process.exit(fails ? 1 : 0);
