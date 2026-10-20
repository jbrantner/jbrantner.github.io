'use strict';
/* ---------- transaction sources ----------
   Every way transactions arrive goes through addTransactions(), which dedupes and
   auto-categorizes. A future bank-sync source just needs to produce the same shape:
   { date: 'YYYY-MM-DD', amount: Number (negative = spending), description, externalId? } */
function fingerprint(t) { return t.externalId || [t.date, t.amount.toFixed(2), t.description.trim().toLowerCase()].join('|'); }
// A rule matches when every word of it appears in the description, so "STARBUCKS SEATTLE"
// still matches "STARBUCKS #9981 SEATTLE".
function ruleMatches(match, desc) {
  const w = ruleWords(match), d = ruleWords(desc);   // v311: from the start of a word: "NETFL" is in "NETFLIX", "RENT" isn't in "CURRENT ELECTRIC"
  return w.length > 0 && w.every(x => d.some(y => y.startsWith(x)));
}
function categorize(desc) {
  const r = state.rules.find(r => ruleMatches(r.match, desc));
  return r ? r.categoryId : null;
}
// Duplicate check: an import may bring in as many copies of a purchase (same day, amount and
// description) as the file holds, minus copies already saved from that same source, so two
// identical coffees are both kept while re-importing an overlapping file adds nothing.
// Entries typed in by hand are never treated as duplicates.
function addTransactions(list, source, account) {
  const have = {}, incoming = {}, filed = [];
  for (const t of state.transactions) if (t.source === source) have[fingerprint(t)] = (have[fingerprint(t)] || 0) + 1;
  let added = 0, dupes = 0;
  for (const t of list) {
    const tx = { id: uid(), date: t.date, amount: Math.round(t.amount * 100) / 100, description: t.description || '',
      categoryId: t.categoryId !== undefined ? t.categoryId : categorize(t.description || ''), source, externalId: t.externalId,
      account: t.account || account || '' };
    if (t.pack !== undefined) tx.pack = t.pack;
    if (t.unsorted) tx.unsorted = true;
    if (source !== 'manual') {
      const fp = fingerprint(tx);
      incoming[fp] = (incoming[fp] || 0) + 1;
      if (incoming[fp] <= (have[fp] || 0)) { dupes++; continue; }
    }
    state.transactions.push(tx); added++;
    if (tx.categoryId) { filed.push([tx, t.billMonth, tx.categoryId]); tx.categoryId = null; }
  }
  // v311: a bill payment, typed in or imported, counts for the bill month it pays and replaces its "marked paid" (oldest
  // first, each finding its month before the next is filed, so two payments near the turn of a month each find their own)
  for (const [tx, m, c] of filed.sort((a, b) => a[0].date.localeCompare(b[0].date))) fileTx(tx, c, m);
  save();
  return { added, dupes };
}

function dropMarker(catId, m) {
  state.transactions = state.transactions.filter(t => !(t.markedPaid && t.categoryId === catId && billMonthOf(t) === m));
}
// v311: the bill month a payment is for: of the months whose due date is within a week of it (paid a few days early, or
// posted a few days late across the turn of a month), the nearest one no real payment covers yet; else the month it was paid.
function billMonthFor(catId, date, self) {
  const c = state.categories.find(x => x.id === catId) || (state.goneCats || []).find(x => x.id === catId), own = date.slice(0, 7);
  if (!c || c.kind !== 'bill') return own;
  const paid = m => state.transactions.some(t => t !== self && t.categoryId === catId && !t.markedPaid && t.amount < 0 && billMonthOf(t) === m);
  let best = own, gap = 8;
  for (const m of [prevMonth(own), own, nextMonth(own)]) {
    const d = dueDate(c, m), g = d ? Math.abs(Math.round((dayMs(d) - dayMs(date)) / DAY_MS)) : 99;
    if (g < gap && !paid(m)) { best = m; gap = g; }
  }
  return best;
}
// v311: a transaction filed under a category (or none). A payment for a bill counts for the bill month it pays (m, or
// billMonthFor) and replaces that month's "marked paid": typed in, imported, or filed by hand or by a rule. Anything
// else counts in the month it happened.
function fileTx(t, catId, m) {
  t.categoryId = catId || null; if (t.markedPaid) return;
  delete t.billMonth; if (!t.categoryId || !(t.amount < 0)) return;
  m = m || billMonthFor(t.categoryId, t.date, t); if (m !== t.date.slice(0, 7)) t.billMonth = m;
  dropMarker(t.categoryId, m);
}
// v311: a bill paid by a real payment this month (not only marked paid): Undo has no mark to take back
function billByBank(id, m = month) { return state.transactions.some(t => t.categoryId === id && !t.markedPaid && billMonthOf(t) === m); }
// v311: the words of a rule or a description: letters and digits, with & and ' inside a word (AT&T, MCDONALD'S)
function ruleWords(s) { return String(s || '').toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}&]+/gu) || []; }
const catName = id => (state.categories.find(c => c.id === id) || (state.goneCats || []).find(c => c.id === id) || { name: 'Everything else' }).name;
function monthTx() { return state.transactions.filter(t => t.date.startsWith(month)); }
function merchantKey(desc) {
  // First couple of meaningful words, without card numbers, dates or store numbers. v311: a name after a '*' is the place
  // (PAYPAL *NETFLIX, SQ *BLUE BOTTLE), a bank transfer's comes after "ORIG CO NAME:", and a key under 3 letters isn't learned.
  let s = String(desc || ''); const o = s.match(/ORIG CO NAME:\s*(.+?)\s+(?:ORIG ID|DESC DATE|CO ENTRY|SEC:|$)/i); if (o) s = o[1];
  const words = x => (x.replace(/['’]/g, '').match(/[\p{L}\p{N}&]+/gu) || []).filter(w => w.length > 1 && !/\d.*\d/.test(w) && !/^(pos|debit|purchase|card|ach|recurring|payment|payments|pmt|bill|autopay|online|www|com|the|paypal|sq|tst)$/i.test(w));
  const i = s.indexOf('*'), after = i >= 0 ? words(s.slice(i + 1)) : [], k = (after.length ? after : words(s)).slice(0, 2).join(' ');
  return k.replace(/[^\p{L}\p{N}]/gu, '').length >= 3 ? k : '';
}
// v311: a new rule sorts the imported transactions that aren't sorted yet (never ones typed in or spent on the keypad),
// oldest first; a payment it files under a bill replaces that month's "marked paid"
function ruleSort(match, catId) {
  const l = state.transactions.filter(t => !t.categoryId && t.source !== 'manual' && ruleMatches(match, t.description)).sort((a, b) => a.date.localeCompare(b.date));
  l.forEach(t => fileTx(t, catId)); return l.length;
}
