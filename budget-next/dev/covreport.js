// Reads cov.js output: lists the named functions in the page's main script that never ran, with their size, and the CSS
// rules that were never used. Usage: node covreport.js <cov.json>... [--css]
const acorn = require(process.env.ACORN || '/opt/node-tools/node_modules/acorn');
const walk = require(process.env.ACORN_WALK || '/opt/node-tools/node_modules/acorn-walk');
const fs = require('fs');
const files = process.argv.slice(2).filter(a => !a.startsWith('--')), css = process.argv.includes('--css');
const all = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const js = {}; for (const c of all) for (const [k, m] of Object.entries(c.js)) { const n = js[k] || (js[k] = { url: m.url, len: m.len, fns: {} }); for (const [r, v] of Object.entries(m.fns)) n.fns[r] = (n.fns[r] || 0) + v; }
const src = fs.readFileSync(process.env.SRC, 'utf8');   // the main script's text, exactly as the page has it
const entry = Object.values(js).find(m => m.len === src.length); if (!entry) { console.log('no coverage entry with length', src.length, Object.values(js).map(m => m.len)); process.exit(1); }
const starts = new Map(); for (const [r, v] of Object.entries(entry.fns)) { const [a, b] = r.split(':').map(Number); const k = a; starts.set(k + ':' + b, (starts.get(k + ':' + b) || 0) + v); }
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true });
const lineOf = p => src.slice(0, p).split('\n').length;
const out = [];
const nameOf = (n, parent) => n.id ? n.id.name : parent && parent.type === 'VariableDeclarator' ? parent.id.name : parent && parent.type === 'Property' ? (parent.key.name || parent.key.value) : parent && parent.type === 'AssignmentExpression' ? src.slice(parent.left.start, parent.left.end) : null;
walk.fullAncestor(ast, (n, anc) => {
  if (!/Function/.test(n.type)) return;
  const parent = anc[anc.length - 2], name = nameOf(n, parent); if (!name) return;
  // V8 counts a function from its own text start (for a declaration, 'function'); match on the end too
  let c = null; for (const d of [0, -1, 1, -2, 2]) { const v = starts.get((n.start + d) + ':' + n.end); if (v != null) { c = v; break; } }
  const depth = anc.filter(a => /Function/.test(a.type)).length - 1;
  out.push({ name, line: lineOf(n.start), size: n.end - n.start, count: c, depth });
});
const never = out.filter(f => f.count === 0), unknown = out.filter(f => f.count == null);
console.log(`${out.length} named functions; never ran: ${never.length} (${never.reduce((a, f) => a + f.size, 0)} chars); no data: ${unknown.length}`);
for (const f of never.sort((a, b) => a.line - b.line)) console.log(`  L${f.line} ${'  '.repeat(Math.min(f.depth, 3))}${f.name} (${f.size})`);
if (css) {
  const cs = {}; for (const c of all) for (const [k, m] of Object.entries(c.css)) { const n = cs[k] || (cs[k] = { url: m.url, len: m.len, used: {} }); Object.assign(n.used, m.used); }
  for (const m of Object.values(cs)) console.log('css', m.url, m.len, Object.keys(m.used).length, 'used ranges');
}
