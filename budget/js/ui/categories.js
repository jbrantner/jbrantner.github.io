'use strict';
/* v273 (Jordan 14:45, his drawing): when the week is split into types (Food, Gas...), a little bar for each and one for
   Anything, a pixel symbol under each (no room for words). A bar is as tall as the type's money this week (the biggest is
   8 rows of 2), lit coral for what's left, dim for what's spent. Display only. */
const CAT_SYM = {   // 7x7, '#' is a pixel
  food: ['#.#.#.#', '#.#.#.#', '#####.#', '..#..##', '..#..##', '..#...#', '..#...#'],
  gas: ['####...', '#..#.#.', '#..#..#', '####..#', '####..#', '####.##', '####...'],
  coffee: ['.#.#...', '#.#....', '#####..', '#####.#', '#####.#', '#####..', '.###...'],
  fun: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  shop: ['..###..', '.#...#.', '#######', '#######', '#######', '#######', '#######'],
  pet: ['.#...#.', '.#.#.#.', '...#...', '#.....#', '..###..', '.#####.', '.#####.'],
  health: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
  car: ['.......', '.####..', '##..##.', '#######', '#######', '.#...#.', '.......'],
  gift: ['.#.#.#.', '..###..', '#######', '#..#..#', '#..#..#', '#..#..#', '#######'],
  home: ['...#...', '..###..', '.#####.', '#######', '.##.##.', '.##.##.', '.##.##.'],
  any: ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
  other: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  card: ['.......', '#######', '#######', '#......', '#.##..#', '#######', '.......'] };   // v297: a debt
const CAT_WORDS = [['food', /food|grocer|eat|meal|lunch|dinner|restaur|snack|takeout|take out/i], ['gas', /gas|fuel/i], ['coffee', /coffee|cafe|café|tea|drink/i],
  ['fun', /fun|game|movie|entertain|hobby|treat/i], ['shop', /shop|cloth|store|amazon|target/i], ['pet', /pet|dog|cat\b|vet/i], ['health', /health|med|pharm|doctor|drug/i],
  ['car', /car\b|uber|lyft|bus|train|transit|park|travel/i], ['gift', /gift|present|birthday/i], ['home', /home|house|clean|supplies/i]];
