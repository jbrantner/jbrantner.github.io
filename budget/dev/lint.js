// The math stays apart from the screen: the files in js/money/ may not touch the page (document, window, $, the
// draw and toast calls, anything defined in js/ui/ or js/legacy/). Usage: node lint.js [jsDir]
const acorn = require(process.env.ACORN || '/opt/node-tools/node_modules/acorn'), walk = require(process.env.ACORN_WALK || '/opt/node-tools/node_modules/acorn-walk');
const fs = require('fs'), path = require('path'), JS = process.argv[2] || path.join(__dirname, '../js');
const parse = f => acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, sourceType: 'script', locations: true });
const files = d => fs.readdirSync(path.join(JS, d)).filter(f => f.endsWith('.js')).map(f => path.join(JS, d, f));
// every top-level name the screen files define
const screen = new Set(['document', 'window', 'navigator', 'location', 'requestAnimationFrame', 'getComputedStyle', 'alert', 'confirm']);
for (const f of [...files('ui'), ...files('legacy')]) for (const n of parse(f).body) {
  if (n.type === 'FunctionDeclaration') screen.add(n.id.name);
  if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') screen.add(d.id.name);
}
screen.add('$');
let bad = 0;
for (const f of files('money')) {
  const ast = parse(f), own = new Set();
  walk.full(ast, n => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') own.add(n.id.name); if (/Function/.test(n.type)) n.params.forEach(p => p.type === 'Identifier' && own.add(p.name)); });
  walk.full(ast, n => {
    if (n.type !== 'Identifier' || !screen.has(n.name) || own.has(n.name)) return;
    bad++; console.log(`${path.relative(JS, f)}:${n.loc.start.line} uses ${n.name}`);
  });
}
console.log(bad ? `${bad} places where the math touches the screen` : 'js/money/ is screen-free');
process.exit(bad ? 1 : 0);
