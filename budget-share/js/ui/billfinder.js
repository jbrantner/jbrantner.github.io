'use strict';
/* ---------- v111: find your bills in bank statements ---------- */
// Jordan 20:40: pick 2–3 months of bank statements (PDFs from the Chase app, or CSVs from the website) and the app
// points out what comes out every month: rent, phone, subscriptions, with the day it usually hits. It's all worked out
// right here: the files never leave the phone, the rows they hold are kept in memory only while this box is open, and
// nothing is added to the spending (a statement is only read, never imported). A suggestion only becomes a bill when
// you tick it and say yes; a bill you already have can take the due day the statements show.
const Recur = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';   // loaded only when a PDF is picked
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const DAY = 864e5, dn = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;
  const med = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
  const pad = n => String(n).padStart(2, '0');
  const ymdOf = (y, m, d) => { y = String(y); if (y.length === 2) y = '20' + y; return `${y}-${pad(+m)}-${pad(+d)}`; };
  let rows = [], files = [], found = [], from = '', added = new Map(), places = [];
  let sess = 0, readIds = new Set();   // v311: which time the box was opened or started over, and the files read since

  /* -- reading the files -- */
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return loadPdfJs.p || (loadPdfJs.p = new Promise((res, rej) => {
      const s = document.createElement('script'), fail = () => { loadPdfJs.p = null; s.remove(); rej(new Error('pdf.js did not load')); };
      const t = setTimeout(fail, 20000);
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { clearTimeout(t); if (!window.pdfjsLib) return fail(); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => { clearTimeout(t); fail(); };
      document.head.appendChild(s);
    }));
  }
  // The text of each page as lines: the pieces at the same height, left to right, with where each piece ends (for
  // statements with separate Debit and Credit columns).
  async function pdfLines(buf) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buf, isEvalSupported: false }).promise, out = [];   // no eval: a PDF can't run code
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent(), byY = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4], y = it.transform[5];
        let L = byY.find(l => Math.abs(l.y - y) < 3); if (!L) byY.push(L = { y, parts: [] });
        L.parts.push({ x, xr: x + (it.width || 0), s: it.str.trim() });
      }
      byY.sort((a, b) => b.y - a.y);
      for (const L of byY) { L.parts.sort((a, b) => a.x - b.x); out.push({ text: L.parts.map(q => q.s).join(' ').replace(/\s+/g, ' ').trim(), parts: L.parts }); }
    }
    pdf.destroy();
    return out;
  }
  const MONRE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  const monN = s => MON[s.slice(0, 3).toLowerCase()];
  // The statement's dates: "Opening/Closing Date 07/13/26 - 08/12/26", "July 13, 2026 through August 12, 2026",
  // "Statement period: Sep 13 - Oct 12, 2026".
  function period(text) {
    let m = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\s*(?:-|–|—|through|thru|to)\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i);
    if (m) return { start: ymdOf(m[3], m[1], m[2]), end: ymdOf(m[6], m[4], m[5]) };
    m = text.match(new RegExp(`\\b${MONRE}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\s*(?:-|–|—|through|thru|to)\\s*${MONRE}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
    if (m) { const m1 = monN(m[1]), m2 = monN(m[4]), y2 = +m[6], y1 = m[3] ? +m[3] : m1 > m2 ? y2 - 1 : y2; return { start: ymdOf(y1, m1, m[2]), end: ymdOf(y2, m2, m[5]) }; }
    m = text.match(/\b(20\d\d)\b/);
    return m ? { start: null, end: `${m[1]}-12-31`, guess: true } : null;
  }
  // An amount: $1,234.56, -15.49, (15.49), 15.49-, 15.49 CR, 15.49 DR. sign: -1 money out, +1 money in, 0 not shown.
  const AMT = '\\(?[-–−+]?\\s?\\$?\\s?\\d{1,3}(?:,\\d{3})*\\.\\d{2}\\)?(?:-|\\s?(?:CR|DR)\\b)?';
  const AMT_END = new RegExp(`(?:^|\\s)(${AMT})$`, 'i');
  function amt(s) {
    const v = parseFloat(s.replace(/CR|DR/i, '').replace(/[^0-9.]/g, ''));
    const sign = /DR\b/i.test(s) || /^\(|^[-–−]|-$/.test(s.trim()) ? -1 : /CR\b/i.test(s) || /^\+/.test(s.trim()) ? 1 : 0;
    return { v, sign };
  }
  const DATE_NUM = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\s+/, DATE_MON = new RegExp(`^${MONRE}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\s+`, 'i');
  // Transaction lines (any bank): a date at the start (MM/DD, MM/DD/YY, MM/DD/YYYY or "Oct 05") and one to three
  // amounts at the end (the charge, maybe a running balance last). Which way the money went, in order: the amount's
  // own sign (minus, brackets, CR/DR), the Debit/Credit column it sits under, the running balance going down or up,
  // the section it's in (withdrawals, deposits, purchases, payments), and last the kind of statement: on a card
  // statement a plain amount is a purchase, on a bank statement plain is money in.
  function parseStatement(lines) {
    lines = lines.map(l => typeof l === 'string' ? { text: l } : l);
    const text = lines.map(l => l.text).join('\n'), per = period(text);
    const card = /opening\/closing date|payments and other credits|minimum payment due|credit (limit|access line)|new balance total/i.test(text);
    let end = per ? per.end : today();
    if (per && per.guess) {   // v311: only a year was found: the statement ends on its last line's day, never after today
      const md = [];
      for (const L of lines) { const t = L.text.replace(/\s+/g, ' ').trim(); let m = t.match(DATE_NUM), mo; if (m) mo = +m[1]; else if ((m = t.match(DATE_MON))) mo = monN(m[1]); if (m && !m[3] && mo >= 1 && mo <= 12 && +m[2] >= 1 && +m[2] <= 31) md.push(mo * 100 + +m[2]); }
      const wrap = md.some(x => x < 400) && md.some(x => x >= 1000), last = Math.max(0, ...md.filter(x => !wrap || x < 700));
      if (last) { end = ymdOf(end.slice(0, 4), Math.floor(last / 100), last % 100); if (end > today()) end = ymdOf(+end.slice(0, 4) - 1, end.slice(5, 7), end.slice(8, 10)); }
    }
    const endY = +end.slice(0, 4), out = [];
    let sec = null, cols = null, bal = null;
    for (const L of lines) {
      const line = L.text.replace(/\s+/g, ' ').trim();
      // column headings: where Debit / Credit / Balance end on the page
      if (L.parts) {
        const at = re => { const q = L.parts.find(q => re.test(q.s)); return q ? q.xr : null; };
        const db = at(/^(debits?|withdrawals?( and debits)?|money out|paid out|charges)$/i), cr = at(/^(credits?|deposits?( and credits)?|money in|paid in)$/i);
        if (db != null && cr != null) { cols = { db, cr, bal: at(/^balance$/i) }; continue; }
      }
      let m = line.match(DATE_NUM), mo, d, y, rest;
      if (m) { [, mo, d, y] = m; rest = line.slice(m[0].length); }
      else if ((m = line.match(DATE_MON))) { mo = monN(m[1]); d = m[2]; y = m[3]; rest = line.slice(m[0].length); }
      const opening = !m && line.match(new RegExp(`(beginning|opening|previous|starting) balance\\s+(${AMT})$`, 'i'));
      if (opening) { const a = amt(opening[2]); bal = a.v * (a.sign < 0 ? -1 : 1); continue; }
      const amts = [];
      if (m) { let r = rest, a; while (amts.length < 3 && (a = r.match(AMT_END))) { amts.unshift(a[1]); r = r.slice(0, a.index).trim(); } rest = r; }
      if (!m || !amts.length || !rest || +mo < 1 || +mo > 12 || +d < 1 || +d > 31) {
        if (line.length < 48 && !/\d+\.\d{2}/.test(line)) {
          if (/deposits|additions|credits|money in/i.test(line) && !/withdraw|debit/i.test(line)) sec = 'in';
          else if (/withdrawals|checks paid|purchases?|fees|atm & debit|debits|money out|cash advances|card transactions/i.test(line)) sec = 'out';
          else if (/transaction detail|account activity|transactions/i.test(line)) sec = null;
        }
        continue;
      }
      const desc = rest.replace(/\s+/g, ' ').trim();
      if (/^(beginning|ending|opening|closing) balance|^total|balance forward/i.test(desc)) continue;
      let date = y ? ymdOf(y, mo, d) : ymdOf(endY, mo, d);
      if (!y && dn(date) > dn(end) + 7) date = ymdOf(endY - 1, mo, d);   // December lines on a January statement
      // which number is the charge, which the balance
      const vals = amts.map(amt);
      let charge = vals[0], colSign = 0, newBal = null;
      if (vals.length >= 2) { newBal = vals[vals.length - 1]; newBal = newBal.v * (newBal.sign < 0 ? -1 : 1); charge = vals.find(x => x.v) || vals[0]; }
      if (cols && L.parts) {
        const q = [...L.parts].reverse().find(q => AMT_END.test(' ' + q.s) && Math.abs(amt(q.s).v - charge.v) < .005);
        if (q) { const near = [['db', -1], ['cr', 1], ['bal', 0]].filter(([k]) => cols[k] != null).sort((a, b) => Math.abs(cols[a[0]] - q.xr) - Math.abs(cols[b[0]] - q.xr))[0]; colSign = near ? near[1] : 0; }
      }
      let sign = charge.sign && card ? -charge.sign : charge.sign;   // on a card statement a minus is a payment or refund
      if (charge.sign && card && /DR|CR/i.test(amts[vals.indexOf(charge)])) sign = charge.sign;   // CR/DR mean what they say
      if (!sign) sign = colSign;
      if (!sign && newBal != null && bal != null) { const dlt = newBal - bal; sign = Math.abs(Math.abs(dlt) - charge.v) < .015 ? Math.sign(dlt) : 0; }
      if (!sign) sign = sec === 'out' ? -1 : sec === 'in' ? 1 : card ? -1 : 1;
      if (newBal != null) bal = newBal;
      if (!charge.v || isNaN(charge.v)) continue;
      out.push({ date, amount: sign * charge.v, description: desc });
    }
    return { rows: out, period: per && !per.guess ? per : null, card };
  }
  // A CSV export: the app's own reader, with the columns picked the way the Import card picks them.
  function parseCsvText(text) {
    const all = parseCSV(text);
    const h = all.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /amount|debit|credit|withdraw/i.test(c)));
    if (h < 0) return [];
    const H = all[h].map(c => String(c).trim()), f = re => H.findIndex(c => re.test(c));
    const di = f(/date/i), de = [/desc/i, /payee|merchant|name/i, /memo|detail/i].map(f).find(i => i >= 0);
    const ai = f(/^amount$|amount$/i), dbi = f(/debit|withdraw/i), cri = f(/credit|deposit/i), out = [];
    if (de == null || de < 0) return [];
    const df = dayFirst(all.slice(h + 1).map(r => r[di]));   // v311
    for (const r of all.slice(h + 1)) {
      const date = parseDate(r[di], df); if (!date) continue;
      let amount;
      if (ai >= 0) amount = parseAmount(r[ai]);
      else { const d = parseAmount(r[dbi]), c = parseAmount(r[cri]); amount = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(d) ? 0 : Math.abs(d)); }
      if (isNaN(amount) || !amount) continue;
      out.push({ date, amount, description: String(r[de] || '').trim() });
    }
    return out;
  }

  /* -- spotting what repeats -- */
  const SKIP = /\b(TRANSFER|XFER|PAYROLL|DIRECT DEP|DEPOSIT|INTEREST|PAYMENT TO CHASE CARD|CHASE CARD ENDING|CRD AUTOPAY|CREDIT CARD|CARDMEMBER|THANK YOU|ATM|CASH WITHDRAWAL|REFUND|RETURN|REVERSAL)\b/;
  const NOISE = new Set(('RECURRING CARD PURCHASE PURCHASES WITH PIN DEBIT POS ACH PREAUTHORIZED PRE AUTHORIZED ELECTRONIC AUTOPAY AUTO PAY BILL ' +
    'BILLPAY PAYMENT PAYMENTS PMT PMTS ONLINE WEB CHECKCARD CHECK VISA MASTERCARD AUTHORIZED ON SQ TST SP PAYPAL APLPAY COM WWW HTTP HTTPS NET ORG INC LLC LTD CO CORP ' +
    'US USA THE OF AND TO FROM AT FOR SALE ID ORIG NAME DESCR SEC PPD CCD TEL IND TRN EED TRACE ENTRY AL AK AZ AR CA CT DE FL GA HI IA IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE ' +
    'NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY DC').split(' '));
  // "Card Purchase 07/31 Netflix.Com Netflix.Com CA Card 1234" → NETFLIX; "Orig CO Name:Verizon Wireless Orig ID:…" → VERIZON WIRELESS
  function merchant(desc) {
    let s = String(desc || '').toUpperCase();
    const o = s.match(/ORIG CO NAME:\s*(.+?)\s+(?:ORIG ID|DESC DATE|CO ENTRY|SEC:|$)/); if (o) s = o[1];
    s = s.replace(/\b(PPD|WEB|CCD|TEL)\s+ID:.*$/, ' ').replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ').replace(/\bCARD\s+\d+/g, ' ')
      .replace(/\S*\d\S*/g, ' ').replace(/[^A-Z&' ]+/g, ' ').replace(/'/g, '');
    const words = [];
    for (const w of s.split(/\s+/)) if (w.length > 1 && !NOISE.has(w) && !words.includes(w)) words.push(w);
    return words.slice(0, 3).join(' ');
  }
  const title = k => k.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bAnd\b/g, '&');
  // When it hits: the middle day of the month it came out (days near the 1st count as after the 30th when it straddles
  // the turn of the month), and how far it wanders.
  function dueOf(list) {
    let ds = list.map(r => +r.date.slice(8, 10));
    if (Math.max(...ds) - Math.min(...ds) > 15) ds = ds.map(d => d < 15 ? d + 31 : d);
    const m = Math.round(med(ds)), day = m > 31 ? m - 31 : m;
    return { day, drift: Math.max(...ds) - Math.min(...ds), lo: Math.min(...ds) % 31 || 31, hi: Math.max(...ds) % 31 || 31 };
  }
  // A run of payments to one place: monthly (one a month, about a month apart; a skipped month is fine), every two
  // weeks, or weekly. Null when they don't keep a beat.
  function beat(list) {
    if (list.length < 2) return null;
    const ds = list.map(r => dn(r.date)), gaps = ds.slice(1).map((d, i) => d - ds[i]), g = med(gaps);
    const months = new Set(list.map(r => r.date.slice(0, 7))).size, n = list.length;
    if (n >= 3 && g >= 6 && g <= 8 && gaps.every(x => (x >= 5 && x <= 9) || (x >= 12 && x <= 16))) return { every: 'week', per: 52 / 12, months };
    if (n >= 3 && g >= 13 && g <= 16 && gaps.every(x => (x >= 11 && x <= 17) || (x >= 26 && x <= 32))) return { every: '2 weeks', per: 26 / 12, months };
    if (months >= 2 && n <= months + 1 && g >= 22 && g <= 40 && gaps.filter(x => x < 20).length <= 1 && gaps.every(x => x < 20 || (x >= 20 && x <= 41) || (x >= 50 && x <= 72))) return { every: 'month', per: 1, months };
    return null;
  }
  function judge(list) {
    list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const b = beat(list); if (!b) return null;
    const amts = list.map(r => Math.abs(r.amount)), mid = med(amts), spread = (Math.max(...amts) - Math.min(...amts)) / mid;
    const due = b.every === 'month' ? dueOf(list) : null;
    let conf = 'low';
    if (b.every === 'month') conf = b.months >= 3 && spread <= .15 && due.drift <= 4 ? 'high' : (b.months >= 3 || spread <= .02) && spread <= .3 ? 'medium' : 'low';
    else conf = list.length >= 4 && spread <= .15 ? 'high' : 'medium';
    if (spread > .6) return null;
    return { list, every: b.every, months: b.months, n: list.length, typical: mid, lo: Math.min(...amts), hi: Math.max(...amts), varies: spread > .02,
      monthly: Math.ceil(mid * b.per - 1e-9), due, conf, first: list[0].date, last: list[list.length - 1].date };
  }
  // Group the spending by place; a place with one steady payment a month counts as a whole (an electric bill that
  // changes a little each month); otherwise its payments are split by amount, so a monthly subscription stands out
  // from the other buys at the same shop.
  function analyze(all) {
    const seen = new Map(), groups = new Map(), skipped = new Map(); places = [];
    for (const r of all) {
      if (!(r.amount < 0)) continue;   // paychecks, deposits and refunds
      const raw = String(r.description || '').toUpperCase();
      const sk = raw.match(SKIP);
      const key = merchant(raw) || raw.replace(/[^A-Z ]+/g, ' ').trim().split(/\s+/).slice(0, 3).join(' '); if (!key) continue;
      if (sk) { const g = skipped.get(key) || { key, list: [], why: sk[1] }; g.list.push(r); skipped.set(key, g); continue; }   // transfers between your own accounts, card payments, cash
      const k = r.date + '|' + r.amount.toFixed(2) + '|' + key; if (seen.has(k) && (seen.get(k).fid || seen.get(k).file) !== (r.fid || r.file)) { const o = seen.get(k); if (r.file && r.file !== o.file) (o.also = o.also || new Set()).add(r.file); continue; } seen.set(k, r);   // the same row in two files
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
    }
    const out = [];
    for (const [key, list] of groups) {
      let c = judge(list);
      if (!c) {
        const byAmt = [...list].sort((a, b) => a.amount - b.amount).reverse(), cl = [];   // smallest first
        for (const r of byAmt) { const a = Math.abs(r.amount), last = cl[cl.length - 1]; if (last && a <= Math.abs(last[0].amount) * 1.15 + .5) last.push(r); else cl.push([r]); }
        const ok = cl.map(judge).filter(Boolean).sort((a, b) => b.months - a.months || b.n - a.n);
        if (ok.length) c = ok[0];
      }
      const amts = list.map(r => Math.abs(r.amount)), ms = new Set(list.map(r => r.date.slice(0, 7))).size;
      places.push({ key, list, n: list.length, months: ms, lo: Math.min(...amts), hi: Math.max(...amts),
        why: c ? 'bill' : list.length === 1 ? 'Only once' : ms < 2 ? 'All in one month' : 'No steady monthly amount' });
      if (!c) continue;
      c.key = key; c.name = title(key); c.descs = [...new Set(c.list.map(r => r.description))]; c.files = [...new Set(c.list.flatMap(r => [r.file, ...(r.also || new Set())]).filter(Boolean))];
      out.push(c);
    }
    for (const g of skipped.values()) { const amts = g.list.map(r => Math.abs(r.amount)); places.push({ key: g.key, list: g.list, n: g.list.length, months: new Set(g.list.map(r => r.date.slice(0, 7))).size, lo: Math.min(...amts), hi: Math.max(...amts), why: `Left out (${g.why.toLowerCase()})` }); }
    places.sort((a, b) => b.n - a.n || b.hi - a.hi);
    const rank = { high: 0, medium: 1, low: 2 };
    out.sort((a, b) => rank[a.conf] - rank[b.conf] || b.monthly - a.monthly);
    matchBills(out);
    return out;
  }
  // Already one of your bills? A rule that sends these payments to a bill, a shared word in the name, or the same
  // amount on about the same day.
  function matchBills(list) {
    const bills = state.categories.filter(c => c.kind === 'bill'), used = new Set();
    const words = s => merchant(s).split(' ').filter(w => w.length >= 3);
    const tries = [
      (x, c) => (state.rules || []).some(r => r.categoryId === c.id && r.match && x.descs.some(d => ruleMatches(r.match, d))),
      (x, c) => words(c.name).some(w => x.key.split(' ').includes(w)),
      (x, c) => Number(c.budget) > 0 && Math.abs(Number(c.budget) - x.typical) <= Math.max(1, Number(c.budget) * .03) && (!x.due || !c.dueDay || Math.abs(c.dueDay - x.due.day) <= 3),
    ];
    for (const x of list) x.bill = null;
    for (const t of tries) for (const x of list) {
      if (x.bill) continue;
      const c = bills.find(c => !used.has(c.id) && t(x, c)); if (c) { x.bill = c; used.add(c.id); }
    }
    for (const x of list) x.pick = !x.bill && (x.conf === 'high' || (x.conf === 'medium' && !x.varies));
  }

  /* -- the box -- */
  const box = () => $('recurBox');
  function open(src) {
    from = src || ''; rows = []; files = []; found = []; added = new Map(); sess++; readIds = new Set();
    $('rcFile').value = ''; draw(); box().classList.remove('hidden'); document.documentElement.classList.add('rc-open');
    setTimeout(() => $('rcTitle').focus && $('rcTitle').focus(), 30);
  }
  function close() {
    box().classList.add('hidden'); document.documentElement.classList.remove('rc-open'); rows = []; files = []; found = []; places = []; $('rcFile').value = ''; sess++; readIds = new Set();   // nothing is kept
    if (from === 'town' && Town.selected === 'home') Town.open('home');
  }
  async function readFiles(list) {
    const my = sess; $('rcStatus').textContent = 'Reading…';
    for (const f of list) {
      const fid = [f.name, f.size, f.lastModified].join('|'); if (readIds.has(fid)) continue; readIds.add(fid);   // v311: read once
      const rec = { name: f.name, n: 0, err: '', period: null };
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          let lines;
          try { lines = await pdfLines(await f.arrayBuffer()); }
          catch (e) { rec.err = /did not load/.test(e.message) ? "Couldn't load the PDF reader (it needs the internet the first time). Try again online, or use your bank's CSV export." : `Couldn't read transactions from ${f.name}. Try the CSV export.`; }
          if (my !== sess) return;   // v311: the box closed while it read: nothing is kept
          if (lines) { const st = parseStatement(lines); rec.n = st.rows.length; rec.period = st.period; st.rows.forEach(r => { r.file = f.name; r.fid = fid; rows.push(r); }); }
        } else {
          const tx = await f.text(); if (my !== sess) return;
          const r = parseCsvText(tx); rec.n = r.length; r.forEach(x => { x.file = f.name; x.fid = fid; rows.push(x); });
          if (r.length) rec.period = { start: r.reduce((a, x) => x.date < a ? x.date : a, r[0].date), end: r.reduce((a, x) => x.date > a ? x.date : a, r[0].date) };
        }
        if (!rec.err && rec.n < 3) rec.err = `Couldn't read transactions from ${f.name}. Try the CSV export.`;
      } catch (e) { rec.err = `Couldn't read transactions from ${f.name}. Try the CSV export.`; }
      if (my !== sess) return;
      files.push(rec);
    }
    found = analyze(rows);
    $('rcFile').value = '';
    draw();
  }
  const rng = p => p && p.start ? `${shortDate(p.start)} – ${shortDate(p.end)}` : '';
  const monthsOf = x => { const m = [...new Set(x.list.map(r => r.date.slice(0, 7)))]; const f = k => new Date(k + '-15T12:00').toLocaleDateString(undefined, { month: 'short' }); return m.length > 1 ? `${f(m[0])}–${f(m[m.length - 1])}` : f(m[0]); };
  function whenText(x) {
    if (x.every !== 'month') return `every ${x.every} · about ${moneyExact(x.typical)} each`;
    const d = x.due, wand = d.drift > 3 ? ` (moves: ${ordinal(d.lo)}–${ordinal(d.hi)})` : '';
    return `due around the ${ordinal(d.day)}${wand}`;
  }
  function seenText(x) {
    const amt = x.varies ? `${moneyExact(x.lo)}–${moneyExact(x.hi)}` : `${moneyExact(x.typical)} each time`;
    return x.every === 'month' ? `seen in ${x.months} months (${monthsOf(x)}) · ${amt}` : `seen ${x.n} times (${monthsOf(x)})`;
  }
  const fromText = x => x.files && x.files.length ? `<div class="rc-sub rc-from">from ${x.files.map(esc).join(', ')}</div>` : '';
  const CONF = { high: ['sure', 'Shows up every month, same amount'], medium: ['likely', 'Probably a bill'], low: ['maybe', 'Might be a bill'] };
  function rowHTML(x, i) {
    const c = CONF[x.conf], badge = `<span class="rc-conf ${x.conf}" title="${c[1]}">${c[0]}</span>`;
    if (x.bill) {
      const b = x.bill, has = b.due && b.due.wd != null ? null : b.dueDay;
      const canSet = x.due && !(b.due && b.due.wd != null) && has !== x.due.day;
      return `<div class="rc-row have" data-rc="${i}"><div class="rc-top"><b>${esc(x.name)}</b>${badge}<span class="num">${moneyExact(x.typical)}</span></div>
        <div class="rc-sub">${esc(whenText(x))} · ${esc(seenText(x))}</div>
${fromText(x)}
        <div class="rc-sub">Already a bill: <b>${esc(b.name)}</b> (${money(Number(b.budget || 0))}, ${esc(dueText(b).replace(/^The /, 'due the ').replace('No due date', 'no due day'))})</div>
        ${canSet ? `<button class="rc-due" data-rc-due="${i}">Set ${esc(b.name)} due day to the ${ordinal(x.due.day)}</button>` : x.due ? '<div class="rc-sub ok">Due day matches ✓</div>' : ''}</div>`;
    }
    if (added.has(x.key)) return `<div class="rc-row done"><div class="rc-top"><b>${esc(added.get(x.key))}</b><span class="ok">Added ✓</span></div></div>`;
    return `<label class="rc-row" data-rc="${i}"><div class="rc-top"><input type="checkbox" data-rc-pick="${i}"${x.pick ? ' checked' : ''} aria-label="Add ${esc(x.name)} as a bill">
        <input class="rc-name" data-rc-name="${i}" value="${esc(x.name)}" maxlength="40" aria-label="Bill name">${badge}
        <span class="rc-amt">$<input data-rc-amt="${i}" type="number" inputmode="decimal" min="0" value="${x.monthly}" aria-label="Amount a month"></span></div>
        <div class="rc-sub">${esc(whenText(x))}${x.every !== 'month' ? ` → ${money(x.monthly)} a month` : ''}</div>
        <div class="rc-sub">${esc(seenText(x))}</div>${fromText(x)}</label>`;
  }
  function picked() {
    return found.map((x, i) => ({ x, i })).filter(({ x, i }) => !x.bill && !added.has(x.key) && x.pick).map(({ x, i }) => {
      const nm = $('rcOut').querySelector(`[data-rc-name="${i}"]`), am = $('rcOut').querySelector(`[data-rc-amt="${i}"]`);
      return { x, name: (nm ? nm.value : x.name).trim() || x.name, amount: Math.max(0, Math.ceil((am ? Number(am.value) : x.monthly) - 1e-9) || 0) };
    }).filter(q => q.amount > 0);   // v311: no $0 bills
  }
  function summary() {
    const p = picked(), now = billsMonthly(), then = now + p.reduce((a, q) => a + q.amount, 0);
    $('rcSum').textContent = p.length ? `Bills go from ${money(now)} to ${money(then)} a month.` : `Your bills are ${money(now)} a month. Tick the ones to add.`;
    $('rcAdd').disabled = !p.length; $('rcAdd').textContent = p.length ? `Add ${p.length} bill${p.length === 1 ? '' : 's'}` : 'Add selected bills';
  }
  function addPlace(i) {
    const g = places[i]; if (!g || found.some(x => x.key === g.key)) return;
    const list = [...g.list].sort((a, b) => a.date.localeCompare(b.date)), amts = list.map(r => Math.abs(r.amount)), mid = med(amts);
    const monthly = Math.ceil(amts.reduce((a, b) => a + b, 0) / Math.max(1, g.months) - 1e-9);
    found.push({ list, every: 'month', months: g.months, n: list.length, typical: mid, lo: g.lo, hi: g.hi, varies: (g.hi - g.lo) / mid > .02, monthly, due: dueOf(list),
      conf: 'low', first: list[0].date, last: list[list.length - 1].date, key: g.key, name: title(g.key), descs: [...new Set(list.map(r => r.description))],
      files: [...new Set(list.map(r => r.file).filter(Boolean))], bill: null, pick: true, hand: true });
    g.why = 'bill'; draw();
  }
  function draw() {
    const anyFile = files.length > 0;
    $('rcIntro').classList.toggle('hidden', anyFile);
    $('rcPickLbl').textContent = anyFile ? '+ Add more statements' : 'Choose statements';
    $('rcStatus').textContent = '';
    $('rcFiles').innerHTML = files.map(f => `<div class="rc-file${f.err ? ' bad' : ''}"><span class="grow">${esc(f.name)}</span><span>${f.err ? esc(f.err) : `${f.n} transaction${f.n === 1 ? '' : 's'} read${f.period ? ' · ' + rng(f.period) : ''}`}</span></div>`).join('');
    let html = '';
    if (anyFile && rows.length) {
      const ds = rows.map(r => r.date).sort(), span = dn(ds[ds.length - 1]) - dn(ds[0]);
      const fresh = found.filter(x => !x.bill), have = found.filter(x => x.bill);
      html += `<p class="rc-note">Looked at ${rows.length} transactions, ${shortDate(ds[0])} – ${shortDate(ds[ds.length - 1])}. Paychecks, deposits, transfers between your accounts and one-time buys are left out.</p>`;
      if (span < 50) html += `<p class="rc-note warn">That's only about one month. Add 2–3 months of statements so the repeating payments stand out.</p>`;
      html += fresh.length ? `<h3 class="rc-h">Looks like a bill</h3>` + found.map((x, i) => x.bill ? '' : rowHTML(x, i)).join('')
        : `<p class="rc-note">No new repeating payments found${span < 50 ? ' yet' : ''}.</p>`;
      if (have.length) html += `<h3 class="rc-h">Already in your bills</h3>` + found.map((x, i) => x.bill ? rowHTML(x, i) : '').join('');
      const amt = g => g.hi - g.lo < .01 ? moneyExact(g.lo) : `${moneyExact(g.lo)}–${moneyExact(g.hi)}`;
      html += `<details class="rc-all"${places.length && found.length < 6 ? ' open' : ''}><summary>Everything it read (${places.length} place${places.length === 1 ? '' : 's'} you paid)</summary>
        <p class="rc-note">Missing a bill? Find it here and tap <b>+ Bill</b>. If it isn't here at all, it wasn't on these statements (maybe it comes out of another account or card).</p>` +
        places.map((g, i) => `<div class="rc-place"><div class="grow"><b>${esc(title(g.key))}</b><div class="rc-sub">${g.n}× · ${amt(g)} · ${g.months} month${g.months === 1 ? '' : 's'} · ${g.why === 'bill' ? '<span class="ok">counted as a bill</span>' : esc(g.why)}</div></div>${g.why === 'bill' ? '' : `<button class="rc-plus" data-rc-place="${i}">+ Bill</button>`}</div>`).join('') + `</details>`;
    }
    $('rcOut').innerHTML = html;
    const fresh = found.some(x => !x.bill && !added.has(x.key));
    $('rcFoot').classList.toggle('hidden', !anyFile);
    $('rcAdd').classList.toggle('hidden', !fresh); $('rcSum').classList.toggle('hidden', !fresh);
    if (fresh) summary();
  }
  async function addPicked() {
    const p = picked(); if (!p.length) return;
    if (from === 'setup') {   // during setup the picks fill the setup's bill rows; Start is the confirmation
      $('suBills').querySelectorAll('.su-row.bill').forEach(r => { if (![...r.querySelectorAll('input')].some(i => i.value.trim())) r.remove(); });
      $('suBills').insertAdjacentHTML('beforeend', p.map(q => suRow('bill', q.name, q.amount, q.x.due ? q.x.due.day : '')).join(''));
      if (typeof suRoom === 'function') suRoom();
      close(); toast(`Added ${p.length} bill${p.length === 1 ? '' : 's'} to your list. Check them, then Start.`);
      return;
    }
    const now = billsMonthly(), then = now + p.reduce((a, q) => a + q.amount, 0);
    if (!await ask(`Add ${p.length === 1 ? 'this bill' : `these ${p.length} bills`}: ${p.map(q => `${q.name} ${money(q.amount)}`).join(', ')}? Bills go from ${money(now)} to ${money(then)} a month.`)) return;
    for (const q of p) {
      state.categories.push({ id: uid(), name: q.name, budget: q.amount, kind: 'bill', dueDay: q.x.due ? q.x.due.day : null, account: state.accounts[0], at: Date.now() });
      added.set(q.x.key, `${q.name} · ${money(q.amount)} a month${q.x.due ? `, due the ${ordinal(q.x.due.day)}` : ''}`);
    }
    save(); render(); draw();
    toast(`Added ${p.length} bill${p.length === 1 ? '' : 's'}`);
  }
  function setDue(i) {
    const x = found[i]; if (!x || !x.bill || !x.due) return;
    const c = state.categories.find(c => c.id === x.bill.id); if (!c) return;
    const was = { dueDay: c.dueDay, due: c.due };
    c.dueDay = x.due.day; c.due = null; save(); render(); draw();
    toastUndo(`${c.name} is due the ${ordinal(x.due.day)} now`, () => { c.dueDay = was.dueDay; c.due = was.due; save(); render(); draw(); });
  }

  $('rcFile').onchange = e => { const l = [...e.target.files]; if (l.length) readFiles(l); };
  $('rcClose').onclick = close;
  $('rcAdd').onclick = addPicked;
  $('rcAgain').onclick = () => { rows = []; files = []; found = []; places = []; added = new Map(); sess++; readIds = new Set(); draw(); };
  $('rcOut').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.rcPick) { found[+t.dataset.rcPick].pick = t.checked; summary(); }
    if (t.dataset.rcAmt || t.dataset.rcName) summary();
  });
  $('rcOut').addEventListener('input', e => { if (e.target.dataset.rcAmt) { const i = +e.target.dataset.rcAmt; if (found[i].pick !== Number(e.target.value) > 0) { found[i].pick = !found[i].pick; const cb = $('rcOut').querySelector(`[data-rc-pick="${i}"]`); if (cb) cb.checked = found[i].pick; } summary(); } });
  $('rcOut').addEventListener('click', e => { const b = e.target.closest('[data-rc-due]'); if (b) { e.preventDefault(); setDue(+b.dataset.rcDue); } const q = e.target.closest('[data-rc-place]'); if (q) { e.preventDefault(); addPlace(+q.dataset.rcPlace); } });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !box().classList.contains('hidden') && $('askBox').classList.contains('hidden')) { e.stopImmediatePropagation(); close(); } }, true);
  $('recurOpenBtn').onclick = () => open('settings');
  $('suFind').onclick = () => open('setup');
  return { open, close, analyze, parseStatement, parseCsvText, merchant, get rows() { return rows; }, get found() { return found; } };
})();
