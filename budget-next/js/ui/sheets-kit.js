'use strict';
// the picker: "Take one from" and a chip per place that has villagers (locked ones can't be tapped)
function pickHTML(to, n = 1) {
  const L = donorList(to).filter(x => x.n > 0);
  return `<div class="vl-pick" role="group" aria-label="Move money a day from"><span class="vl-pkl">Take ${n === 5 ? 'five' : 'one'} from</span>`
    + (L.length ? L.map(x => `<button class="chip vl-pk" data-pick-from="${esc(x.id)}" data-pick-to="${esc(to)}"${x.lock ? ' disabled' : ''} aria-label="$1 a day from ${esc(x.name)} ($${x.n} a day there)">${x.lock ? '' : ''}${esc(x.name)} · <b>${x.n}</b></button>`).join('')
      : '<span class="muted" style="font-size:13px">Nobody to take: everyone is on weekly spending.</span>') + `</div>`;
}
// "1.4 of 3 months of bills saved", for a pot whose goal is in months. Rounded down, never up.
function monthsLine(p) {
  const n = goalMonthsOf(p.id), b = billsMonthly(); if (!n || !(b > 0)) return '';
  const have = Math.max(0, Math.floor(p.bal / b * 10 + 1e-9) / 10);
  return `<div class="muted" style="font-size:12px">${have.toLocaleString(undefined, { maximumFractionDigits: 1 })} of ${n} month${n === 1 ? '' : 's'} of bills saved · bills are ${money(b)} a month</div>`;
}
