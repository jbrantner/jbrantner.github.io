'use strict';
/* Paycheck: a budget that runs on one number you type, your bank balance.
   From it, your bills, your paydays and your cushion, it shows what you can spend until payday, with every bill covered
   for the next four paydays. No logging purchases, no moving money between pots. Every amount is in cents. */
const APP_VERSION = 1;
const KEY = 'paycheck';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AHEAD = 4;

/* ---------- money and dates ---------- */
const toC = v => { const n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const dollars = c => (Math.max(0, c) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m = c => '$' + dollars(c);
const mWhole = c => '$' + Math.floor(Math.max(0, c) / 100).toLocaleString();
const mSplit = c => { const s = dollars(c), i = s.lastIndexOf('.'); return `$${s.slice(0, i)}<span class="c">${s.slice(i)}</span>`; };
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = () => isoOf(new Date());
const isoAdd = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return isoOf(x); };
const days = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const dayTxt = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const wkTxt = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const ymOf = d => d.slice(0, 7);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const ISO = /^\d{4}-\d\d-\d\d$/;

/* ---------- saved data ---------- */
// bank: what you typed last (cents) · pay: next payday, how often, usual paycheck · adv: pay advance owed + step down
// bills: monthly {id,name,amt,due,goal,until} · once: one-time {id,name,amt,date} · cleared: {'YYYY-MM': {billId: principal|true}}
// goals: things you're paying back {id,name,owed,start,apr} · cushion: kept in the bank, never spending money
const blank = () => ({ v: 1, bank: null, bankAt: null, last: null, pay: null, adv: null, bills: [], once: [], cleared: {}, goals: [], cushion: 0, cushionGoal: 100000 });
function fix(s) {
  const b = blank(), c = n => Math.max(0, Math.round(Number(n) || 0));
  if (!s || typeof s !== 'object') return b;
  b.bank = s.bank == null ? null : c(s.bank); b.bankAt = typeof s.bankAt === 'string' ? s.bankAt : null;
  b.last = s.last && typeof s.last === 'object' ? { at: String(s.last.at || ''), spent: c(s.last.spent), days: c(s.last.days) } : null;
  if (s.pay && ISO.test(s.pay.next)) b.pay = { next: s.pay.next, every: +s.pay.every === 7 ? 7 : 14, amt: c(s.pay.amt) };
  if (s.adv && c(s.adv.owed)) b.adv = { owed: c(s.adv.owed), step: c(s.adv.step) || 10000 };
  b.goals = (Array.isArray(s.goals) ? s.goals : []).filter(g => g && g.id).map(g => ({ id: String(g.id), name: String(g.name || 'Goal').slice(0, 40), owed: c(g.owed), start: Math.max(c(g.start), c(g.owed)), apr: Math.min(100, Math.max(0, Number(g.apr) || 0)) }));
  b.bills = (Array.isArray(s.bills) ? s.bills : []).filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || 'Bill').slice(0, 40), amt: c(x.amt), due: x.due >= 1 && x.due <= 31 ? Math.round(x.due) : 1, goal: x.goal && b.goals.some(g => g.id === x.goal) ? String(x.goal) : null, until: /^\d{4}-\d\d$/.test(x.until) ? x.until : null, from: /^\d{4}-\d\d$/.test(x.from) ? x.from : null }));
  b.once = (Array.isArray(s.once) ? s.once : []).filter(x => x && x.id && ISO.test(x.date)).map(x => ({ id: String(x.id), name: String(x.name || 'Bill').slice(0, 40), amt: c(x.amt), date: x.date, done: !!x.done }));
  b.cleared = s.cleared && typeof s.cleared === 'object' ? s.cleared : {};
  b.cushion = c(s.cushion); b.cushionGoal = s.cushionGoal == null ? 100000 : c(s.cushionGoal);
  return b;
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return fix(s); } catch (e) {} return blank(); }
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Couldn't save on this phone"); } }

/* ---------- bills on the calendar ---------- */
const clearedIn = mk => state.cleared[mk] || (state.cleared[mk] = {});
const isCleared = (b, mk) => !!(state.cleared[mk] || {})[b.id];
const activeIn = (b, mk) => (!b.until || mk <= b.until) && (!b.from || mk >= b.from);
const billsMonth = (mk = today().slice(0, 7)) => state.bills.filter(b => activeIn(b, mk)).reduce((a, b) => a + b.amt, 0);
const nextMk = () => { const d = new Date(); return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7); };
// Every bill not out yet from `from` up to (not including) `to`. One still owed from earlier this month counts today.
function events(from, to) {
  const out = [], f = new Date(from + 'T12:00');
  for (let k = 0; k < 5; k++) {
    const y = f.getFullYear(), mo = f.getMonth() + k, mk = isoOf(new Date(y, mo, 1)).slice(0, 7), last = new Date(y, mo + 1, 0).getDate();
    for (const b of state.bills) {
      if (!b.amt || isCleared(b, mk) || !activeIn(b, mk)) continue;
      let d = isoOf(new Date(y, mo, Math.min(b.due, last)));
      if (d < from) { if (k > 0) continue; d = from; }
      if (d < to) out.push({ d, due: isoOf(new Date(y, mo, Math.min(b.due, last))), amt: b.amt, name: b.name, id: b.id, mk, kind: 'bill' });
    }
  }
  for (const o of state.once) if (!o.done && o.amt) { const d = o.date < from ? from : o.date; if (d < to) out.push({ d, due: o.date, amt: o.amt, name: o.name, id: o.id, kind: 'once' }); }
  return out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.name.localeCompare(b.name));
}