const catSymOf = p => p.any ? 'any' : ((state.packSym || {})[p.id] && CAT_SYM[state.packSym[p.id]] ? state.packSym[p.id] : (CAT_WORDS.find(([, re]) => re.test(p.name)) || ['other'])[0]);
const CAT_NAMES = { food: 'Food', gas: 'Gas', coffee: 'Coffee', fun: 'Fun', shop: 'Shopping', pet: 'Pets', health: 'Health', car: 'Getting around', gift: 'Gifts', home: 'Home', other: 'Diamond', any: 'Anything' };
const catSvg = k => `<svg class="hl-sym" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">${CAT_SYM[k].map((r, y) => [...r].map((c, x) => c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '').join('')).join('')}</svg>`;
// v275: the weekly card when there are categories: today's number for each daily one, the weekly ones' money left, and a bar group a day
function dwHTML(now = Date.now()) {
  const L = catWeekNow(now), N = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], p = id => L.ps.find(x => (x.any ? '' : x.id) === id) || { any: true, name: 'Anything' };
  const cash = c => { if (Math.round(c) % 100 === 0) return esc(money(Math.round(c) / 100)); const x = moneyExact(Math.floor(c + 1e-6) / 100), m = x.match(/^(.*?)([.,]\d\d)$/); return m ? `${esc(m[1])}<span class="c">${esc(m[2])}</span>` : esc(x); };
  const say = c => Math.round(c) % 100 === 0 ? money(Math.round(c) / 100) : moneyExact(Math.floor(c + 1e-6) / 100);   // v311: what cash() shows, for VoiceOver
  const nD = L.daily.length, unit = Math.max(100, Math.ceil(Math.max(100, ...L.daily.map(x => x.start), ...L.daily.flatMap(x => x.ahead)) / 8 / 100) * 100);
  const col = (full, lit, cls = '') => { const rows = Math.max(1, Math.ceil(full / unit - 1e-9)), on = Math.max(0, Math.min(rows, lit)); let h = ''; for (let r = rows - 1; r >= 0; r--) h += r < on ? '<i class="on"></i><i class="on"></i>' : '<i></i><i></i>'; return `<span class="dw-col${cls}">${h}</span>`; };
  let h = `<div class="dw-top"><span>Left today</span><button class="dw-go" data-hl="week">This week ›</button></div><div class="hl-cats dw-nums" role="button" tabindex="0" style="--n:${nD}" aria-label="${esc(L.daily.map(x => `${p(x.id).name}: ${x.today < 0 ? say(-x.today) + ' over today' : say(x.today) + ' left today'}`).join('. '))}. Tap to edit your categories">`
    + L.daily.map(x => `<span class="dw-num${x.today < 0 ? ' bad' : ''}">${catSvg(catSymOf(p(x.id)))}<b class="num">${x.today < 0 ? '−' + cash(-x.today) : cash(x.today)}</b><small class="dw-nm">${esc(p(x.id).name)}</small></span>`).join('') + `</div>`;
  if (L.weekly.length) h += `<div class="dw-wk hl-cats" role="button" tabindex="0" aria-label="${esc(L.weekly.map(x => `${p(x.id).name}: ${x.left < 0 ? money(-x.left / 100) + ' over this week' : money(x.left / 100) + ' left this week'}`).join('. '))}">`
    + L.weekly.map(x => `<span class="${x.left < 0 ? 'bad' : ''}">${catSvg(catSymOf(p(x.id)))}${esc(p(x.id).name)} ${x.left < 0 ? '−' + money(-x.left / 100) : money(Math.floor(x.left / 100))}</span>`).join('') + `<span class="dw-wkl">left this week</span></div>`;
  const amt = c => `<span class="dw-amt num">${c < 0 ? '−' + money(Math.ceil(-c / 100 - 1e-9)) : money(Math.floor(c / 100 + 1e-9))}</span>`;   // v316: what each day has, over its bars
  const cells = [0, 1, 2, 3, 4, 5, 6].map(i => {
    if (i < L.d) return `<span class="dw-day past" role="img" aria-label="${N[i]}: done"><i class="dw-past"></i><span class="dw-dn">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]}</span></span>`;
    if (i === L.d) return `<span class="dw-day t" role="img" aria-label="Today: ${esc(L.daily.map(x => `${p(x.id).name} ${x.today < 0 ? say(-x.today) + ' over' : say(x.today)}`).join(', '))}">${amt(sum(L.daily, x => x.today))}<span class="dw-cols">${L.daily.map(x => col(x.start, x.today > 0 ? Math.ceil(x.today / unit - 1e-9) : 0)).join('')}</span><span class="dw-dn">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]}</span></span>`;
    return `<span class="dw-day fut" role="img" aria-label="${N[i]}: ${esc(L.daily.map(x => `${p(x.id).name} ${money((x.ahead[i - L.d - 1] || 0) / 100)}`).join(', '))}">${amt(sum(L.daily, x => x.ahead[i - L.d - 1] || 0))}<span class="dw-cols">${L.daily.map(x => (x.ahead[i - L.d - 1] || 0) > 0 ? col(x.ahead[i - L.d - 1], 99) : col(0, 0)).join('')}</span><span class="dw-dn">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]}</span></span>`;
  }).join('');
  const wmax = Math.max(1, ...L.weekly.map(x => x.amt)), wk = L.weekly.length ? `<span class="dw-day wk" role="img" aria-label="This week's weekly categories"><span class="dw-cols">${L.weekly.map(x => { const rows = x.amt > 0 ? Math.max(1, Math.round(x.amt / wmax * 8)) : 1; return col(rows * unit, x.amt > 0 && x.left > 0 ? Math.ceil(x.left / x.amt * rows - 1e-9) : 0); }).join('')}</span><span class="dw-dn">Week</span></span>` : '';
  return h + `<div class="dw-days${wk ? ' has-wk' : ''}" style="--pz:${nD <= 2 ? 5 : nD <= 3 ? 4 : 3}px">${cells}${wk}</div>`;
}
function stacksHTML(now = Date.now()) {
  const W = weekDots(now), pu = purseNow(now), ws = weekSpends(), N = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const di = Math.max(0, Math.min(6, Math.floor((now - weekStart(new Date(now))) / DAY_MS))), t = todayLeft(pu, new Date(now));
  let before = 0; const share = [];
  for (const d of W.days) { share[d.i] = Math.floor(Math.max(0, pu.P - before) / (7 - d.i) + 1e-9); before += d.spent; }
  const B = t + (W.days[di] ? W.days[di].spent : 0), unit = B > 48 ? Math.ceil(B / 8) : 6, L = Math.max(0, pu.purseLeft - Math.max(0, t)), ahead = 6 - di;
  const fut = ahead > 0 ? Math.floor(L / ahead + 1e-9) : 0;
  const stOf = d => d.fix ? { in: 'solid', zero: 'glow', none: 'hol' }[d.fix] : !d.out ? 'off' : d.spent <= 0 ? 'glow' : d.spent < share[d.i] ? 'solid' : 'hol';
  let dc = '';   // v193: day close, once for each day that ended under its share; the same for a moment so renders don't cut it short
  if (di > 0) {
    const y = W.days[di - 1], ys = stOf(y), k = 'dc-' + y.date, seen = Number(sess(k) || 0);
    if (ys === 'glow' || ys === 'solid') {
      if (state.dayClose !== y.date && !(state.dayClose > y.date)) { state.dayClose = y.date; save(); sess(k, String(now)); dc = ys; if (ys === 'glow') setTimeout(() => window.dcChime && window.dcChime(), 380); }
      else if (seen && Math.abs(now - seen) < 2600) dc = ys;
    }
  }
  const say = { glow: 'nothing spent', solid: 'some left, spread to the days ahead', hol: 'all spent', off: "before this week's spending started" };
  const cells = W.days.map(d => {
    if (d.i < di) {
      const st = stOf(d);
      return `<button class="ds-day${d.fix ? ' fixed' : ''}${dc && d.i === di - 1 ? ' dc-y' : ''}" data-dot="${d.date}" aria-label="${N[d.i]}: ${say[st]}${d.fix ? ' (set by you)' : ''}. Tap to change"><span class="ds-pd" aria-hidden="true"></span><i class="ds-p ${st}"></i></button>`.replace('<button', '<span').replace(/<\/button>$/, '</span>').replace(/ aria-label="([^"]*)\. Tap to change"/, ' role="img" aria-label="$1"');
    }
    if (d.i === di) {
      const n = Math.max(1, Math.ceil(Math.max(0, B) / unit)), r = Math.max(0, t); let ps = '';
      for (let k = n - 1; k >= 0; k--) { const f = Math.max(0, Math.min(1, (r - k * unit) / Math.max(1e-9, Math.min(unit, B - k * unit)))); ps += `<i class="ds-p" style="--f:${f.toFixed(2)}"><b></b></i>`; }
      return `<div class="ds-day today${dc ? ' dc-a' : ''}" style="--d:0" role="img" aria-label="Today: ${money(r)} left"><span class="ds-amt num">${money(r)}</span>${ps}</div>`;
    }
    const n = Math.min(8, Math.ceil(fut / unit));
    return `<div class="ds-day${dc ? ' dc-a' : ''}" style="--d:${d.i - di}" role="img" aria-label="${N[d.i]}: ${money(fut)} so far"><span class="ds-amt num">${money(fut)}</span>${n ? '<i class="ds-p"></i>'.repeat(n) : '<i class="ds-p hol"></i>'}</div>`;
  }).join('');
  return `<div class="ds${dc ? ' dc dc-' + dc : ''}" role="group" aria-label="This week, day by day${dc ? (dc === 'glow' ? '. Yesterday: nothing spent' : '. Yesterday ended with money left, passed to the days ahead') : ''}">${cells}</div><div class="ds-dn" aria-hidden="true">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => `<span${i === di ? ' class="t"' : ''}>${x}</span>`).join('')}</div>`;
}
function cycleDot(date) {
  if (!date || date > today()) return;
  const f = state.dotFix = state.dotFix || {}, order = [undefined, 'in', 'zero', 'none'], nx = order[(order.indexOf(f[date]) + 1) % order.length];
  if (nx) f[date] = nx; else delete f[date];
  const old = ymd(new Date(Date.now() - 70 * DAY_MS)); for (const k of Object.keys(f)) if (k < old) delete f[k];   // keep ten weeks
  save(); render();
}
