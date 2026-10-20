'use strict';
// the picker: "Take one from" and a chip per place that has villagers (locked ones can't be tapped)
function pickHTML(to, n = 1) {
  const L = donorList(to).filter(x => x.n > 0);
  return `<div class="vl-pick" role="group" aria-label="Move money a day from"><span class="vl-pkl">Take ${n === 5 ? 'five' : 'one'} from</span>`
    + (L.length ? L.map(x => `<button class="chip vl-pk" data-pick-from="${esc(x.id)}" data-pick-to="${esc(to)}"${x.lock ? ' disabled' : ''} aria-label="$1 a day from ${esc(x.name)} ($${x.n} a day there)">${x.lock ? '' : ''}${esc(x.name)} · <b>${x.n}</b></button>`).join('')
      : '<span class="muted" style="font-size:13px">Nobody to take: everyone is on weekly spending.</span>') + `</div>`;
}