/* ---------- the plan ---------- */
// Walk the next four paydays: each paycheck lands (less the advance paid back, plus what's borrowed again), every bill
// goes out on its day, and each later pay period spends the same steady amount, a paycheck less half a month's bills (a
// normal month has two paychecks, so a third is a bonus). What you can spend now is the lowest the bank gets on the way.
function paydays() {   // the next payday (today, if one has come and you haven't said it landed) and the four after it
  const P = state.pay; if (!P) return null;
  const t = today(), out = [P.next < t ? t : P.next]; let n = P.next;
  while (out.length <= AHEAD) { n = isoAdd(n, P.every); if (n > out[out.length - 1]) out.push(n); }
  return out;
}
function plan() {
  const P = state.pay; if (!P || !P.amt || state.bank == null) return null;
  const t = today(), pays = paydays();
  let owed = state.adv ? state.adv.owed : 0; const step = state.adv ? state.adv.step : 0;
  const inc = pays.slice(0, AHEAD).map(d => { const borrow = Math.max(0, owed - step), amt = Math.max(0, P.amt - owed + borrow), back = owed; owed = borrow; return { d, amt, back, borrow }; });
  const ev = events(t, pays[AHEAD]), avg = inc.reduce((a, x) => a + x.amt, 0) / AHEAD;
  const steady = Math.max(0, Math.floor((avg - billsMonth(nextMk()) / (P.every === 7 ? 4 : 2)) / 100) * 100);
  const start = state.bank - state.cushion;
  const lowWith = (now, per) => {   // the lowest the bank gets if you spend `now` before payday and `per` each pay period after
    let bal = start - now, low = bal, i = 0;
    const walk = upto => { while (i < ev.length && ev[i].d < upto) { bal -= ev[i++].amt; low = Math.min(low, bal); } };
    for (let k = 0; k < AHEAD; k++) { walk(pays[k]); bal += inc[k].amt - per; low = Math.min(low, bal); }
    walk(pays[AHEAD]); return low;
  };
  const dleft = Math.max(1, days(t, pays[0])), share = s => Math.floor(s * Math.min(P.every, dleft) / P.every);
  let per = steady, left, short = 0;
  if (lowWith(0, steady) >= 0) left = lowWith(0, steady);   // a full share every payday: whatever's left over is yours now
  else if (lowWith(0, 0) < 0) { per = 0; left = 0; short = -lowWith(0, 0); }   // the bills alone need more than is coming
  else {   // tight: spread what there is evenly, the same each pay period and a fair share now
    let lo = 0, hi = steady; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (lowWith(share(mid), mid) >= 0) lo = mid; else hi = mid; }
    per = Math.floor(lo / 100) * 100; left = share(per); short = steady - per;
  }
  const periods = pays.slice(0, AHEAD).map((d, k) => ({ pay: d, inc: inc[k], bills: ev.filter(x => x.d >= d && x.d < pays[k + 1]), next: pays[k + 1] }));
  const before = ev.filter(x => x.d < pays[0]);
  return { pay: pays[0], left, steady: per, normal: steady, perDay: Math.floor(left / dleft), dleft, payToday: pays[0] === t, before, beforeAmt: before.reduce((a, x) => a + x.amt, 0), periods, through: isoAdd(pays[AHEAD], -1), short, tight: per < steady, held: Math.max(0, start - left) };
}
// More than a normal pay period's spending sitting here: offer to keep the extra as cushion.
function extraForCushion(Z) {
  if (!Z || !state.pay) return 0;
  const normal = Z.steady * Math.min(state.pay.every, Z.dleft) / state.pay.every, x = Math.floor((Z.left - normal) / 2500) * 2500;
  return x >= 2500 ? x : 0;
}

/* ---------- payback goals ---------- */
const monthInt = g => Math.round(g.owed * g.apr / 1200);
function goalBills(g) { return state.bills.filter(b => b.goal === g.id); }
function payoffMonths(g) {   // month by month, each linked bill only in its own months
  if (!g.owed) return 0; const L = goalBills(g); if (!L.length) return null;
  const d = new Date(); let o = g.owed, n = 0;
  while (o > 0 && n < 600) { const mk = isoOf(new Date(d.getFullYear(), d.getMonth() + n + 1, 1)).slice(0, 7), pay = L.filter(b => activeIn(b, mk)).reduce((a, b) => a + b.amt, 0), i = Math.round(o * g.apr / 1200);
    if (pay <= i && n > 24) return null; o = Math.max(0, o + i - pay); n++; }
  return n >= 600 ? null : n;
}
const goalPayNow = g => goalBills(g).filter(b => activeIn(b, today().slice(0, 7))).reduce((a, b) => a + b.amt, 0);
const monthOut = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); };

