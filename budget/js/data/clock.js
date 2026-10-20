'use strict';
/* v137: the clock guard. The latest moment the app has seen is kept (state.seenAt, and the newest villager move). If the
   phone's clock is set back past it, things saved "later" would look missing until the clock catches up, and a move
   made now would land before them. So while it's behind, a banner says so and villager moves wait. */
const CLOCK_SLACK = 10000;
const lastLogT = () => (state.workerLog || []).reduce((m, w) => Math.max(m, Number(w.t) || 0), 0);
const clockHigh = () => Math.max(Number(state.seenAt) || 0, lastLogT());
const clockBack = (now = Date.now()) => now + CLOCK_SLACK < clockHigh();
const stampNow = () => Math.max(Date.now(), lastLogT());   // a move never lands before the last one (same moment at the latest: never in the future, so it shows at once)
function clockHold() {
  if (!clockBack()) return false;
  toast(`Your phone's clock went back. Moving money waits until it catches up (${clockWait()}).`); return true;
}
function clockWait(now = Date.now()) { const m = Math.ceil((clockHigh() - now) / 60000); return m <= 1 ? 'about a minute' : m < 120 ? `about ${m} min` : `about ${Math.round(m / 60)} hours`; }
const clockBanner = () => clockBack() ? `<div class="clock-bar" role="status">Your phone's clock went back. Moving money is paused until it catches up (${clockWait()}). Some numbers may look off until then.</div>` : '';
