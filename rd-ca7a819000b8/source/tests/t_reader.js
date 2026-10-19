// The prompt reader against a fixed set of prompts (tests/fixtures/reader_cases.json, about 860 SFW and adult prompts that read right):
// a change to the reader must keep every one of them right. node tests/t_reader.js [-v]
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
const S = {prompt:'', tagOn:[], tagOff:[], asTags:true, addedTags:[], peopleOff:false, chars:[], loraWords:{}};
const R = new Function('TAGS', 'CHARS', 'WORDS', 'EVERY', 'COMMON', 'S', 'usesTags', code + '\nreturn {readPrompt, sentPrompt, pickedFor, indexTags};')(TAGS, CHARS, WORDS, EVERY, COMMON, S, () => true);
const FLAG = new Set(TAGS.filter(t => t.fl).map(t => t.tag));
const key = s => s.replace(/\\/g, '').trim().toLowerCase().replace(/ /g, '_');
// has: tags Render must send; not: neither sent nor offered (a count tag only not sent); notSend: not sent; adult: adult tags allowed
const SOFT = new Set(['solo','1girl','1boy','male_focus','couple','2girls','2boys','multiple_girls','multiple_boys','1other']);
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'reader_cases.json'), 'utf8')), verbose = process.argv.includes('-v');
const stats = {}; let fails = 0;
for(const c of cases){
  Object.assign(S, {prompt: c.prompt, tagOn:[], tagOff:[], asTags:true, addedTags:[], peopleOff:false});
  let why = '', send = '';
  try{
    const pieces = R.readPrompt(c.prompt); R.pickedFor(pieces); send = R.sentPrompt();
    const items = send.split(', ').map(key), chips = pieces.flatMap(p => p.phrases.flatMap(ph => ph.tags.map(t => t.tag)));
    for(const h of c.has || []) if(!items.includes(key(h))) { why = 'missing ' + h; break; }
    if(!why) for(const h of c.not || []) if(items.includes(key(h)) || (!SOFT.has(key(h)) && chips.includes(key(h)))) { why = 'should not have ' + h; break; }
    if(!why) for(const h of c.notSend || []) if(items.includes(key(h))) { why = 'should not send ' + h; break; }
    if(!why && !c.adult){ const bad = chips.concat(items).find(t => FLAG.has(t)); if(bad) why = 'adult tag ' + bad; }
  }catch(e){ why = 'CRASH ' + e.message; }
  const s = stats[c.domain] = stats[c.domain] || [0, 0]; s[1]++;
  if(why){ fails++; console.log(`✗ [${c.domain}] ${c.prompt}\n    ${why}\n    sends: ${send}`); } else s[0]++;
}
if(verbose || fails) console.log(Object.entries(stats).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  '));
console.log(fails ? `${fails} of ${cases.length} failed` : `all ${cases.length} passed`);
process.exitCode = fails ? 1 : 0;
