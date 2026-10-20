'use strict';
$('addRuleBtn').onclick = () => {
  const match = $('ruleMatch').value.trim(); if (!match || !$('ruleCat').value) return;
  state.rules.push({ id: uid(), match, categoryId: $('ruleCat').value });
  const n = ruleSort(match, $('ruleCat').value);
  $('ruleMatch').value = ''; save(); render(); toast(n ? `Sorted ${n} transaction${n === 1 ? '' : 's'}` : 'Rule added');
};
$('ruleList').addEventListener('click', e => {
  const id = e.target.dataset.ruleDel; if (!id) return;
  state.rules = state.rules.filter(r => r.id !== id); save(); render();
});

/* ---------- CSV import ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && !f.trim()) { f = ''; q = true; }   // v311: a quote inside a field (12" PIZZA) is just a quote
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function parseAmount(s) {
  if (s == null) return NaN; s = String(s).trim(); if (!s) return NaN;
  if (/^[^,.]*\d[\d.]*,\d{1,2}\D*$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // v311: 1.234,56 (a comma before the cents)
  const neg = (/^\(.*\)$/.test(s) || /[-−–]/.test(s) || /DR\.?$/i.test(s)) && !/CR\.?$/i.test(s);   // v311: − (U+2212) too, and DR / CR after it
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? NaN : (neg ? -n : n);
}
// v311: a real date or null (16/09/2026 has no month 16); df: the file is day-first (D/M/Y)
function parseDate(s, df) {
  s = String(s || '').trim();
  const ok = (y, mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(y, mo, 0).getDate() ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); // US style M/D/Y
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return df ? ok(y, +m[2], +m[1]) : ok(y, +m[1], +m[2]); }
  const d = new Date(s); return isNaN(d) ? null : ymd(d);   // v311: the local day (toISOString gave the next day in the evening)
}
// v311: a file's dates are day-first (16/09/2026, 16.10.2026) when one starts with a number over 12, or they use dots,
// and none has a second number over 12
function dayFirst(list) {
  const ds = list.map(s => String(s || '').trim().match(/^(\d{1,2})([\/.-])(\d{1,2})[\/.-]\d{2,4}/)).filter(Boolean);
  return ds.some(m => +m[1] > 12 || m[2] === '.') && !ds.some(m => +m[3] > 12);
}
let csv = null;
$('csvFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const rows = parseCSV(await file.text());
  if (!rows.length) { $('csvMap').classList.add('hidden'); e.target.value = ''; csv = null; toast(`Couldn't read transactions from ${file.name}`); return; }   // v311: an empty file
  // Some banks put a few lines of account info above the header; find the first row that looks like one.
  let h = rows.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /amount|debit|credit|withdraw/i.test(c)));
  if (h < 0) h = 0;
  csv = { header: rows[h], body: rows.slice(h + 1) };
  const opts = (none) => (none ? '<option value="">—</option>' : '') + csv.header.map((c, i) => `<option value="${i}">${esc(c || 'Column ' + (i + 1))}</option>`).join('');
  const find = re => csv.header.findIndex(c => re.test(c));
  for (const [id, none] of [['mapDate'], ['mapDesc'], ['mapAmt', 1], ['mapDebit', 1], ['mapCredit', 1]]) $(id).innerHTML = opts(none);
  const set = (id, i) => { $(id).value = i >= 0 ? String(i) : ''; };
  set('mapDate', find(/date/i)); set('mapDesc', [/desc/i, /payee|merchant|name/i, /memo|detail/i].map(find).find(i => i >= 0));   // v311: Chase's "Details" is DEBIT or CREDIT
  const amt = find(/^amount|amount$/i); set('mapAmt', amt);
  set('mapDebit', amt >= 0 ? -1 : find(/debit|withdraw/i)); set('mapCredit', amt >= 0 ? -1 : find(/credit|deposit/i));
  $('csvMap').classList.remove('hidden');
  previewCSV();
};
['mapDate', 'mapDesc', 'mapAmt', 'mapDebit', 'mapCredit', 'mapSign'].forEach(id => $(id).onchange = previewCSV);
function csvRows() {
  const col = v => v === '' ? -1 : +v;   // v311: a column set to "—" is missing (it read the first column, the date, as an amount)
  const di = col($('mapDate').value), de = col($('mapDesc').value), ai = col($('mapAmt').value), dbi = col($('mapDebit').value), cri = col($('mapCredit').value);
  const flip = $('mapSign').value === 'pos', df = dayFirst(csv.body.map(r => r[di]));
  const out = [];
  for (const r of csv.body) {
    const date = parseDate(r[di], df); if (!date) continue;
    let amount;
    if (ai >= 0) { amount = parseAmount(r[ai]); if (flip) amount = -amount; }
    else { const d = parseAmount(r[dbi]), c = parseAmount(r[cri]); amount = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d)); }
    if (isNaN(amount) || amount === 0) continue;
    out.push({ date, amount, description: (r[de] || '').trim() });
  }
  return out;
}
function previewCSV() {
  const rows = csvRows();
  $('csvPreview').innerHTML = '<tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr>' +
    rows.slice(0, 8).map(t => `<tr><td>${t.date}</td><td>${esc(t.description.slice(0, 40))}</td><td class="num ${t.amount > 0 ? 'ok' : ''}">${money(t.amount)}</td><td>${esc(catName(categorize(t.description)))}</td></tr>`).join('');
  const out = rows.filter(t => t.amount < 0).length;
  $('csvSummary').textContent = `${rows.length} rows, ${out} spending, ${rows.length - out} income/refunds`;
}
$('csvImportBtn').onclick = () => {
  const name = 'CSV';
  const { added, dupes } = addTransactions(csvRows(), name, $('csvAcct').value);
  $('csvMap').classList.add('hidden'); $('csvFile').value = ''; csv = null;
  render(); toast(`Imported ${added}` + (dupes ? `, skipped ${dupes} already here` : ''));
};
