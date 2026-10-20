'use strict';
function earlyArrive(now = Date.now()) {
  const td = ymd(new Date(now));
  for (const [k, c] of Object.entries(state.checks || {})) {
    if (!c.early || c.fit || splitKey(k)[1] > td || !(Number(c.at) <= now)) continue;
    c.fit = true; booksGen++; needMemo.clear();
    const n = afterCheck(k), say = payNewsText(n); save(); if (say) toast(say);
  }
}
// A new day (or a new week or month) since the last render: settle it and redraw, so a phone that kept
// the app open overnight never shows yesterday's purse.
let lastDay = today();
function refreshDay(always) {
  const d = today(); if (d === lastDay && !always) return;
  month = d.slice(0, 7);   // always the current month (the month arrows are hidden since v79)
  lastDay = d; render(); spentRedraw();   // v311: those pages aren't part of render()
}
// Farms with workers grow all the time, so their signs tick up while you watch.
setInterval(() => {
  if (document.hidden) return;
  refreshDay(false);
  if (!$('view-budget').classList.contains('hidden') || !$('view-party').classList.contains('hidden')) { if (!$('view-party').classList.contains('hidden')) tickHero(); /* v311: its hero shows only there */ if (document.documentElement.classList.contains('kp-on')) tickRoad(); /* v311: its pill is on the keypad (every render refreshes it too) */ if (Date.now() % 30000 < 100 && !habitEditing) renderHabits(); }
}, 100);
