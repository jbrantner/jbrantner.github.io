'use strict';
function setLock(id, on) {
  if (!state.pots.some(p => p.id === id)) return;
  state.locked = state.locked || {}; if (on) state.locked[id] = true; else delete state.locked[id];
  save(); render(); toast(on ? `${potName(id)} is locked: its money a day stays put` : `${potName(id)} is unlocked`);
}
// one villager from `from` to `to`
function addVillager(to, from) {
  if (to === 'savings' || !canFarm(to) || !state.pots.some(p => p.id === to) || !from || from === to) return false;
  if (clockHold()) return false;   // v137
  if (state.roundOff) { toast('Rounding off right now. Tap Stop first.'); return false; }
  if (isLocked(to) || isLocked(from)) { toast(`${potName(isLocked(to) ? to : from)} is locked. Unlock it first.`); return false; }
  if (crewBuilt(to)) { toast("That one's full. Raise its goal to keep saving."); return false; }
  const d = donorList(to).find(x => x.id === from); if (!d || d.n < 1) { toast(`Nobody left at ${d ? d.name : 'that place'}`); return false; }
  reassign(stampNow(), from === 'savings' ? { [to]: 1 } : { [from]: -1, [to]: 1 }, true); save(); render();
  toast(`$1 a day from ${d.name} → ${potName(to)}`);
  return true;
}
function removeVillager(id) {
  if (isLocked(id)) { toast(`${potName(id)} is locked. Unlock it first.`); return false; }
  const w = workersAt(id); setCrew(id, -1); return workersAt(id) < w;
}
