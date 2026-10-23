// Every name the scripts use is defined somewhere. The scripts share one global scope, so a helper defined inside one
// file's function (plural, once only inside home.js's VL) looks fine to the eye but throws when another file calls it.
// This joins js/ in index.html's load order and runs ESLint's no-undef (and a few other plain-mistake rules) over it.
// Usage: node globals.js [budgetDir]   (env ESLINT: the eslint package folder)
const { Linter } = require(process.env.ESLINT || '/opt/node-tools/node_modules/eslint');
const fs = require('fs'), path = require('path'), DIR = process.argv[2] || path.join(__dirname, '..');
const order = [...fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').matchAll(/<script[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
// what the browser gives the page (the ones the scripts use)
const BROWSER = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'console', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'Blob', 'File', 'URL', 'CSS', 'MutationObserver',
  'ResizeObserver', 'IntersectionObserver', 'getComputedStyle', 'HTMLIFrameElement', 'performance', 'parent', 'matchMedia', 'Event',
  'CustomEvent', 'AudioContext', 'webkitAudioContext', 'Image', 'FileReader', 'TextDecoder', 'TextEncoder', 'alert', 'confirm', 'innerWidth',
  'innerHeight', 'scrollTo', 'scrollBy', 'visualViewport', 'caches', 'Intl', 'addEventListener', 'screen', 'devicePixelRatio', 'pdfjsLib',
  'DOMMatrix', 'Node', 'KeyboardEvent', 'PointerEvent', 'HTMLElement', 'Element', 'DOMParser', 'structuredClone', 'queueMicrotask',
  'AbortController', 'crypto', 'history', 'scrollY', 'getSelection', 'isSecureContext', 'btoa', 'atob', 'DOMRect', 'self'];
let code = '', starts = [];
for (const f of order) { starts.push([code.split('\n').length, f]); code += fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^'use strict';/, '') + '\n'; }
const where = line => { let at = starts[0]; for (const s of starts) if (s[0] <= line) at = s; return `${at[1]}:${line - at[0] + 1}`; };
const msgs = new Linter({ configType: 'flat' }).verify(code, [{ languageOptions: { ecmaVersion: 2022, sourceType: 'script',
  globals: Object.fromEntries(BROWSER.map(n => [n, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-dupe-else-if': 'error',
    'no-duplicate-case': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-unsafe-negation': 'error' } }]);
for (const m of msgs) console.log(`${where(m.line)} ${m.message}`);
console.log(msgs.length ? `${msgs.length} problems` : `${order.length} scripts: every name is defined`);
process.exit(msgs.length ? 1 : 0);
