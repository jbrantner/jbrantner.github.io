'use strict';
/* ---------- events ---------- */
// "Edit bills": the bill list lives in Edit budget, on the Party page.
function openBillEdit() {
  showView('party', 1); render();
  $('catEdit').classList.remove('hidden'); $('editBudgetsBtn').classList.add('hidden');
  setTimeout(() => $('catEdit').scrollIntoView({ block: 'start', behavior: lessMotion() ? 'auto' : 'smooth' }), 60);
}
function showView(v, dir = 0) {
  if (v === 'town') v = 'budget';   // v311: before the layout is picked, so Home looks like Home (v140: the Town list is part of the main screen)
  const oldTab = v === 'old'; if (oldTab) v = 'budget';   // v242: 'All' = the full budget screen, kept to sort out later
  if (v === 'budget') document.documentElement.classList.toggle('home2', !oldTab);   // v272: Home is the All tab's top (v242's 'lite' home is off)
  // v86: the Pots, Bills and Scavenger pages live in the town now, and Import in Settings
  if (v === 'pots' || v === 'bills' || v === 'scavenger') { showView('budget', dir); if (v !== 'pots') Town.open(v === 'bills' ? 'home' : 'scavenger'); return; }
  if (v === 'town') v = 'budget';   // v140: the Town list is part of the main screen
  if (v === 'import') { showView('settings', dir); const md = $('importCard').closest('details'); if (md) md.open = true; setTimeout(() => $('importCard').scrollIntoView({ block: 'start' }), 0); return; }
  document.documentElement.classList.toggle('full', v === 'budget');
  document.documentElement.classList.toggle('up', v === 'upkeep'); if (v === 'upkeep') openUpkeep();   // v140
  document.documentElement.classList.toggle('st', v === 'settings' || v === 'cats' || v === 'spent' || v === 'week'); if (v === 'cats') renderCats(); if (v === 'spent') { spentInto(document.querySelector(':is(#view-spent, #view-week) .sp-card')); renderSpent(); } if (v === 'week') { spentRange = 'week'; spentOpenId = null; renderWeek(); }   // v274: Categories looks like Settings; v277 Spending too   // v210: Settings in black and white
  if (v !== 'settings' && v !== 'cats' && v !== 'spent' && v !== 'week') showView.last = oldTab ? 'old' : v;   // v311: back to the Bills tab, not Home
  $('settingsBtn').textContent = v === 'settings' ? '✕' : '⚙'; $('settingsBtn').setAttribute('aria-label', v === 'settings' ? 'Close settings' : 'Settings');
  document.querySelectorAll('nav button').forEach(x => { const on = x.dataset.view === (oldTab ? 'old' : v === 'party' || v === 'tx' ? 'budget' : v); x.classList.toggle('active', on); if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'view-' + v));
  const sec = $('view-' + v); if (sec && dir) { sec.classList.remove('slide-l', 'slide-r'); void sec.offsetWidth; sec.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  window.scrollTo(0, 0);
  if (v === 'town') Town.shown(); else Town.close();
  VL.shown(v);
  for (const [k, id] of [['upkeep', 'upkeepFrame']]) { const f = $(id); try { const w = f && f.contentWindow; if (w && w.tabShown) w.tabShown(v === k); } catch (e) {} }   // v311: Upkeep rests while its tab is hidden
}
document.documentElement.classList.toggle('full', !$('view-budget').classList.contains('hidden'));
document.documentElement.classList.add('home2');   // v272 (Jordan 14:26): Home is the All tab's top
