'use strict';
const prevMonth = m => { const [y, mo] = m.split('-').map(Number), n = new Date(y, mo - 2, 1); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let month = today().slice(0, 7);
const monthEnd = m => m + '-31';
/* ---------- farm workers ----------
   A worker on a farm (Savings or a pot you made) grows $1 of crops a day, earned instead of for Fun
   as it grows, so a farm's balance climbs all day long. state.workerLog holds every change in
   workers as { t (ms since 1970), pot, delta }. */
const DAY_MS = 86400000, WORKER_DAY = 1;
const dayMsC = new Map();   // v311: cleared on each render (a new time zone counts from then)
const dayMs = d => { let v = dayMsC.get(d); if (v === undefined) { const [y, mo, dd] = d.split('-').map(Number); v = new Date(y, mo - 1, dd).getTime(); if (dayMsC.size > 5000) dayMsC.clear(); dayMsC.set(d, v); } return v; };
const monthStartMs = m => dayMs(m + '-01');
const monthEndMs = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 1).getTime(); };
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
/* ---------- the paycheck engine (version 117, Jordan 2026-10-10) ----------
   Each paycheck works until the next payday. A normal paycheck first holds its even part of the month's bills
   (bills and set-asides ÷ the normal paychecks in a month: every 2 weeks, half; every week, a quarter). An extra
   paycheck (a 3rd every-2-weeks one, a 5th weekly one) holds nothing. What's left is yours: it comes in a dollar a
   day per villager (V = what's left ÷ the days to the next payday, rounded down), and the odd dollars land in Savings
   on the next payday. Cents go to the scavenger. Until you enter a payday's paycheck it puts nobody to work; once you
   do, it catches up from the payday. The paycheck before you started is already in your starting balance: its
   villagers work from the day you started. Villagers nobody assigns save into Savings. Nothing here is ever more
   than the bank has: held + still coming in + yours = the bank. */
const monthLast = m => `${m}-${String(daysIn(m)).padStart(2, '0')}`;

/* ---------- the adventuring party ----------
   Spending money is the party's purse. Villagers not manning machines or filling storage are the
   party, each earning $1 a day of it as you collect pay. Every week (Monday to Sunday) they go on an
   expedition; what you spend is them spending on the road. Whatever's left in the purse when the week
   ends comes home as treasure into a storage pot. Run dry and you can send a runner to borrow. */
const weekStart = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };   // Monday (v144; Sunday before)
/* v144: weeks run Monday to Sunday. Week keys saved before are Sundays. Moved once (state.weekMon): opened on that
   Sunday, it's the last day of the week that began the Monday before; opened later, the old week runs on to the next
   Sunday night (8 days, one more day of purse per villager). Either way only spends from that Sunday on count in it:
   the days before were settled with the week before. state.weekFrom = { wk, from, days } for that one week. */
const ymdPlus = (k, n) => { const d = new Date(dayMs(k)); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextMonth = m => { const [y, mo] = m.split('-').map(Number), n = new Date(y, mo, 1); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); };
