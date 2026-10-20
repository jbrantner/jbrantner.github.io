'use strict';
function ask(msg) {
  return new Promise(res => {
    $('askMsg').textContent = msg; $('askBox').classList.remove('hidden');
    const done = v => { $('askBox').classList.add('hidden'); res(v); };
    $('askYes').onclick = () => done(true); $('askNo').onclick = () => done(false);
  });
}
function toast(msg) { const t = $('toast'); if (t.classList.contains('act') && t.classList.contains('show') && Date.now() - (toastUndo.at || 0) < 1000) { toastUndo.q = msg; return; }   // v311: after the Undo
  t.classList.remove('act'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
// A toast with an Undo button, for a few seconds.
function toastUndo(msg, undo) {
  const t = $('toast'); t.innerHTML = `<span>${esc(msg)}</span><button type="button">Undo</button>`; t.classList.add('show', 'act'); toastUndo.at = Date.now(); toastUndo.q = null;
  t.querySelector('button').onclick = () => { toastUndo.q = null; t.classList.remove('show', 'act'); undo(); };
  const end = () => { if (t.contains(document.activeElement)) { toast.t = setTimeout(end, 1000); return; }   // v311: not while focus is on its Undo
    t.classList.remove('show', 'act'); const q = toastUndo.q; toastUndo.q = null; if (q) toast.t = setTimeout(() => toast(q), 300); };
  clearTimeout(toast.t); toast.t = setTimeout(end, 6000);
}
const acctOptions = sel => state.accounts.map(a => `<option${a === sel ? ' selected' : ''}>${esc(a)}</option>`).join('');
function catOptions(selected, includeNone = true) {
  return (includeNone ? `<option value="">Everything else</option>` : '') +
    state.categories.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}
(() => {   // v311
  const back = new WeakMap(), mo = new MutationObserver(ms => { for (const m of ms) {
    const d = m.target, open = !d.classList.contains('hidden'), was = !String(m.oldValue || '').split(/\s+/).includes('hidden'); if (open === was) continue;
    if (open) { if (d.contains(document.activeElement)) continue; back.set(d, document.activeElement); const c = d.querySelector(':scope > .card') || d; if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '-1'); try { c.focus({ preventScroll: true }); } catch (e) {} }
    else { const b = back.get(d); back.delete(d); if (b && b.isConnected && b.matches('button, a, summary, [role="button"], [tabindex]') && (d.contains(document.activeElement) || document.activeElement === document.body)) try { b.focus({ preventScroll: true }); } catch (e) {} }
  } });
  document.querySelectorAll('.ask[role="dialog"]').forEach(d => mo.observe(d, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));
})();
function sess(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
