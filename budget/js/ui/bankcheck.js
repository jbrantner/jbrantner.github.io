'use strict';
/* v136 #2: the weekly bank check. Once a week (from Sunday, the week's last day, until done; v144 keeps its Sunday key) the Budget list offers it; the Bank balance card has it
   too. It compares what your bank app says with what the app counts; a difference is fixed through Adjust (a bank
   fix, the same as ever). When bills are held or were marked paid lately, Fix it opens Adjust so you can say which
   have come out. */
const bankCheckDue = () => !state.needsSetup && (state.bankCheck || {}).wk !== ymd(checkWeek());
let bc = null;
function openBankCheck(fresh) {
  if (planBlock()) return;
  bc = { fresh: !!fresh, B: null };
  const pp = hoardParts();
  $('bcTitle').textContent = fresh ? "What's in your bank right now?" : 'Weekly bank check';
  $('bcSays').textContent = fresh ? `History is cleared, so the app counts ${moneyExact(pp.bank)} now. Type what your bank shows and Savings is set to match.` : `The app counts ${moneyExact(pp.bank)} in your bank right now.`;
  $('bcAsk').textContent = fresh ? "What's in your bank right now?" : 'What does your bank app say?';
  $('bcAmt').value = ''; $('bcAmt').disabled = false; $('bcDial').classList.add('hidden'); $('bcNote').textContent = ''; $('bcNote').className = '';
  $('bcGo').textContent = 'Check'; $('bcGo').disabled = true; $('bcGo').classList.remove('hidden'); $('bcLater').textContent = 'Later';
  $('bcBox').classList.remove('hidden'); setTimeout(() => { if (bc) $('bcAmt').focus(); }, 60);
}
function closeBankCheck() { bc = null; $('bcBox').classList.add('hidden'); }
function bankCheckLater() { if (!(bc && bc.fresh)) { state.bankCheck = { wk: ymd(checkWeek()), at: Date.now(), later: true }; save(); } closeBankCheck(); render(); }
function bcRing(f, cls, txt) { const r = $('bcRing'); r.setAttribute('class', 'f ' + cls); r.style.strokeDashoffset = String(314.16 * (1 - clamp01(f))); $('bcTxt').textContent = txt; }
function bankCheckGo() {
  if (!bc) return;
  if (bc.B != null) { if (Math.abs(Date.now() - (bc.t || 0)) < 700) return; return bankCheckFix(); }   // v311: a double tap on Check isn't Fix it
  const v = $('bcAmt').value.trim(), B = Number(v); if (v === '' || !isFinite(B)) return;
  bankPick = {}; const { pp, rows } = bankRows(), exp = bankExpect(rows, pp), d = cents(B - exp);
  $('bcDial').classList.remove('hidden'); bcRing(0, '', '');
  if (Math.abs(d) <= 0.5) {
    requestAnimationFrame(() => bcRing(1, 'ok', '✓'));
    $('bcNote').innerHTML = `<b style="color:var(--ok)">Matches your bank${Math.abs(d) >= 0.005 ? `, within ${Math.round(Math.abs(d) * 100)}¢` : ''}.</b> See you next week.`;
    if (!bc.fresh) { state.bankCheck = { wk: ymd(checkWeek()), at: Date.now(), ok: true }; save(); }
    $('bcAmt').disabled = true; $('bcGo').classList.add('hidden'); $('bcLater').textContent = 'Done'; bc.done = true; render(); return;
  }
  bc.B = cents(B); bc.rows = rows.length; bc.t = Date.now();
  requestAnimationFrame(() => bcRing(Math.max(0.12, 1 - Math.abs(d) / Math.max(1, Math.abs(exp))), 'off', `${d < 0 ? '−' : '+'}${moneyExact(Math.abs(d))}`));
  const names = rows.slice(0, 3).map(r => esc(r.name)).join(', ');
  $('bcNote').innerHTML = `<b style="color:var(--warn)">Off by ${moneyExact(Math.abs(d))}.</b> Your bank shows ${d < 0 ? 'less' : 'more'} than the app counts. Fix it ${d < 0 ? 'takes it out of' : 'puts it into'} Savings.`
    + (rows.length ? `<br><span class="muted" style="font-size:13px">Bills held lately (${names}${rows.length > 3 ? '…' : ''}) may have come out already, so Fix it opens Adjust to ask.</span>` : '');
  $('bcAmt').disabled = true; $('bcGo').textContent = 'Fix it'; $('bcLater').textContent = 'Not now';
}
function bankCheckFix() {
  const B = bc.B, fresh = bc.fresh, rows = bc.rows;
  if (!fresh) { state.bankCheck = { wk: ymd(checkWeek()), at: Date.now(), fixed: true }; save(); }
  closeBankCheck();
  if (rows) { openBankAdjust(B); return; }
  bankPick = {}; $('bankAmt').value = String(B); bankGo();   // the same Adjust path as ever
}
function openBankAdjust(B) {
  showView('town'); render();
  const m = $('townMoney'); m.classList.remove('hidden'); $('townHud').setAttribute('aria-expanded', 'true');
  bankOpen = true; bankPick = {}; renderBank(); $('bankAmt').value = String(B); { const { rows, pp } = bankRows(); bankDiff(rows, pp); }
  setTimeout(() => { $('bankBox').scrollIntoView({ block: 'center' }); }, 60);
}
