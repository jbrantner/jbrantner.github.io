'use strict';
/* v259: show the screen once its fonts are ready (they're in the page, so this is a blink), never later than 0.8s */
document.documentElement.classList.add('fwait');
(function () { let lk = null; try { lk = localStorage.getItem('budget-look'); } catch (e) {}   /* v263: the look (F Lit panels, B Coral reef); v264: Coral reef unless Lit panels was picked */
  if (lk !== 'f') { document.documentElement.classList.add('look-b'); const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = '#145466'; } })();
(function () { const go = () => document.documentElement.classList.remove('fwait'); setTimeout(go, 800);
  try { Promise.all(['16px HoloNum', '500 16px "Pixelify Sans"', '700 16px "Pixelify Sans"', '600 16px Nunito', '800 16px Nunito'].map(x => document.fonts.load(x))).then(() => requestAnimationFrame(go), go); } catch (e) { go(); } })();
