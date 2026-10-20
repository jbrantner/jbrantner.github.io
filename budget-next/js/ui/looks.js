'use strict';
// v214: preset palettes. Six shades each, in the card color slots' order (mint, pink, blue, purple, amber, coral)
const PALETTES = {   // [sky, name, main, pink, blue, purple, amber, coral]; v217: one unified Night sky (Moonlight)
  night: ['#1d1240', 'Night sky', '#6ed0ff', '#f594c3', '#73dee9', '#b89eff', '#fdc495', '#fda1a0'],
}
const palNow = () => PALETTES[state.palette] || PALETTES.night;
const palColors = () => { const P = palNow(); if (document.documentElement.classList.contains('look-b')) return JSON.parse(palMap(JSON.stringify({ teal: '#7ee8d0', mag: '#ffd27a', green: '#ff8a80', mint: '#ff8a80', pink: '#ff8a80', blue: '#7ee8d0', purple: '#ffaba4', amber: '#ffd27a', coral: '#ff8a80' })));   // v264: Coral reef; v292: in the chosen look's colors
  return { teal: '#2e8aa6', mag: '#c0507e', green: '#7fdc9c', mint: P[2], pink: P[3], blue: P[4], purple: P[5], amber: P[6], coral: P[7] }; };   // v215: P[0] is the sky
function palApply() {
  const P = palNow(), r = document.documentElement.style, set = (k, v) => r.setProperty(k, palMap(v));
  if (document.documentElement.classList.contains('look-b')) {   // v264 (Jordan): Coral reef everywhere. Coral light, sand for warnings; v265: bills light indigo (Jordan's David color)
    set('--pal-sky', '#145466'); set('--pal-a', '#ff8a80'); set('--pal-b', '#ffd27a'); set('--pal-pk', '#ff8a80'); set('--c-bill', '#8e8ee6');
    for (const k of ['--pp-moss', '--accent', '--ok']) set(k, '#ff8a80');
    set('--pp-gold', '#ffaba4'); set('--pp-ember', '#ffd27a'); set('--pp-proj', '#ff9a92'); set('--warn', '#ffd27a');
    set('--pp-mint-dim', '#3f7686'); set('--pp-hollow', 'rgba(255, 138, 128, .5)');
    set('--pp-moss-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)'); set('--pp-gold-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)');
    return;
  }
  set('--pal-sky', P[0]); set('--pal-a', P[2]); set('--pal-b', P[5]); set('--pal-pk', '#2b7e50'); set('--c-bill', '#4c4c8c');   /* v260 (Jordan, look F): spending green, bills indigo */   // v254 (Jordan): try spending green and bills pink
  // v216: the shared accents follow the palette too, so the whole budget screen changes
  for (const k of ['--pp-moss', '--pp-gold', '--accent', '--ok']) set(k, P[2]);
  set('--pp-ember', P[3]); set('--pp-proj', P[4]); set('--warn', P[6]);
  set('--pp-mint-dim', `color-mix(in srgb, ${P[2]} 62%, #0b0a18)`); set('--pp-hollow', `color-mix(in srgb, ${P[2]} 35%, #0b0a18)`);
  set('--pp-moss-soft', `color-mix(in srgb, ${P[2]} 18%, #0b0a18)`); set('--pp-gold-soft', `color-mix(in srgb, ${P[2]} 18%, #0b0a18)`);
}
function palHTML() {
  return Object.entries(PALETTES).map(([k, P]) => `<button class="pal-opt${(state.palette || 'night') === k ? ' on' : ''}" data-pal="${k}" aria-pressed="${(state.palette || 'night') === k}"><span class="pal-sw">${P.slice(2).map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${P[1]}</b></button>`).join('');
}
