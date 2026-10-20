'use strict';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// v311: the currency symbol as shown: up to 3 characters, without anything that could break the page's HTML (a backup can carry any text)
const curSym = () => { const c = state.currency; if (curSym.v == null || c !== curSym.c) { curSym.c = c; curSym.v = [...String(c == null ? '$' : c).replace(/[<>&"'`]/g, '')].slice(0, 3).join(''); } return curSym.v; };
const moneyExact = n => (n < 0 ? '−' : '') + curSym() + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Whole dollars, cents dropped ($1.99 shows as $1). The math underneath keeps the cents.
const money = n => { const d = Math.floor(Math.abs(n) + 1e-9); return (n < 0 && d ? '−' : '') + curSym() + d.toLocaleString(); };
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
// "$1,030 is held for bills not paid yet (Rent, Parking, Phone and 7 more), ...", for the Bills page.
const nameList = names => names.length > 3 ? names.slice(0, 3).join(', ') + ` and ${names.length - 3} more` : names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
// The math card: the plan, where each day's money goes, bonus paychecks, and everything you have added up.
const freqText = i => i.every === 'twice' ? 'twice a month' : Number(i.every) === 7 ? 'every week' : Number(i.every) === 14 ? 'every 2 weeks' : 'once a month';
const shortDate = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
// What a pot's workers put away: today's pace and what that adds up to over an average month.
const rateText = w => `+${money(w * WORKER_DAY)} a day · ${money(w * WORKER_DAY * 365 / 12)} a month`;
const monthYear = d => new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
