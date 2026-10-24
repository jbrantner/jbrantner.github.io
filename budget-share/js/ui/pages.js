'use strict';
/* v274 (Jordan 17:09): Categories, opened from the type bars on the weekly card. Changes save as you go. */
let catPick = null;   // the type whose symbol choices are open
function renderCats() {
  const ps = state.packs || [], pu = purseNow(), now = ps.length && pu.P > 0 ? packsNow() : [], left = id => { const x = now.find(q => q.id === id); return x ? x.left : null; };
  const row = (p, any) => {
    const k = any ? 'any' : catSymOf(p), L = left(any ? '' : p.id), dy = !any && !!p.daily, amt = Number(p ? p.amount || 0 : 0), shown = dy ? Math.round(amt / 7 * 100) / 100 : amt;
    return `<div class="ct-row${any ? ' any' : ''}">` + (any ? `<span class="ct-sym">${catSvg(k)}</span>` : `<button class="ct-sym" data-cat-sym="${esc(p.id)}" aria-label="${esc(p.name)}'s symbol: ${CAT_NAMES[k]}. Tap to change" aria-expanded="${catPick === p.id}">${catSvg(k)}</button>`)
      + (any ? `<span class="ct-nm"><b>Anything</b><small>Daily · what's left of the week${L != null ? ` · ${money(Math.max(0, L))} left` : ''}</small></span>`
        : `<input class="ct-in" data-cat-name="${esc(p.id)}" value="${esc(p.name)}" maxlength="24" aria-label="Name"><input class="ct-amt" data-cat-amt="${esc(p.id)}" type="number" inputmode="decimal" min="0" step="any" value="${shown || ''}" placeholder="$0" aria-label="${esc(p.name)} ${dy ? 'a day' : 'a week'}"><button class="ct-del" data-cat-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">✕</button>`)
      + `</div>` + (any ? '' : `<div class="ct-pace"><span class="ct-seg" role="group" aria-label="${esc(p.name)}: daily or weekly"><button data-cat-pace="${esc(p.id)}" data-d="1" aria-pressed="${dy}">Daily</button><button data-cat-pace="${esc(p.id)}" data-d="0" aria-pressed="${!dy}">Weekly</button></span><small>${dy ? `${money(shown)} a day, ${money(amt)} a week · in your days` : `${money(amt)} a week · its own bar`}</small></div>`) + (!any && catPick === p.id ? `<div class="ct-syms" role="group" aria-label="Symbols">${Object.keys(CAT_SYM).filter(x => x !== 'any').map(x => `<button data-cat-set="${esc(p.id)}" data-k="${x}" class="${x === k ? 'on' : ''}" aria-pressed="${x === k}" aria-label="${CAT_NAMES[x]}">${catSvg(x)}</button>`).join('')}</div>` : '');
  };
  if ($('catNewSym')) renderCatNew();
  $('catsRows').innerHTML = (ps.length ? `<div class="ct-head" aria-hidden="true"><span></span><span>Name</span><span>Amount</span></div>` : '') + ps.map(p => row(p)).join('') + row(null, true);
}
/* v277 (Jordan 19:59): where your money went: spending (not bills) by type, then each spend by day. Tap one to change its type. */
let spentRange = 'week', spentOpenId = null;
// v281: the range, totals and list move between the spending page and This week
function spentInto(host) { ['.sp-range', '#spentSum', '#spentList'].forEach(q => { const el = document.querySelector(q); if (el && el.parentNode !== host) host.appendChild(el); }); }
function renderSpent() {
  const types = state.packs || [], td = today(), w0 = ymd(weekStart()), m0 = td.slice(0, 7);
  const all = state.transactions.filter(t => t.amount < 0 && !t.categoryId && (spentRange === 'all' || (spentRange === 'week' ? t.date >= w0 : t.date.slice(0, 7) === m0)))
    .sort((a, b) => b.date.localeCompare(a.date) || state.transactions.indexOf(b) - state.transactions.indexOf(a));
  document.querySelectorAll('[data-sp-r]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.spR === spentRange)));
  const tOf = t => types.find(p => p.id === t.pack) || null, nm = t => t.unsorted ? 'To sort' : (tOf(t) || { name: 'Anything' }).name;
  const sym = t => catSvg(t.unsorted || !tOf(t) ? 'any' : catSymOf(tOf(t)));
  const tot = sum(all, t => -t.amount), groups = [...types.map(p => ({ id: p.id, name: p.name, k: catSymOf(p) })), { id: '', name: 'Anything', k: 'any' }]
    .map(g => ({ ...g, amt: sum(all.filter(t => (tOf(t) && !t.unsorted ? t.pack : '') === g.id), t => -t.amount) })).filter(g => g.amt > 0.004).sort((a, b) => b.amt - a.amt);
  const top = Math.max(1e-9, ...groups.map(g => g.amt));
  $('spentSum').innerHTML = all.length ? `<p class="sp-tot"><b>${moneyExact(tot)}</b> spent ${spentRange === 'week' ? 'this week' : spentRange === 'month' ? 'this month' : 'in all'} · ${all.length} ${all.length === 1 ? 'spend' : 'spends'}</p>`
    + groups.map(g => `<div class="sp-g"><span class="sp-gs">${catSvg(g.k)}</span><span class="sp-gn">${esc(g.name)}</span><span class="sp-gb"><i style="width:${Math.max(2, g.amt / top * 100).toFixed(1)}%"></i></span><b class="num">${moneyExact(g.amt)}</b></div>`).join('')
    : `<p class="muted">Nothing spent ${spentRange === 'week' ? 'this week' : spentRange === 'month' ? 'this month' : 'yet'}.</p>`;
  const dayName = ds => ds === td ? 'Today' : ds === ymdPlus(td, -1) ? 'Yesterday' : new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  let h = '', last = '';
  for (const t of all) {
    if (t.date !== last) { last = t.date; const dt = sum(all.filter(x => x.date === t.date), x => -x.amount); h += `<div class="sp-day"><span>${esc(dayName(t.date))}</span><span class="num">${moneyExact(dt)}</span></div>`; }
    const open = spentOpenId === t.id;
    h += `<button class="sp-row${t.unsorted ? ' uns' : ''}" data-sp-tx="${esc(t.id)}" aria-expanded="${open}"><span class="sp-s">${sym(t)}</span><span class="sp-d"><b>${esc(t.description || 'Anything')}</b><small>${esc(nm(t))}</small></span><span class="num sp-a">−${moneyExact(-t.amount).replace('−', '')}</span></button>`;
    if (open) h += `<div class="sp-types" role="group" aria-label="Change its type">${[{ id: '', name: 'Anything', k: 'any' }, ...types.map(p => ({ id: p.id, name: p.name, k: catSymOf(p) }))].map(p => `<button data-sp-to="${esc(p.id)}" data-sp-for="${esc(t.id)}" aria-pressed="${!t.unsorted && (tOf(t) ? t.pack : '') === p.id}">${catSvg(p.k)}${esc(p.name)}</button>`).join('')}</div>`;
  }
  $('spentList').innerHTML = h;
}
/* v279 (Jordan 20:26): the week in detail, from a tap anywhere on the weekly card */
function renderWeek() {
  const pu = purseNow(), w0 = weekStart(), di = Math.max(0, Math.min(6, Math.floor((Date.now() - w0) / DAY_MS)));
  const dates = [0, 1, 2, 3, 4, 5, 6].map(i => ymd(new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + i))), DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fmtD = ds => new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const ws = weekSpends(), types = state.packs || [], packOf = t => types.some(p => p.id === t.pack) ? t.pack : '';
  const spentOn = (id, ds) => sum(ws.filter(t => t.date === ds && (id == null || packOf(t) === id)), t => charged(t));
  const cash = c => Math.round(c) % 100 === 0 ? money(Math.round(c) / 100) : moneyExact(Math.floor(c + 1e-6) / 100);   // v280: whole dollars without .00
  let h = `<h2>This week</h2><p class="wk-sub">${fmtD(dates[0])} to ${fmtD(dates[6])}</p>`
    + `<div class="wk-tot"><span><small>Spending money</small><b class="num">${moneyExact(pu.P)}</b></span><span><small>Spent</small><b class="num">${moneyExact(pu.spent)}</b></span><span><small>Left</small><b class="num${pu.purseLeft < 0 ? ' bad' : ''}">${moneyExact(pu.purseLeft)}</b></span></div>`;
  const strip = cells => `<div class="wk-strip">${cells.map((c, i) => `<span class="${i < di ? 'past' : i === di ? 't' : 'fut'}"><small>${DN[i]}</small><b class="num">${c}</b></span>`).join('')}</div>`;
  if (types.length && pu.P > 0) {
    const L = catWeekNow(), nm = id => id === '' ? { name: 'Anything', any: true } : types.find(p => p.id === id) || { name: '?' };
    h += `<h3>Every day</h3><p class="wk-note">Past days show what you spent. Today and the days ahead show what's there.</p>`;
    for (const x of L.daily) {
      const p = nm(x.id), cells = dates.map((ds, i) => i < di ? (spentOn(x.id, ds) ? '−' + money(spentOn(x.id, ds)) : '$0') : i === di ? cash(x.today) : cash(x.ahead[i - di - 1] || 0));
      h += `<div class="wk-cat"><div class="wk-hd">${catSvg(catSymOf(p))}<b>${esc(p.name)}</b><span class="num">${cash(x.today)} today · ${cash(x.today + x.fut)} left this week</span></div>${strip(cells)}`
        + `<p class="wk-note">Spent this week: ${moneyExact(sum(dates, ds => spentOn(x.id, ds)))}</p></div>`;
    }
    if (L.weekly.length) {
      h += `<h3>For the week</h3>`;
      for (const x of L.weekly) {
        const p = nm(x.id), pct = x.amt > 0 ? Math.max(0, Math.min(100, x.left / x.amt * 100)) : 0;
        h += `<div class="wk-cat"><div class="wk-hd">${catSvg(catSymOf(p))}<b>${esc(p.name)}</b><span class="num">${cash(x.left)} of ${cash(x.amt)} left</span></div><div class="wk-bar"><i style="width:${pct.toFixed(1)}%"></i></div>`
          + `<p class="wk-note">Spent this week: ${moneyExact(sum(dates, ds => spentOn(x.id, ds)))}</p></div>`;
      }
    }
  } else {
    const t = todayLeft(pu);
    h += `<div class="wk-cat"><div class="wk-hd">${catSvg('any')}<b>Each day</b><span class="num">${money(Math.max(0, t))} left today</span></div>${strip(dates.map((ds, i) => i <= di ? (spentOn(null, ds) ? '−' + money(spentOn(null, ds)) : '$0') : ''))}</div>`;
  }
  h += `<div class="wk-acts"><button id="weekCats">Edit categories</button></div><h3 class="wk-sph">Where your money went</h3><div id="wkSpentHost" class="sp-host"></div>`;
  spentInto(document.querySelector(':is(#view-spent, #view-week) .sp-card'));   // keep the list safe before the page is redrawn
  $('weekBody').innerHTML = h;
  $('weekCats').onclick = () => showView('cats', 1);
  spentInto($('wkSpentHost')); renderSpent();   // v281: the list lives on this page
}
// v311: the page that's showing, This week (with its list) or the spending list, drawn again
function spentRedraw() { if (!$('view-week').classList.contains('hidden')) renderWeek(); else if (!$('view-spent').classList.contains('hidden')) renderSpent(); }
$('weekBack').onclick = () => showView('budget', -1);
$('spentBack').onclick = () => { spentOpenId = null; showView(showView.last && showView.last !== 'spent' ? showView.last : 'budget', -1); };
$('catsSpent').onclick = () => showView('spent', 1);
$('spentOpen').onclick = () => showView('spent', 1);
document.addEventListener('click', e => {
  if (!e.target.closest('#view-spent, #view-week')) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.spR) { spentRange = b.dataset.spR; spentOpenId = null; renderSpent(); return; }
  if (b.dataset.spTx) { spentOpenId = spentOpenId === b.dataset.spTx ? null : b.dataset.spTx; renderSpent(); return; }
  if (b.dataset.spFor != null && b.dataset.spTo != null) { sortTx(b.dataset.spFor, b.dataset.spTo); sortOpen = null; spentOpenId = null; spentRedraw(); }
});
$('catsBack').onclick = () => { catPick = null; showView('budget', -1); };
$('catsRows').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.catPace) { const p = (state.packs || []).find(x => x.id === b.dataset.catPace); if (!p) return; p.daily = b.dataset.d === '1'; save(); render(); renderCats(); return; }   // v275
  if (b.dataset.catSym) { catPick = catPick === b.dataset.catSym ? null : b.dataset.catSym; renderCats(); return; }
  if (b.dataset.catSet) { (state.packSym = state.packSym || {})[b.dataset.catSet] = b.dataset.k; catPick = null; save(); render(); renderCats(); return; }
  if (b.dataset.catDel) { const id = b.dataset.catDel, p = (state.packs || []).find(x => x.id === id); if (!p) return;
    const at = state.packs.indexOf(p), sym = (state.packSym || {})[id], hit = state.transactions.filter(t => t.pack === id);
    state.packs = state.packs.filter(x => x !== p); hit.forEach(t => { t.pack = ''; }); if (state.packSym) delete state.packSym[id];
    save(); render(); renderCats();
    toastUndo(`Deleted ${p.name}. Its spending counts as Anything now`, () => { state.packs.splice(at, 0, p); hit.forEach(t => { t.pack = id; }); if (sym) (state.packSym = state.packSym || {})[id] = sym; save(); render(); if (!$('view-cats').classList.contains('hidden')) renderCats(); }); return; }
});
$('catsRows').addEventListener('change', e => {
  const t = e.target, id = t.dataset.catName || t.dataset.catAmt, p = (state.packs || []).find(x => x.id === id); if (!p) return;
  if (t.dataset.catName) p.name = t.value.trim().slice(0, 24) || p.name; else p.amount = Math.max(0, Math.round((Number(t.value) || 0) * (p.daily ? 7 : 1) * 100) / 100);   // v275: a daily one is typed a day
  save(); render(); renderCats();
});
/* v277: the new type's symbol: picked by its name until you choose one */
let catNewPick = null;
const catNewKey = () => catNewPick || catSymOf({ id: '', name: $('catNewName').value || '' });
function renderCatNew() {
  $('catNewSym').innerHTML = catSvg(catNewKey());
  const box = $('catNewSyms'); if (box.hidden) return;
  const k = catNewKey(); box.innerHTML = Object.keys(CAT_SYM).filter(x => x !== 'any').map(x => `<button data-k="${x}" class="${x === k ? 'on' : ''}" aria-pressed="${x === k}" aria-label="${CAT_NAMES[x]}">${catSvg(x)}</button>`).join('');
}
$('catNewSym').onclick = () => { const box = $('catNewSyms'); box.hidden = !box.hidden; $('catNewSym').setAttribute('aria-expanded', String(!box.hidden)); renderCatNew(); };
$('catNewSyms').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (!b) return; catNewPick = b.dataset.k; $('catNewSyms').hidden = true; $('catNewSym').setAttribute('aria-expanded', 'false'); renderCatNew(); });
$('catNewName').addEventListener('input', renderCatNew);
$('catAddBtn').onclick = () => {
  const name = $('catNewName').value.trim().slice(0, 24), amount = Math.max(0, Math.round((Number($('catNewAmt').value) || 0) * 100) / 100); if (!name) { toast('Give the type a name'); $('catNewName').focus(); return; }
  const nid = uid(), k = catNewKey(); (state.packs = state.packs || []).push({ id: nid, name, amount });
  if (catNewPick || k !== catSymOf({ id: nid, name })) (state.packSym = state.packSym || {})[nid] = k;   // v277: keep a picked symbol
  catNewPick = null; $('catNewSyms').hidden = true; $('catNewName').value = ''; $('catNewAmt').value = ''; save(); render(); renderCats(); renderCatNew();
};
$('catNewAmt').addEventListener('keydown', e => { if (e.key === 'Enter') $('catAddBtn').click(); });
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.view));

$('editBudgetsBtn').onclick = () => { $('catEdit').classList.remove('hidden'); $('editBudgetsBtn').classList.add('hidden'); };
$('doneBudgetsBtn').onclick = () => { $('catEdit').classList.add('hidden'); $('editBudgetsBtn').classList.remove('hidden'); render(); };