/* ---------- screens ---------- */
let tab = 'home';
function render() {
  $('dateLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (tab === 'bills') { $('homeList').innerHTML = billsTop(); $('townList').innerHTML = billsAll(); }
  else { $('homeList').innerHTML = heroCard(); $('townList').innerHTML = comingUp() + goalsHTML(); }
}
function heroCard() {
  if (!state.pay || !state.pay.amt) return `<div class="vl-hero pp-panel mh-have"><div class="mh-cu"><span class="vl-k">Let's set up</span><span class="vl-sub">Add your payday and usual paycheck in Settings, then your bills. Or bring them in from the simple app.</span></div><div class="pc-row"><button class="big" data-go="settings">Open Settings</button><button data-act="fromsimple">Bring in from the simple app</button></div></div>`;
  if (state.bank == null) return `<div class="vl-hero pp-panel mh-have"><div class="mh-cu"><span class="vl-k">What's in your bank?</span><span class="vl-sub">That's the only thing you ever type here. Check your bank app and tap below.</span></div><div class="pc-row"><button class="big" data-act="bank">Type my bank balance</button></div></div>`;
  const Z = plan(), x = extraForCushion(Z), ago = state.bankAt ? Math.floor((Date.now() - new Date(state.bankAt)) / 36e5) : 0;
  const agoTxt = ago < 1 ? 'just now' : ago < 24 ? `${ago} hour${ago === 1 ? '' : 's'} ago` : `${Math.floor(ago / 24)} day${ago < 48 ? '' : 's'} ago`;
  const fill = state.bank > 0 ? Math.min(1, Z.left / Math.max(1, state.bank)) : 0;
  const L = state.last;
  return `<div class="vl-hero pp-panel mh-have"><div class="mh-cu"><span class="vl-k">You can spend <small>until ${Z.payToday ? 'your next payday' : wkTxt(Z.pay)}</small></span>`
    + `<span class="vl-total num">${mSplit(Z.left)}</span><span class="mh-bar" aria-hidden="true"><i style="width:${(fill * 100).toFixed(1)}%"></i></span>`
    + `<span class="pc-day">About <b>${mWhole(Z.perDay)} a day</b> for ${Z.dleft} day${Z.dleft === 1 ? '' : 's'}</span>`
    + `<div class="pc-mini"><div>In your bank<b class="num">${mWhole(state.bank)}</b></div><div>Saved for bills<b class="num">${mWhole(Z.held)}</b></div><div>Cushion<b class="num">${mWhole(state.cushion)}</b></div></div>`
    + `<span class="vl-sub">${Z.tight ? Z.steady ? `Every bill is covered through ${dayTxt(Z.through)} ✓ Money is snug, so this spreads it evenly: about <b>${mWhole(Z.steady)}</b> each payday too. Overtime lifts it. Update your bank when your paycheck lands.` : `Your bills need about ${mWhole(Z.short)} more than is coming before ${dayTxt(Z.through)}. Overtime or a skipped extra covers it. Update your bank when money lands.` : `Every bill is covered through ${dayTxt(Z.through)} ✓ Then about <b>${mWhole(Z.steady)}</b> to spend each payday.`}</span>`
    + (L && L.days ? `<span class="pc-since">Since your last update: about <b>${mWhole(L.spent)}</b> spent${L.days > 1 ? ` (${mWhole(L.spent / L.days)} a day)` : ''}.</span>` : '')
    + `<span class="${ago >= 48 ? 'pc-old' : 'pc-since'}">Bank updated ${agoTxt}${ago >= 48 ? '. Update it so this stays right' : ''}</span>`
    + `</div><div class="pc-row"><button class="big" data-act="bank">Update bank balance</button><button data-act="paydays">See paydays</button>${x ? `<button data-act="keep" data-v="${x}">Keep ${mWhole(x)} as cushion</button>` : ''}</div></div>`;
}
function comingUp() {
  const Z = plan(); if (!Z) return '';
  let h = `<div class="pp-sec pp-sec-home"><h3 class="pp-h2">Before ${Z.payToday ? 'next payday' : dayTxt(Z.pay)}</h3><span><b class="num">${m(Z.beforeAmt)}</b></span></div><div class="pp-panel pc-list">`;
  h += Z.before.length ? Z.before.map(x => `<div class="pc-li"><span class="grow"><b>${esc(x.name)}</b><small>${x.due < today() ? 'was due ' + dayTxt(x.due) + ', not out yet' : x.due === today() ? 'due today' : 'due ' + wkTxt(x.due)}</small></span><span class="num">${m(x.amt)}</span></div>`).join('')
    : `<div class="pc-li"><span class="grow">No bills before payday ✓</span></div>`;
  const nx = Z.periods[0];
  h += `</div><div class="pp-sec pp-sec-home"><h3 class="pp-h2">Payday ${dayTxt(nx.pay)}</h3><span>about <b class="num">${m(nx.inc.amt)}</b> lands</span></div><div class="pp-panel pc-list">`
    + (nx.bills.length ? nx.bills.map(x => `<div class="pc-li"><span class="grow"><b>${esc(x.name)}</b><small>${wkTxt(x.d)}</small></span><span class="num">${m(x.amt)}</span></div>`).join('') : `<div class="pc-li"><span class="grow">No bills that pay period</span></div>`)
    + `<div class="pc-tot"><span>Bills until ${dayTxt(nx.next)}</span><span class="num">${m(nx.bills.reduce((a, x) => a + x.amt, 0))}</span></div></div>`;
  return h;
}
function pips(f) { const n = Math.min(1, Math.max(0, f)) * 10; let h = ''; for (let i = 0; i < 10; i++) h += i + 1 <= n ? '<i class="on"></i>' : i < n ? `<i class="part" style="--p:${((n - i) * 100).toFixed(0)}%"></i>` : '<i></i>'; return `<div class="pp-pips" aria-hidden="true">${h}</div>`; }
function goalsHTML() {
  let h = `<div class="pp-sec pp-sec-home"><h3 class="pp-h2">Goals</h3></div><div class="pp-list pp-one">`;
  const cg = state.cushionGoal || 100000;
  h += `<div class="pp-card proj live" style="--cc:#7ee8d0"><div class="pp-head"><span class="pp-nm"><em class="pp-kind">Safety</em><span class="pp-nmr"><b>Cushion</b>${state.cushion >= cg ? ' <span class="ok">✓</span>' : ''}</span></span><span class="pp-amt"><span class="num pp-roll">${mSplit(state.cushion)}</span><small>of ${mWhole(cg)}</small></span></div>`
    + pips(state.cushion / cg) + `<p class="pc-goalsay">Stays in your bank for surprises. Not spending money.</p><div class="pc-cbtn"><button class="pp-chip" data-act="cush" data-v="2500">+$25</button><button class="pp-chip" data-act="cush" data-v="5000">+$50</button>${state.cushion ? `<button class="pp-chip" data-act="cush" data-v="-2500">Use $25</button>` : ''}</div></div>`;
  for (const g of state.goals) {
    const n = payoffMonths(g), pay = goalPayNow(g) || goalBills(g).reduce((a, b) => a + b.amt, 0), paid = g.start - g.owed, later = goalBills(g).some(b => b.from && b.from > today().slice(0, 7));
    const say = !g.owed ? '<b class="ok">Paid back ✓</b>' : !pay ? 'Link a bill to it in Bills to track payments' : n == null ? `${m(pay)} a month doesn't cover the interest (${m(monthInt(g))})` : `${m(pay)} a month${later ? ', more later' : ''} · done about <b>${monthOut(n)}</b>${g.apr ? ` · ${g.apr}% interest` : ''}`;
    h += `<div class="pp-card proj live" style="--cc:#ffaba4"><button class="pp-head" data-act="editgoal" data-id="${g.id}"><span class="pp-nm"><em class="pp-kind">Paying back</em><span class="pp-nmr"><b>${esc(g.name)}</b></span></span><span class="pp-amt"><span class="num pp-roll">${mSplit(g.owed)}</span><small>left${paid > 0 ? ` · ${mWhole(paid)} paid` : ''}</small></span></button>`
      + pips(g.start ? paid / g.start : 0) + `<p class="pc-goalsay">${say}</p></div>`;
  }
  return h + `</div><button class="pp-big alt pp-add" data-act="newgoal">＋ Add a payback goal</button>`;
}
function billsTop() {
  const mk = today().slice(0, 7), mine = state.bills.filter(b => activeIn(b, mk)), out = mine.filter(b => isCleared(b, mk)), outAmt = out.reduce((a, b) => a + b.amt, 0), all = mine.reduce((a, b) => a + b.amt, 0);
  return `<div class="vl-hero pp-panel mh-have bs-bills"><div class="mh-cu"><span class="vl-k">Bills this month</span><span class="vl-total num">${mSplit(all)}</span>`
    + `<span class="mh-bar" aria-hidden="true"><i style="width:${(all ? outAmt / all * 100 : 0).toFixed(1)}%"></i></span><span class="vl-sub">${out.length} of ${mine.length} came out (${m(outAmt)}). Your bank updates tick them off.</span></div></div>`;
}
function billsAll() {
  const mk = today().slice(0, 7);
  const row = b => { const c = isCleared(b, mk), ok = activeIn(b, mk), notYet = b.from && b.from > mk;
    return `<div class="pc-li${c || !ok ? ' done' : ''}"><button class="grow link" style="text-align:left; padding:0; color:inherit" data-act="editbill" data-id="${b.id}"><b>${esc(b.name)}</b><small>day ${b.due}${b.goal ? ' · pays down ' + esc((state.goals.find(g => g.id === b.goal) || {}).name || '') : ''}${b.from ? ' · starts ' + new Date(b.from + '-15T12:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}${b.until ? ' · last one ' + new Date(b.until + '-15T12:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}</small></button><span class="num">${m(b.amt)}</span>`
      + (ok ? `<button class="vl-pay${c ? ' undo' : ''}" data-act="${c ? 'unclear' : 'clear'}" data-id="${b.id}">${c ? 'Undo' : 'Came out'}</button>` : `<small>${notYet ? 'later' : 'ended'}</small>`) + `</div>`; };
  const sorted = [...state.bills].sort((a, b) => a.due - b.due || a.name.localeCompare(b.name));
  let h = `<div class="pp-sec pp-sec-bills"><h3 class="pp-h2">Every month</h3><span><b class="num">${m(billsMonth())}</b></span></div><div class="pp-panel pc-list">${sorted.map(row).join('') || '<div class="pc-li">No bills yet</div>'}</div>`;
  const on = state.once.filter(o => !o.done).sort((a, b) => a.date < b.date ? -1 : 1);
  if (on.length) h += `<div class="pp-sec pp-sec-bills"><h3 class="pp-h2">Just once</h3></div><div class="pp-panel pc-list">${on.map(o => `<div class="pc-li"><button class="grow link" style="text-align:left; padding:0; color:inherit" data-act="editonce" data-id="${o.id}"><b>${esc(o.name)}</b><small>${wkTxt(o.date)}</small></button><span class="num">${m(o.amt)}</span><button class="vl-pay" data-act="clearonce" data-id="${o.id}">Came out</button></div>`).join('')}</div>`;
  return h + `<button class="pp-big alt pp-add" data-act="newbill">＋ Add a bill</button>`;
}

/* ---------- bill came out ---------- */
function clearBill(b, mk) {
  if (isCleared(b, mk)) return;
  const g = b.goal && state.goals.find(x => x.id === b.goal); let pr = true;
  if (g) { pr = Math.min(g.owed, Math.max(0, b.amt - monthInt(g))); g.owed -= pr; }
  clearedIn(mk)[b.id] = pr;
}
function unclearBill(b, mk) {
  const v = (state.cleared[mk] || {})[b.id]; if (v == null) return;
  const g = b.goal && state.goals.find(x => x.id === b.goal); if (g && typeof v === 'number') g.owed += v;
  delete state.cleared[mk][b.id];
}

/* ---------- bank update ---------- */
let bankAns = {};
function openBank() {
  const t = today(), list = askList();
  bankAns = {}; list.forEach(x => bankAns[x.key] = x.def);
  $('bankAmt').value = '';
  $('bankAsk').innerHTML = list.length ? `<div class="pc-ask"><h3>Has this come out yet?</h3>${list.map(x => `<div class="pc-li"><span class="grow"><b>${esc(x.name)}</b><small>${x.say}</small></span><span class="num">${m(x.amt)}</span><span class="pc-yn" data-key="${x.key}"><button type="button" data-yn="1">Yes</button><button type="button" data-yn="0">Not yet</button></span></div>`).join('')}</div>` : '';
  ynSync(); bankPrev(); showAsk('bankBox'); setTimeout(() => $('bankAmt').focus(), 60);
}
function askList() {   // the paycheck if payday's here, and bills due by today that aren't ticked off
  const t = today(), out = [];
  if (state.pay && state.pay.next <= t) { const Z0 = state.adv ? Math.max(0, state.pay.amt - state.adv.owed + Math.max(0, state.adv.owed - state.adv.step)) : state.pay.amt;
    out.push({ key: 'pay', name: 'Your paycheck', amt: Z0, say: state.pay.next === t ? 'payday is today' : 'was payday ' + dayTxt(state.pay.next), def: true }); }
  const mk = t.slice(0, 7), last = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate(), dnow = +t.slice(8);
  for (const b of [...state.bills].sort((a, b) => a.due - b.due)) {
    if (!b.amt || isCleared(b, mk) || !activeIn(b, mk) || Math.min(b.due, last) > dnow) continue;
    const due = Math.min(b.due, last); out.push({ key: 'b:' + b.id, name: b.name, amt: b.amt, say: due === dnow ? 'due today' : 'was due ' + dayTxt(mk + '-' + String(due).padStart(2, '0')), def: due < dnow });
  }
  for (const o of state.once) if (!o.done && o.date <= t) out.push({ key: 'o:' + o.id, name: o.name, amt: o.amt, say: o.date === t ? 'due today' : 'was due ' + dayTxt(o.date), def: o.date < t });
  return out;
}
function ynSync() { document.querySelectorAll('#bankAsk .pc-yn').forEach(s => s.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.yn === '1') === !!bankAns[s.dataset.key]))); }
function applyAnswers(S, ans) {   // on a copy: tick bills off, roll payday on
  const t = today(), mk = t.slice(0, 7); let paid = 0, landed = 0;
  for (const k in ans) {
    if (!ans[k]) continue;
    if (k === 'pay') { const P = S.pay; let owed = S.adv ? S.adv.owed : 0; const borrow = S.adv ? Math.max(0, owed - S.adv.step) : 0;
      landed = Math.max(0, P.amt - owed + borrow); if (S.adv) { if (borrow) S.adv.owed = borrow; else S.adv = null; }
      P.next = isoAdd(P.next, P.every); while (P.next <= t) P.next = isoAdd(P.next, P.every); }
    else if (k.startsWith('b:')) { const b = S.bills.find(x => x.id === k.slice(2)); if (b) { paid += b.amt; const keep = state; state = S; clearBill(b, mk); state = keep; } }
    else if (k.startsWith('o:')) { const o = S.once.find(x => x.id === k.slice(2)); if (o) { paid += o.amt; o.done = true; } }
  }
  return { paid, landed };
}
function bankPrev() {
  const v = $('bankAmt').value.trim(); if (v === '') { $('bankPrev').innerHTML = ''; $('bankGo').disabled = true; return; }
  $('bankGo').disabled = false;
  const S = fix(JSON.parse(JSON.stringify(state))); applyAnswers(S, bankAns); S.bank = toC(v);
  const keep = state; state = S; const Z = plan(); state = keep;
  $('bankPrev').innerHTML = Z ? `You can spend <b>${m(Z.left)}</b> until ${wkTxt(Z.pay)} (about ${mWhole(Z.perDay)} a day).` : '';
}
function bankGo() {
  const v = $('bankAmt').value.trim(); if (v === '') return;
  const before = state.bank, at = state.bankAt, r = applyAnswers(state, bankAns), now = toC(v);
  if (before != null && at) { const d = Math.max(1, days(isoOf(new Date(at)), today())), spent = before + r.landed - r.paid - now;
    state.last = spent > 0 ? { at: new Date().toISOString(), spent, days: d } : null; }
  state.bank = now; state.bankAt = new Date().toISOString(); save(); hideAsk(); render();
  const Z = plan(); toast(Z ? `${m(Z.left)} to spend until ${dayTxt(Z.pay)}` : 'Saved ✓');
}

