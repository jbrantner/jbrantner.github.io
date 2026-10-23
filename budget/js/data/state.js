'use strict';
// Sample bills for the demo only. A real start is a blank slate filled in by the setup screen.
const DEMO_BILLS = [['Rent', 900, 1, 'RENT'], ['Car insurance', 120, 5, 'INSURANCE'], ['Phone', 60, 15, ''], ['Internet', 50, 20, ''], ['Streaming', 15, null, 'NETFLIX']];
const START_SPEND = [];
function freshState() {
  const d0 = new Date(), now0 = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  const s = { version: 2, currency: '$', theme: '', income: 0, pay: { amount: 0, anchor: now0 }, needsSetup: true,
    incomes: [{ id: 'job', name: 'Paycheck', amount: 0, every: 14, anchor: now0 }], coll: {}, habitLog: [],
    habits: [{ id: 'water', name: 'Drink water' }, { id: 'pushups', name: 'Push-ups' }, { id: 'walk', name: 'Go for a walk' }, { id: 'read', name: 'Read 10 minutes' }],
    accounts: ['Chase', 'Current'], categories: [],
    // Transactions: amount < 0 is money out, amount > 0 is money in.
    transactions: [], rules: [],
    // Paychecks as they landed ('incomeId|date' -> { amt, at }), bank balance fixes, and categories deleted after they cost something.
    checks: {}, adjusts: [], goneCats: [],
    savings: { goal: 0, goalName: '', start: 0, sprite: null },
    // Pots: "bills" and "spend" (everything else) are refilled every month from income; "savings"
    // and any pots you add keep their balance month to month. Transfers move money between them.
    pots: [], transfers: [],
    // How purchases round. 'up': $1.99 counts as $2 and 1¢ goes to the scavenger.
    // 'down': $1.99 counts as $1 and 99¢ goes to the scavenger (pots then run ahead of the bank).
    scavengerMode: 'up',
    amountMode: 'keys',   // how you enter what you spent: 'keys' (a keypad, with digit wheels that turn along) or 'count' (bills and coins)
    goals: {}, goalMonths: {}, featured: 'savings', duel: { a: 'spend', b: 'savings' },
    combos: [],
    inc: 5, carts: [], workerLog: [], presets: [], collected: {}, harvested: {}, rush: {},
    potTraders: {} }; // saved split combos: { id, from: [potIds], to: [potIds] }
  for (const [name, budget, account] of START_SPEND) s.categories.push({ id: uid(), name, budget, kind: 'spend', dueDay: null, account });
  return s;
}
// Fixes for data saved by older versions, on every load and every restored backup.
function migrate(s) {
  // The first week's purse comes out of what you had when you started. Before version 70 it was
  // added on top of it, so the $1,430 in the bank counted as $1,535.
  s.transfers = (s.transfers || []).filter(t => !(t.headStart && t.from === 'start'));
  s.goals = s.goals || {}; s.goalMonths = s.goalMonths || {};   // goals set in months of bills (version 73)
  s.checks = s.checks || {}; s.adjusts = s.adjusts || []; s.goneCats = s.goneCats || [];   // paydays and bank fixes (version 78)
  return s;
}
// v135: the clean-up a saved state gets when it loads; a restored backup gets it too
function tidy(s) {
  {
    s.savings = s.savings || { goal: 0, goalName: '', start: 0, sprite: null };
    delete s.shares; s.pots = s.pots || []; s.transfers = s.transfers || []; s.scavengerMode = s.scavengerMode || 'up';
    if (!s.goals) { s.goals = {}; if (s.savings.goal) s.goals.savings = s.savings.goal; }
    s.featured = s.featured || 'savings'; s.combos = s.combos || []; s.inc = s.inc || 5; s.carts = s.carts || []; s.workerLog = s.workerLog || []; s.presets = s.presets || [];
    s.pay = s.pay || { amount: Math.round(Number(s.income || 0) / 2), anchor: '2026-10-09' };   // v311: before incomes reads it (a save without it threw)
    s.incomes = s.incomes || [{ id: 'job', name: 'Day job', amount: Number(s.pay.amount || 0), every: 14, anchor: s.pay.anchor || '2026-10-09' }];
    s.coll = s.coll || {}; s.habitLog = s.habitLog || [];
    if (!s.startMonth) { const d = new Date(); s.startMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); s.partyPlan = 0; s.workerLog = s.workerLog.filter(w => w.pot !== 'savings'); }
    s.habits = s.habits || [{ id: 'water', name: 'Drink water' }, { id: 'pushups', name: 'Push-ups' }, { id: 'walk', name: 'Go for a walk' }, { id: 'read', name: 'Read 10 minutes' }]; s.rush = s.rush || {}; s.harvested = s.harvested || {}; s.collected = s.collected || {};
    s.potTraders = s.potTraders || {}; s.duel = s.duel || { a: 'spend', b: 'savings' };
    for (const t of s.transactions.filter(t => t.savings)) // older "Save it" entries become transfers
      s.transfers.push({ id: t.id, date: t.date, from: t.amount < 0 ? 'spend' : 'savings', to: t.amount < 0 ? 'savings' : 'spend', amount: Math.abs(t.amount) });
    s.transactions = s.transactions.filter(t => !t.savings);
    s.workerLog = s.workerLog.filter(w => !(w && w.draft)); s.transfers = s.transfers.filter(x => !(x && x.draft));   // v311: v306-308 drafts, on a restore too
    return migrate(s); }
}
function load() {
  let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) {}
  const read = t => { try { const s = JSON.parse(t); if (s && s.version === 2) return tidy(s); } catch (e) {} return null; };
  let s = read(raw); if (raw == null || (s && !(s.unread && s.needsSetup))) return s || freshState();
  // v311: saved data this version can't read is never lost. It's copied to KEY-broken-date before anything can save over it (a fresh
  // start is saved by the first render), and until you set up or restore a backup, each start tries that copy again (a newer version
  // may read it) and the setup screen says so.
  if (s) { const t = read((() => { try { return localStorage.getItem(s.unread); } catch (e) { return null; } })()); if (t) return t; }
  else { const f = freshState(), d = f.pay.anchor; let k = null;
    try { k = Object.keys(localStorage).find(x => x.startsWith(KEY + '-broken-') && localStorage.getItem(x) === raw) || null;
      if (!k) { k = KEY + '-broken-' + d; for (let n = 2; localStorage.getItem(k) != null; n++) k = KEY + '-broken-' + d + '-' + n;
        try { localStorage.setItem(k, raw); } catch (e) { localStorage.removeItem(KEY); try { localStorage.setItem(k, raw); } catch (e2) { localStorage.setItem(KEY, raw); k = null; } } }   // no room for two: moved
    } catch (e) { k = null; }
    s = f; if (k) s.unread = k; }
  const r = document.getElementById('suRestore'); if (r) r.insertAdjacentHTML('beforebegin', `<p class="muted" role="alert" style="margin-top:0; color:var(--bad)">Your saved data couldn't be read.${s.unread ? ' A copy is kept on this phone.' : ''}</p>`);
  return s;
}
let state = load();
setTimeout(() => packOld(), 0);   // v311: old history folded (after the first render)
try { setTimeout(() => palApply(), 0); } catch (e) {}
function save() {
  booksGen++; if (typeof needMemo !== 'undefined') needMemo.clear();
  if (!clockBack()) state.seenAt = Math.max(Number(state.seenAt) || 0, Date.now());   // v137
  let ok = true; try { localStorage.setItem(KEY, JSON.stringify(plan ? planReal() : state)); } catch (e) { ok = false; toast('Could not save on this device'); }
  saveBar(!ok);   // v311
}
// v311: while saving fails (the phone's storage for this app is full), a banner says so at the top of Home, in the clock
// banner's look; the toast alone was gone in 2 seconds. It goes when a save works.
function saveBar(on) {
  const b = document.getElementById('saveBar'), at = document.getElementById('homeList');
  if (!on) { if (b) b.remove(); return; }
  if (b || !at) return;
  at.insertAdjacentHTML('beforebegin', `<div id="saveBar" role="status" style="margin: 4px 0 10px; padding: 10px 14px; border: 1px solid var(--warn); border-radius: 14px; background: var(--card); color: var(--text); font-size: 13.5px; line-height: 1.4;">Your phone is out of room for this app's data, so changes aren't being saved. Export a backup in Settings.</div>`);
}
