'use strict';
// v311: Upkeep keeps its own storage; a backup carries it as the stored text, under "tabs" (the Pet is gone: a backup's pet data is left alone)
const TAB_KEYS = CHANNEL === 'main' ? { upkeep: 'upkeep.v1' } : { upkeep: 'upkeep.v1-' + CHANNEL };
function tabsOut() { const o = {}; for (const [k, key] of Object.entries(TAB_KEYS)) { try { const v = localStorage.getItem(key); if (v != null) o[k] = v; } catch (e) {} } return Object.keys(o).length ? o : null; }
function tabsBack(t) {   // what the backup has goes back (what it hasn't is left alone), and an Upkeep page already open reads it again
  let n = 0; for (const [k, key] of Object.entries(TAB_KEYS)) if (typeof t[k] === 'string') try { localStorage.setItem(key, t[k]); n++; } catch (e) {}
  if (n) for (const id of ['upkeepFrame']) { const f = $(id); if (f && f.dataset.on) { delete f.dataset.on; f.removeAttribute('srcdoc'); f.removeAttribute('src'); } }
}
async function exportBackup() {
  const at = Date.now(), data = { ...(plan ? planReal() : state), lastBackup: at }, tabs = tabsOut(); if (tabs) data.tabs = tabs;   // v311: the real books, dated
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name = `budget-backup-${today()}.json`;
  const done = () => { state.lastBackup = at; save(); render(); };
  try { const f = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Budget backup' }); done(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); done();
}
$('exportBtn').onclick = exportBackup;
$('palGrid').addEventListener('click', e => { const b = e.target.closest('[data-pal]'); if (!b) return; state.palette = b.dataset.pal; save(); palApply(); render(); });   // v214
$('importBackupBtn').onclick = () => $('backupFile').click();
$('suRestore').onclick = () => $('backupFile').click();   // v204: a fresh install can bring its backup straight back
$('backupFile').onchange = async e => { try { await restoreBackup(e.target.files[0]); } finally { e.target.value = ''; } };   // v311: cleared every time
async function restoreBackup(f) {
  if (!f) return;
  try { const s = JSON.parse(await f.text()); if (s.version !== 2 || !Array.isArray(s.transactions)) throw 0;
    if (!await ask('Replace everything on this device with this backup?')) return;
    const tabs = s.tabs; delete s.tabs;   // v311: written back once the budget is saved
    // v136: try it first; if it can't be shown, put the old data back untouched
    const old = state, oldCarts = carts, oldPlan = plan, raw = (() => { try { return localStorage.getItem(KEY); } catch (e2) { return null; } })();
    plan = null;   // v311: a restore ends Planning mode
    try { state = tidy(s); carts = state.carts || []; render(); }
    catch (bad) {
      state = old; carts = oldCarts; plan = oldPlan; try { if (raw != null) localStorage.setItem(KEY, raw); } catch (e2) {}
      try { render(); } catch (e2) {}
      toast("That backup couldn't be loaded. Your data wasn't changed."); return;
    }
    if (!state.needsSetup) $('setup').classList.add('hidden');   // v204: restored from the setup screen
    save(); const kept = (() => { try { return localStorage.getItem(KEY) !== raw; } catch (e2) { return false; } })();   // v311: saved, or save() said it couldn't
    if (kept && tabs && typeof tabs === 'object') tabsBack(tabs);
    render(); if (kept) toast('Backup restored');
  } catch (err) { toast('That file is not a budget backup'); }
}
$('resetBtn').onclick = async () => {
  if (!await ask('Clear history? All transactions, money moves, savings and spare change are deleted. Your bills and pots stay set up. This cannot be undone.')) return;
  state.transactions = []; state.transfers = []; state.workerLog = []; state.savings.start = 0; carts = []; state.carts = [];
  state.checks = {}; state.adjusts = []; state.goneCats = [];
  state.extras = []; state.roundOff = null; state.roundNews = null; clearTimeout(roTimer); roNext = Infinity;   // v135: these are history too
  // v311: the books start again today, like a setup: no payday or bill from before comes back
  state.startAt = Date.now(); state.startMonth = today().slice(0, 7); state.headStart = true; state.billSkips = {}; state.purse = { wk: ymd(weekStart()), P: 0, extra: 0 }; delete state.lastTrip; delete state.cutCrews;
  delete state.built; delete state.payNews; delete state.bonusNews;   // v311: and the news about what was cleared (a goal reached, a paycheck)
  plan = null;   // v311: and Planning mode ends
  save(); render(); toast('History cleared');
  openBankCheck(true);   // v136: so Savings doesn't sit far below zero
};
// Sample data for testing: the normal setup plus a few purchases (with cents for the scavenger),
// some savings and two extra pots with money in them.
function demoState() {
  const s = freshState(), m = month, d = n => `${m}-${String(n).padStart(2, '0')}`;
  s.needsSetup = false; s.incomes = [{ id: 'job', name: 'Day job', amount: 1200, every: 14, anchor: '2026-10-09' }];
  for (const [name, budget, dueDay, match] of DEMO_BILLS) {
    const c = { id: uid(), name, budget, kind: 'bill', dueDay, account: 'Chase' };
    s.categories.push(c); if (match) s.rules.push({ id: uid(), match, categoryId: c.id });
  }
  const buys = [[2, 'STARBUCKS #1234', 5.75], [5, 'SHELL OIL 5544', 42.00], [6, 'TACO BELL', 11.37], [7, 'TARGET', 23.49]];
  for (const [day, desc, amt] of buys) s.transactions.push({ id: uid(), date: d(day), amount: -amt, description: desc, categoryId: null, account: 'Current', source: 'manual' });
  s.savings.start = 1500; s.goals = { savings: 1000 };
  const car = { id: uid(), name: 'Car repairs' }, trip = { id: uid(), name: 'Vacation' };
  s.pots.push(car, trip); s.goals[car.id] = 500; s.goals[trip.id] = 800;
  s.transfers.push({ id: uid(), date: d(1), from: 'savings', to: car.id, amount: 60 }, { id: uid(), date: d(1), from: 'savings', to: trip.id, amount: 40 });
  s.presets = [{ id: uid(), name: 'Food', amount: 12 }, { id: uid(), name: 'Coffee', amount: 6 }, { id: uid(), name: 'Gas', amount: 40 }];
  // a few workers already farming, hired earlier this month
  const ago = days => Math.max(monthStartMs(m), Date.now() - days * DAY_MS);
  s.workerLog.push({ t: ago(5), pot: 'savings', delta: 3 }, { t: ago(3), pot: trip.id, delta: 2 });
  return s;
}
$('demoBtn').onclick = async () => {
  if (!await ask('Load the demo? Everything on this device is replaced with sample data.')) return;
  loadDemo();
};
function loadDemo() {
  plan = null;   // v311: the demo ends Planning mode
  $('setup').classList.add('hidden');
  state = demoState(); carts = []; for (const k in incoming) delete incoming[k];
  state.startMonth = month; state.partyPlan = 18;
  // as if you started on the 1st with $1,500 in the bank, and every payday since brought $1,200.37
  state.startAt = monthStartMs(month) + 60e3;
  for (const p of paydaysUpTo(today())) state.checks[p.key] = { amt: 1200.37, at: Math.min(Date.now(), dayMs(p.date) + 9 * 3600e3) };
  state.packs = [{ id: 'food', name: 'Food', amount: 25 }, { id: 'gas', name: 'Gas', amount: 40 }];
  for (const t of state.transactions) { if (/SHELL/.test(t.description)) t.pack = 'gas'; else if (/TACO|TARGET/.test(t.description)) t.pack = 'food'; }
  state.workerLog = [{ t: monthStartMs(month), pot: 'party', delta: 18 }, { t: Date.now() - 3 * DAY_MS, pot: state.pots[1].id, delta: 2 }];
  state.coll[month] = { job: Math.max(0, gatherF(month) - 30 / Math.max(1, incomeFor(month))) };   // about $30 waiting on the farm
  state.habitLog.push({ t: Date.now() - 40 * 60e3, habit: 'water' });
  state.lastWeek = ymd(weekStart()); state.purse = { wk: ymd(weekStart()), P: 0, extra: 0 }; state.lastTrip = { amount: 23.4, to: 'savings', date: ymd(new Date(weekStart().getTime() - DAY_MS / 2)), seen: false, gold: 6900 };
  state.gold = [{ t: Date.now() - 3 * DAY_MS, amt: 41200, why: 'Collected $206 of pay' }, { t: Date.now() - 2 * DAY_MS, amt: 6900, why: 'Party brought home $23' }, { t: Date.now() - 40 * 60e3, amt: 100, why: 'Drink water', key: 'habit|water|' + today() }];   // most of it collected, a little loot waiting
  save(); render(); toast('Demo loaded');
}
$('wipeBtn').onclick = async () => {
  if (!await ask('Reset your account? Everything in this app on this device is deleted and it opens like the first time. Export a backup first if you might want it back. This cannot be undone.')) return;
  try { Object.keys(localStorage).filter(k => k.startsWith(KEY + '-') && !(CHANNEL === 'main' && /^budget-app-v2-share(-|$)/.test(k))).forEach(k => localStorage.removeItem(k)); } catch (e) {}   // the town's remembered spots and the like (never the sister's copy: v135)
  window.__wiping = true;   // v311: nothing saves the cards' amounts again on the way out
  try { [...Object.values(TAB_KEYS), ...(CHANNEL === 'main' ? ['budget-day-ends.v1', 'budget-seen-v1'] : ['budget-seen-v1-' + CHANNEL])].forEach(k => { localStorage.removeItem(k); localStorage.removeItem(k + '.bad'); }); } catch (e) {}   // v311: Upkeep and the pet start over too (the look stays)
  plan = null; state = freshState(); carts = []; save(); location.reload();   // a clean start, like opening it the first time
};
