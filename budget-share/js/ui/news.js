'use strict';
/* v267 (Jordan): the news that used to wait on the weekly page, where nobody went: last week's result, a pot or project
   that reached its goal, the backup reminder. Home shows the first one, one quiet line under the weekly card; a tap clears it. */
function newsNow(now = Date.now()) {
  const out = [], lt = state.lastTrip;
  if (lt && !lt.seen) out.push({ key: 'trip', html: lt.short >= 0.01 ? `Last week went ${money(lt.short)} over. That carries into this week until you cover it.`
      : lt.amount >= 0.01 ? `You didn't spend <b>${money(lt.amount)}</b> ${lt.weeks > 1 ? `over the last ${lt.weeks} weeks` : 'last week'}. It's saved now in ${esc(potName(lt.to))}.`
      : "You used all of last week's spending money.", acts: `<button class="link" data-news="trip">${lt.amount >= 0.01 ? 'Nice' : 'OK'}</button>` });
  for (const [id] of Object.entries(state.built || {}).filter(([id, b]) => !b.seen && state.pots.some(p => p.id === id)))
    out.push({ key: 'built:' + id, html: `${esc(potName(id))} reached its goal${goalMonthsOf(id) ? `: ${plural(goalMonthsOf(id), 'month')} of bills set aside` : ''}! Its money a day goes back to Savings.`,
      acts: `<button class="link" data-news="built:${esc(id)}">Nice</button>` });
  const bk = backupNudge(now);
  if (bk) out.push({ key: 'backup', html: `${bk} Your budget lives only on this phone, so save a copy to Files now and then.`,
    acts: `<button class="link" data-news="backup-now">Back up now</button> · <button class="link" data-news="backup-later">Later</button>` });
  return out;
}
function newsAct(k) {
  if (k === 'trip' && state.lastTrip) state.lastTrip.seen = true;
  else if (k.startsWith('built:') && state.built && state.built[k.slice(6)]) state.built[k.slice(6)].seen = true;
  else if (k === 'backup-now') { exportBackup(); return; }
  else if (k === 'backup-later') state.backupSnooze = Date.now() - 7 * DAY_MS;   // ask again in a week
  else return;
  save(); render();
}
// Every two weeks without a backup, Home asks for one (the data lives only on this phone).
function backupNudge(now = Date.now()) {
  if (!state.startAt || state.needsSetup) return '';
  if (now - Math.max(Number(state.lastBackup || 0), Number(state.backupSnooze || 0), Number(state.startAt)) < 14 * DAY_MS) return '';
  return state.lastBackup ? `Your last backup was ${Math.floor((now - state.lastBackup) / DAY_MS)} days ago.` : `You haven't saved a backup yet.`;
}