/* ---------- bill dialog ---------- */
let billEdit = null, billKind = 'month';
function goalOpts(sel) { $('billGoal').innerHTML = `<option value="">Nothing</option>` + state.goals.map(g => `<option value="${g.id}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join(''); }
function setBillKind(k) { billKind = k; document.querySelectorAll('[data-bk]').forEach(b => b.classList.toggle('on', b.dataset.bk === k));
  $('billDueF').classList.toggle('hidden', k !== 'month'); $('billDateF').classList.toggle('hidden', k !== 'once'); $('billGoalF').classList.toggle('hidden', k !== 'month'); $('billUntilF').classList.toggle('hidden', k !== 'month'); }
function openBill(id, kind) {
  const b = id && (kind === 'once' ? state.once : state.bills).find(x => x.id === id); billEdit = b ? { id, kind } : null;
  setBillKind(b ? kind : 'month'); document.querySelector('#billBox .pc-seg').classList.toggle('hidden', !!b);
  $('billTitle').textContent = b ? 'Edit ' + b.name : 'Add a bill';
  $('billName').value = b ? b.name : ''; $('billAmt').value = b ? (b.amt / 100).toFixed(2) : '';
  $('billDue').value = b && b.due ? b.due : ''; $('billDate').value = b && b.date ? b.date : ''; $('billUntil').value = b && b.until ? b.until : ''; $('billFrom').value = b && b.from ? b.from : '';
  goalOpts(b && b.goal); $('billErr').textContent = ''; $('billDel').hidden = !b; showAsk('billBox');
}
function billGo() {
  const name = $('billName').value.trim(), amt = toC($('billAmt').value);
  if (!name) return $('billErr').textContent = 'Give it a name';
  if (!amt) return $('billErr').textContent = 'How much is it?';
  if (billKind === 'once') { const date = $('billDate').value; if (!ISO.test(date)) return $('billErr').textContent = 'Pick the date it comes out';
    const o = billEdit && state.once.find(x => x.id === billEdit.id); if (o) Object.assign(o, { name, amt, date }); else state.once.push({ id: uid(), name, amt, date, done: false }); }
  else { const due = Math.round(+$('billDue').value); if (!(due >= 1 && due <= 31)) return $('billErr').textContent = 'Due day is 1 to 31';
    const goal = $('billGoal').value || null, until = $('billUntil').value || null, from = $('billFrom').value || null, b = billEdit && state.bills.find(x => x.id === billEdit.id);
    if (b) Object.assign(b, { name, amt, due, goal, until, from }); else state.bills.push({ id: uid(), name, amt, due, goal, until, from }); }
  save(); hideAsk(); render();
}
function billDel() {
  if (!billEdit) return; const k = billEdit.kind, id = billEdit.id;
  confirmAsk('Delete this bill?', 'It comes off your plan. Nothing else changes.', 'Delete', () => { if (k === 'once') state.once = state.once.filter(x => x.id !== id); else state.bills = state.bills.filter(x => x.id !== id); save(); render(); });
}

/* ---------- goal dialog ---------- */
let goalEdit = null;
function openGoal(id) {
  const g = id && state.goals.find(x => x.id === id); goalEdit = g ? id : null;
  $('goalTitle').textContent = g ? 'Edit ' + g.name : 'Add a payback goal';
  $('goalName').value = g ? g.name : ''; $('goalOwed').value = g ? (g.owed / 100).toFixed(2) : ''; $('goalApr').value = g ? g.apr || '' : '';
  $('goalErr').textContent = ''; $('goalDel').hidden = !g; showAsk('goalBox');
}
function goalGo() {
  const name = $('goalName').value.trim(), owed = toC($('goalOwed').value), apr = Math.min(100, Math.max(0, +$('goalApr').value || 0));
  if (!name) return $('goalErr').textContent = 'Give it a name';
  const g = goalEdit && state.goals.find(x => x.id === goalEdit);
  if (g) { if (owed !== g.owed) g.start = Math.max(g.start, owed); Object.assign(g, { name, owed, apr }); }
  else state.goals.push({ id: uid(), name, owed, start: owed, apr });
  save(); hideAsk(); render();
}
function goalDel() { const id = goalEdit; confirmAsk('Delete this goal?', 'Bills linked to it stay, unlinked.', 'Delete', () => { state.goals = state.goals.filter(g => g.id !== id); state.bills.forEach(b => { if (b.goal === id) b.goal = null; }); save(); render(); }); }

/* ---------- paydays look-ahead ---------- */
function openPaydays() {
  const Z = plan(); if (!Z) return;
  let h = `<p class="muted" style="margin-top:0; font-size:13px">Planned on your usual paycheck of ${m(state.pay.amt)}${state.adv ? ', with the pay advance stepping down' : ''}. Overtime is extra on top.</p>`;
  h += `<div class="pc-pd"><div class="row"><b>Now until ${dayTxt(Z.pay)}</b><b class="num">${m(Z.left)} to spend</b></div><small>Bills: ${Z.before.length ? m(Z.beforeAmt) + ' (' + esc(Z.before.map(x => x.name).join(', ')) + ')' : 'none'}</small></div>`;
  for (const p of Z.periods) {
    const b = p.bills.reduce((a, x) => a + x.amt, 0);
    h += `<div class="pc-pd"><div class="row"><b>Payday ${dayTxt(p.pay)}</b><span class="num">${m(p.inc.amt)} lands</span></div>`
      + (p.inc.back ? `<small>Your ${m(p.inc.amt + p.inc.back - p.inc.borrow)} check, ${m(p.inc.back)} advance paid back${p.inc.borrow ? `, ${m(p.inc.borrow)} borrowed again` : ', advance done'}</small><br>` : '')
      + `<small>Bills until ${dayTxt(p.next)}: ${m(b)}${p.bills.length ? ' (' + esc(p.bills.map(x => x.name).join(', ')) + ')' : ''}</small><br><small>To spend: about ${m(Z.steady)}</small></div>`;
  }
  $('infoTitle').textContent = 'Your next paydays'; $('infoBody').innerHTML = h; showAsk('infoBox');
}

/* ---------- bring in from the simple app (same phone, same site) ---------- */
function fromSimple() {
  let s = null; try { s = JSON.parse(localStorage.getItem('budget-simple')); } catch (e) {}
  if (!s || s.v !== 1 || !Array.isArray(s.billList) || !s.billList.length) return toast('No simple app data on this phone');
  const S = blank(), mk = today().slice(0, 7), map = {};
  for (const p of s.pots || []) {
    if (p.debt) { const id = uid(); map[p.id] = id; S.goals.push({ id, name: p.name, owed: p.debt.owed, start: Math.max(p.debt.start || 0, p.debt.owed), apr: p.debt.apr || 0 }); }
    else if (p.kind === 'project' && /grammy|pappy|grand/i.test(p.name)) { const id = uid(); map[p.id] = id; S.goals.push({ id, name: p.name, owed: Math.max(0, p.goal - p.bal), start: p.goal, apr: 0 }); }
    else if (/cushion/i.test(p.name)) S.cushion += p.bal;
  }
  for (const b of s.billList) {
    let goal = b.debt && map[b.debt] || null;
    if (!goal) { const g = S.goals.find(g => g.name.toLowerCase().split(/\s+/)[0] === String(b.name).toLowerCase().split(/\s+/)[0]); if (g) goal = g.id; }
    const nb = { id: uid(), name: b.name, amt: b.amt, due: b.due || 1, goal, until: null }; S.bills.push(nb);
    if ((s.paid || {})[mk] && s.paid[mk][b.id]) (S.cleared[mk] = S.cleared[mk] || {})[nb.id] = true;
  }
  if (s.payday && ISO.test(s.payday.anchor)) { let n = s.payday.anchor; const ev = +s.payday.every === 7 ? 7 : 14; while (n < today()) n = isoAdd(n, ev); S.pay = { next: n, every: ev, amt: s.payday.amt || 0 }; }
  if (s.adv && s.adv.owed) S.adv = { owed: s.adv.owed, step: s.adv.step || 10000 };
  confirmAsk('Bring in the simple app?', `${S.bills.length} bills, ${S.goals.length} payback goals${S.pay ? ', your payday' : ''}${S.adv ? ' and the pay advance' : ''}. This replaces what's here. The simple app isn't changed. Then type your bank balance.`, 'Bring it in', () => { state = fix(S); save(); showView('home'); });
}

/* ---------- backup ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'paycheck', ...state }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `paycheck-${today()}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => { let s = null; try { s = JSON.parse(r.result); } catch (e) {}
    if (!s || s.v !== 1 || !Array.isArray(s.bills)) return toast("That file isn't a Paycheck backup");
    confirmAsk('Restore this backup?', 'It replaces what is in the app now.', 'Restore', () => { state = fix(s); save(); showView('home'); toast('Restored ✓'); }); };
  r.readAsText(file);
}

/* ---------- small things ---------- */
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
let lastFocus = null, askYes = null;
function showAsk(id) { lastFocus = document.activeElement; document.querySelectorAll('.ask').forEach(a => a.classList.add('hidden')); $(id).classList.remove('hidden'); }
function hideAsk() { document.querySelectorAll('.ask').forEach(a => a.classList.add('hidden')); try { lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true }); } catch (e) {} }
function confirmAsk(title, says, yes, fn) { $('askTitle').textContent = title; $('askSays').textContent = says; $('askYes').textContent = yes; askYes = fn; showAsk('askBox'); }

