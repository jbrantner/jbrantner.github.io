'use strict';
/* The test copy (jbrantner.github.io/budget-next/) shares the live app's site, so it would share its saved data too. Here
   every saved key gets a "budget-next:" prefix: the test copy starts empty (restore a backup in it), and nothing it does
   reaches the live app's data. Upkeep's page (shown with srcdoc, the same site) get the same prefix.
   At its own address, when it becomes the live app, this file does nothing. */
(function sandbox() {
  const on = /\/budget-next\//.test(location.pathname) || (() => { try { return parent !== window && !!parent.__sandboxed; } catch (e) { return false; } })();
  if (!on) return;
  window.__sandboxed = true;
  let real; try { real = window.localStorage; } catch (e) { return; }
  const P = 'budget-next:';
  const own = () => { const a = []; for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k && k.startsWith(P)) a.push(k.slice(P.length)); } return a; };
  const box = {
    getItem: k => real.getItem(P + k), setItem: (k, v) => real.setItem(P + k, String(v)), removeItem: k => real.removeItem(P + k),
    key: i => own()[i] ?? null, clear: () => own().forEach(k => real.removeItem(P + k)), get length() { return own().length; },
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => box }); } catch (e) {}
  // Upkeep: its page gets this same function as their first script
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc'); if (!desc) return;
  const shim = '<script>(' + sandbox + ')();<\/script>';
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', { configurable: true, get() { return desc.get.call(this); },
    set(v) { v = String(v); desc.set.call(this, /<head[^>]*>/i.test(v) ? v.replace(/<head[^>]*>/i, m => m + shim) : shim + v); } });
})();
