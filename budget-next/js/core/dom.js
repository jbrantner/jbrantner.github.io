'use strict';
/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
// Runs fn on tap, then repeatedly while held. fn returning false stops the repeat.
function holdRepeat(el, fn) {
  let timer = null;
  const stop = () => { clearTimeout(timer); clearInterval(timer); timer = null; };
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!e.isPrimary) return; stop(); if (el.disabled || fn() === false) return;   // v311: one finger, one timer
    timer = setTimeout(() => { timer = setInterval(() => { if (el.disabled || fn() === false) stop(); }, 70); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}
