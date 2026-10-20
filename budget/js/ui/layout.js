'use strict';
// When the window changes size (the jump), the sheet and the road catch up at once.
// The app's full height. Opened from the home screen it fills the whole screen, so the screen's own size is the
// truth; in a browser tab it's the larger of the window and the visible part.
function appH() {
  const solo = navigator.standalone || matchMedia('(display-mode: standalone)').matches, v = window.visualViewport;
  if (solo && screen.width && screen.height) return innerWidth <= innerHeight + 80 ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  return Math.round(Math.max(innerHeight, v ? v.height : 0));
}
// no pinch or double-tap zoom (iOS ignores user-scalable=no, so stop its gestures too)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
const setAppH = () => document.documentElement.style.setProperty('--appH', appH() + 'px');
setAppH();
const refit = () => { setAppH(); unshift(); if (!$('view-budget').classList.contains('hidden')) sheetFit(); };
addEventListener('resize', refit); if (window.visualViewport) visualViewport.addEventListener('resize', refit);
addEventListener('orientationchange', refit); addEventListener('pageshow', refit);
// The home screen never scrolls. A swipe can still nudge an iPhone's page up a little (the page peeking in
// makes it taller for a moment), and with scrolling off it would stay stuck there with a dark strip at the
// bottom (Jordan, v83), so whenever it moves while the home screen is up, it goes straight back.
const unshift = () => { if (document.documentElement.classList.contains('full') && (scrollY || document.documentElement.scrollTop || document.body.scrollTop)) { scrollTo(0, 0); document.documentElement.scrollTop = document.body.scrollTop = 0; } };
addEventListener('scroll', unshift, { passive: true });
const leaveSettings = () => showView(showView.last && showView.last !== 'settings' ? showView.last : 'budget');
$('settingsBtn').onclick = () => $('view-settings').classList.contains('hidden') ? showView('settings') : leaveSettings();
$('settingsBack').onclick = leaveSettings;