/* ---------- look (same as the budget apps) ---------- */
function palApply() {
  const r = document.documentElement.style, set = (k, v) => r.setProperty(k, palMap(v));
  if (!document.documentElement.classList.contains('look-b')) {
    set('--pal-sky', '#1d1240'); set('--pal-a', '#6ed0ff'); set('--pal-b', '#b89eff'); set('--pal-pk', '#2b7e50'); set('--c-bill', '#4c4c8c');
    for (const k of ['--pp-moss', '--pp-gold', '--accent', '--ok']) set(k, '#6ed0ff');
    set('--pp-ember', '#f594c3'); set('--pp-proj', '#73dee9'); set('--warn', '#fdc495');
    set('--pp-mint-dim', 'color-mix(in srgb, #6ed0ff 62%, #0b0a18)'); set('--pp-hollow', 'color-mix(in srgb, #6ed0ff 35%, #0b0a18)');
    set('--pp-moss-soft', 'color-mix(in srgb, #6ed0ff 18%, #0b0a18)'); set('--pp-gold-soft', 'color-mix(in srgb, #6ed0ff 18%, #0b0a18)');
    return;
  }
  set('--pal-sky', '#145466'); set('--pal-a', '#ff8a80'); set('--pal-b', '#ffd27a'); set('--pal-pk', '#ff8a80'); set('--c-bill', '#8e8ee6');
  for (const k of ['--pp-moss', '--accent', '--ok']) set(k, '#ff8a80');
  set('--pp-gold', '#ffaba4'); set('--pp-ember', '#ffd27a'); set('--pp-proj', '#ff9a92'); set('--warn', '#ffd27a');
  set('--pp-mint-dim', '#3f7686'); set('--pp-hollow', 'rgba(255, 138, 128, .5)');
  set('--pp-moss-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)'); set('--pp-gold-soft', 'color-mix(in srgb, #ff8a80 18%, #0b3d4c)');
}
function lookSync() { const k = document.documentElement.classList.contains('look-b') ? (palKey || 'b') : 'f'; document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x.dataset.look === k)); }
document.querySelectorAll('[data-look]').forEach(x => x.onclick = () => {
  const k = x.dataset.look, b = k !== 'f'; document.documentElement.classList.toggle('look-b', b); palKey = PAL_LOOKS[k] ? k : '';
  try { localStorage.setItem('paycheck-look', b ? 'b' : 'f'); localStorage.setItem('paycheck-pal', palKey); } catch (e) {}
  lookSync(); palRemap(document); palApply(); render();
});

