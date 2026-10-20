'use strict';
const sum = (list, f) => list.reduce((s, c) => s + f(c), 0);
const cents = n => Math.round(n * 100) / 100;
const clamp01 = x => Math.max(0, Math.min(1, x));
// v294 (Jordan, 2026-10-15: "If she sets it to $300 I want it to be $300"): the weekly amount as typed (state.wkAmt). Money a day
// stays whole dollars ($43 for $300), and a week's purse is scaled by wkAmt / (plan x 7), so $300 is $300, not $301. What the
// purse doesn't take stays in Savings (Savings is what's left over), so nothing is made up.
const c2 = x => Math.round(x * 100) / 100;