/* ---------- views ---------- */
function showView(v) {
  tab = v === 'settings' ? tab : v;
  const st = v === 'settings';
  document.documentElement.classList.toggle('full', !st); document.documentElement.classList.toggle('st', st);
  $('view-home').classList.toggle('hidden', st); $('view-settings').classList.toggle('hidden', !st); $('bankFab').classList.toggle('hidden', st);
  $('settingsBtn').innerHTML = st ? '&#10005;' : '&#9881;';
  document.querySelectorAll('nav button').forEach(x => { const on = x.dataset.view === v; x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  if (st) setSync(); else { render(); const s = $('mainScroll'); if (s) s.scrollTop = 0; }
  window.scrollTo(0, 0);
}
function setSync() {
  const P = state.pay, val = c => c ? (c / 100).toFixed(2) : '';
  $('setPayNext').value = P ? P.next : ''; $('setPayEvery').value = P ? String(P.every) : '14'; $('setPayAmt').value = P ? val(P.amt) : '';
  $('setAdvOwed').value = state.adv ? val(state.adv.owed) : ''; $('setAdvStep').value = state.adv ? val(state.adv.step) : '';
  $('setCush').value = val(state.cushion); $('setCushGoal').value = val(state.cushionGoal);
}

/* ---------- taps ---------- */
document.addEventListener('click', e => {
  const yn = e.target.closest('#bankAsk [data-yn]'); if (yn) { bankAns[yn.parentElement.dataset.key] = yn.dataset.yn === '1'; ynSync(); bankPrev(); return; }
  const t = e.target.closest('[data-act], [data-go], nav button[data-view]'); if (!t) return;
  if (t.dataset.view) return showView(t.dataset.view);
  if (t.dataset.go) return showView(t.dataset.go);
  const a = t.dataset.act, id = t.dataset.id, mk = today().slice(0, 7);
  if (a === 'bank') openBank();
  else if (a === 'paydays') openPaydays();
  else if (a === 'keep') { const x = +t.dataset.v; confirmAsk('Keep it as cushion?', `${m(x)} more than a normal pay period's spending is here. Keep it in the bank as your cushion? Every bill stays covered.`, 'Keep it', () => { state.cushion += x; save(); render(); toast(`${m(x)} kept as cushion ✓`); }); }
  else if (a === 'cush') { const v = +t.dataset.v; state.cushion = Math.max(0, state.cushion + v); save(); render(); toast(v > 0 ? `Cushion ${m(state.cushion)} ✓` : `${m(-v)} back to spending money`); }
  else if (a === 'newbill') openBill(null);
  else if (a === 'editbill') openBill(id, 'month');
  else if (a === 'editonce') openBill(id, 'once');
  else if (a === 'clear') { const b = state.bills.find(x => x.id === id); if (b) { clearBill(b, mk); save(); render(); toast(`${b.name} came out ✓ Update your bank so the number stays right`); } }
  else if (a === 'unclear') { const b = state.bills.find(x => x.id === id); if (b) { unclearBill(b, mk); save(); render(); } }
  else if (a === 'clearonce') { const o = state.once.find(x => x.id === id); if (o) { o.done = true; save(); render(); } }
  else if (a === 'newgoal') openGoal(null);
  else if (a === 'editgoal') openGoal(id);
  else if (a === 'fromsimple') fromSimple();
});
$('bankFab').onclick = openBank;
$('settingsBtn').onclick = () => showView(document.documentElement.classList.contains('st') ? tab : 'settings');
$('settingsBack').onclick = () => showView(tab);
$('bankAmt').oninput = bankPrev; $('bankAmt').onkeydown = e => { if (e.key === 'Enter') bankGo(); };
$('bankCancel').onclick = hideAsk; $('bankGo').onclick = bankGo;
document.querySelectorAll('[data-bk]').forEach(b => b.onclick = () => setBillKind(b.dataset.bk));
$('billCancel').onclick = hideAsk; $('billGo').onclick = billGo; $('billDel').onclick = billDel;
$('goalCancel').onclick = hideAsk; $('goalGo').onclick = goalGo; $('goalDel').onclick = goalDel;
$('infoClose').onclick = hideAsk;
$('askNo').onclick = hideAsk; $('askYes').onclick = () => { const f = askYes; askYes = null; hideAsk(); if (f) f(); };
document.querySelectorAll('.ask').forEach(a => a.addEventListener('click', e => { if (e.target === a) hideAsk(); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideAsk(); });
$('setPaySave').onclick = () => { const n = $('setPayNext').value;
  if (!ISO.test(n)) { state.pay = null; save(); return toast('Payday cleared'); }
  state.pay = { next: n, every: +$('setPayEvery').value === 7 ? 7 : 14, amt: toC($('setPayAmt').value) }; save(); toast('Paycheck saved ✓'); };
$('setAdvSave').onclick = () => { const o = toC($('setAdvOwed').value); state.adv = o ? { owed: o, step: toC($('setAdvStep').value) || 10000 } : null; save(); toast(o ? 'Advance saved ✓' : 'No advance'); };
$('setCushSave').onclick = () => { state.cushion = toC($('setCush').value); state.cushionGoal = toC($('setCushGoal').value) || 100000; save(); toast('Cushion saved ✓'); };
$('exportBtn').onclick = exportBackup; $('importBtn').onclick = () => $('backupFile').click();
$('backupFile').onchange = e => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; };
$('fromSimpleBtn').onclick = fromSimple;
$('resetBtn').onclick = () => confirmAsk('Clear everything?', 'Removes all your bills, goals and settings from this app. Export a backup first if you might want them.', 'Clear', () => { state = blank(); save(); showView('home'); });
$('verLine').textContent = `Paycheck · version ${APP_VERSION}`;

/* ---------- start ---------- */
const setH = () => document.documentElement.style.setProperty('--appH', window.innerHeight + 'px');
window.addEventListener('resize', setH); setH();
palApply(); lookSync(); showView('home');
window.addEventListener('pageshow', () => render());
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
