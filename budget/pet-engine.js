/* Pet engine (Tamagotchi-style demo) for the budget app's Pet tab. No UI, no DOM.
   - Stats are lazy: nothing runs on a timer, tick(state, now) catches the pet up from timestamps.
   - Coins come from the percent of each day's money left at its end (read from the budget app, read-only).
   - Training XP comes from Upkeep's log (read-only).
   - Guilt-free: the pet never dies, never gets sick, never runs away. An empty stat only makes it look sad,
     there's a free meal every day, and nothing is ever taken away for a missed day.
   Real money is never touched: coins mirror the share of the day you didn't spend, the dollars stay in the budget.
   Works in the browser (window.PetEngine) and in Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HOUR = 36e5, DAY = 864e5;
  const KEY = 'pet.v1', BUDGET_KEY = 'budget-pet.v1', BUDGET_DAYS_KEY = 'budget-day-ends.v1', UPKEEP_KEY = 'upkeep.v1';

  const RULES = {
    max: 4,                      // hearts, like the original toy
    hungerEvery: 6 * HOUR,       // one hunger heart drains every 6 awake hours (empty in ~24 h)
    happyEvery: 7 * HOUR,        // one happy heart every 7 awake hours
    poopEvery: 8 * HOUR,         // a poop appears every 8 awake hours, at most 3 at once
    poopMax: 3,
    poopHappyCost: true,         // while there's poop, happiness drains twice as fast (never below 0)
    bedtime: 23, wake: 7,        // local hours; stats don't drain while it sleeps
    freeMealsPerDay: 1,          // one free meal a day so a broke week never means a starving pet
    coinsPerDay: 10,             // a day with nothing spent pays 10 coins; half left pays 5 (Jordan 2026-10-14: a percent, so a smaller income earns the same)
    hatchAfter: 60 * 1000,       // the egg hatches a minute after it's first made
    stages: [                    // by pet level (Jordan 2026-10-14: evolution + unlocks; Upkeep training levels it)
      { id: 'baby', level: 1 }, { id: 'child', level: 3 }, { id: 'teen', level: 5 }, { id: 'adult', level: 8 }],
  };

  // Food: hunger and happy are hearts, weight is in grams-ish points (shown or not, the UI decides)
  // `level` = the pet level that unlocks it in the shop. Evolution levels (3, 5, 8) unlock nothing: growing up is the reward.
  const SHOP = [
    { id: 'meal', name: 'Rice bowl', price: 3, hunger: 1, happy: 0, weight: 1, level: 1 },
    { id: 'snack', name: 'Candy', price: 2, hunger: 0, happy: 1, weight: 2, level: 1 },
    { id: 'veggie', name: 'Veggie plate', price: 4, hunger: 2, happy: 0, weight: 0, level: 2 },
    { id: 'cake', name: 'Cake', price: 8, hunger: 1, happy: 2, weight: 3, level: 6 },
    { id: 'feast', name: 'Feast', price: 12, hunger: 4, happy: 1, weight: 2, level: 9 },
  ];
  // bought once, kept forever. A toy changes play; an outfit is worn (one at a time) and is only looks.
  const GOODS = [
    { id: 'ball', kind: 'toy', name: 'Ball', price: 6, level: 4 },         // with the ball, a lost game still adds a happy heart
    { id: 'bow', kind: 'outfit', name: 'Bow', price: 10, level: 7 },
    { id: 'scarf', kind: 'outfit', name: 'Scarf', price: 15, level: 10 },
    { id: 'crown', kind: 'outfit', name: 'Crown', price: 25, level: 11 },
  ];
  // what each level gives, for the UI's 'next unlock' line: { level, stage } or { level, item }
  function unlocksAt(level, rules = RULES) {
    const out = [];
    for (const st of rules.stages) if (st.level === level && level > 1) out.push({ level, stage: st.id });
    for (const x of [...SHOP, ...GOODS]) if (x.level === level && level > 1) out.push({ level, item: x.id });
    return out;
  }
  function nextUnlock(s, rules = RULES) {
    const lv = levelOf(s.xp).level;
    for (let l = lv + 1; l <= 50; l++) { const u = unlocksAt(l, rules); if (u.length) return u[0]; }
    return null;
  }
  const FREE_MEAL = { id: 'free', name: 'Daily rice', price: 0, hunger: 2, happy: 0, weight: 1 };
  // treats you can't buy: they come from untouched categories, payday gift boxes and outings
  const TREATS = [
    { id: 'latte', name: 'Latte', hunger: 0, happy: 1, weight: 1 },
    { id: 'cookie', name: 'Cookie', hunger: 0, happy: 1, weight: 1 },
    { id: 'soda', name: 'Soda pop', hunger: 0, happy: 1, weight: 1 },
    { id: 'kibble', name: 'Kibble', hunger: 1, happy: 0, weight: 1 },
    { id: 'tea', name: 'Warm tea', hunger: 0, happy: 1, weight: 0 },
    { id: 'berry', name: 'Berries', hunger: 1, happy: 0, weight: 0 },
  ];
  const foodById = id => SHOP.find(x => x.id === id) || TREATS.find(x => x.id === id);

  // ---- the 10 app ideas (Jordan 2026-10-14 04:06: "let's try all of them") ----
  // 1. a spending category left untouched all day gives its food (by the category's pixel symbol in the budget app)
  const CAT_FOOD = { food: 'meal', coffee: 'latte', fun: 'snack', shop: 'cookie', gas: 'soda', car: 'soda', pet: 'kibble', health: 'veggie', gift: 'cake', home: 'tea', other: 'berry', any: 'berry' };
  // 3. finished projects hatch friends, drawn from the monster sprites already in pixel-assets/app (monster-<kind>-<color>.png)
  const FRIEND_KINDS = ['slime', 'bat', 'cyclops', 'brute'], FRIEND_COLORS = ['blue', 'green', 'orange', 'pink', 'purple', 'yellow'];
  // 4. payday gift box
  const PARTY_GIFTS = ['cake', 'snack', 'latte', 'cookie', 'feast'];
  // 6. treasure from collected cents, 7. souvenirs from outings: room decorations, no repeats until a set is complete
  const TRINKETS = ['shell', 'marble', 'feather', 'acorn', 'old key', 'bottle cap', 'button', 'gem', 'star stone', 'crystal'];
  const OUTINGS = [
    { id: 'park', souvenirs: ['kite', 'pinecone', 'flower pot'] },
    { id: 'beach', souvenirs: ['sandcastle', 'starfish', 'beach ball'] },
    { id: 'forest', souvenirs: ['mushroom lamp', 'mossy rock', 'birdhouse'] },
  ];
  // 10. home size from Savings measured in days of your own pay (so a smaller income grows it just as fast). Never shrinks.
  const HOMES = [{ id: 'box', days: 0 }, { id: 'hut', days: 7 }, { id: 'cottage', days: 30 }, { id: 'house', days: 90 }, { id: 'manor', days: 180 }];

  // a steady pick from a string, so the same payday or project always gives the same thing
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const pick = (arr, key) => arr[hash(String(key)) % arr.length];
  const pickNew = (arr, have, key) => { const left = arr.filter(x => !have.includes(x)); return left.length ? pick(left, key) : null; };

  // Upkeep log kinds train different stats; a later Digimon-style evolution can branch on the biggest one
  const TRAIN = { habit: 'power', chip: 'smarts', fin: 'smarts', spot: 'spirit' };

  const pad = n => String(n).padStart(2, '0');
  const dateOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function create(now = Date.now(), name = '') {
    return {
      v: 1, name, born: now, hatched: null, last: now,
      hunger: RULES.max, happy: RULES.max, weight: 5, poop: 0,
      acc: { hunger: 0, happy: 0, poop: 0 },          // awake ms built up toward the next drain
      coins: 0, earnedTotal: 0, credited: {},          // credited: { 'YYYY-MM-DD': coins } for days already paid
      xp: 0, train: { power: 0, smarts: 0, spirit: 0 }, upkeepSeen: {}, upkeepSince: now,
      freeMeal: { date: '', used: 0 },
      inv: {},                                         // bought food not eaten yet: { id: count }
      owned: {}, wear: null,                           // toys and outfits bought (id: 1), and the outfit being worn
      seen: {},                                        // budget events already handled: { id: t }
      weeks: {},                                       // weeks already judged for an outing: { 'YYYY-MM-DD' (Monday): place or 0 }
      eggs: {},                                        // savings projects growing an egg: { id: { name, pct } }
      friends: [],                                     // hatched from finished projects: { id, name, kind, color, t }
      decor: [],                                       // room decorations: trinkets and souvenirs
      outings: 0,                                      // trips taken, to rotate park / beach / forest
      home: 'box', room: { tidy: null }, chipSnap: {}, lastBath: 0, lastHug: 0, lastParty: 0, lastDream: '',
      log: [],                                         // recent events for the UI to ping: { t, type, ... }, last 50
    };
  }

  // ms the pet was awake between a and b (sleep window bedtime..wake, local time)
  function awakeMs(a, b, rules = RULES) {
    if (b <= a) return 0;
    let ms = 0, t = a;
    while (t < b) {
      const d = new Date(t), h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const asleep = rules.bedtime > rules.wake ? (h >= rules.bedtime || h < rules.wake) : (h >= rules.bedtime && h < rules.wake);
      const next = new Date(d); next.setMinutes(0, 0, 0); next.setHours(d.getHours() + 1);
      const end = Math.min(b, next.getTime());
      if (!asleep) ms += end - t;
      t = end;
    }
    return ms;
  }
  function isAsleep(now = Date.now(), rules = RULES) {
    const h = new Date(now).getHours();
    return rules.bedtime > rules.wake ? (h >= rules.bedtime || h < rules.wake) : (h >= rules.bedtime && h < rules.wake);
  }

  function push(s, ev) { s.log.push(ev); if (s.log.length > 50) s.log.splice(0, s.log.length - 50); return ev; }

  // catch the pet up to `now`; returns the events that happened (hatch, drains, poops, stage changes)
  function tick(s, now = Date.now(), rules = RULES) {
    const out = [];
    if (now <= s.last) return out;
    if (!s.hatched) {
      if (now - s.born >= rules.hatchAfter) { s.hatched = s.born + rules.hatchAfter; out.push(push(s, { t: s.hatched, type: 'hatch' })); s.last = Math.max(s.last, s.hatched); }
      else { s.last = now; return out; }
    }
    const ms = awakeMs(s.last, now, rules);
    s.acc.hunger += ms; s.acc.poop += ms;
    s.acc.happy += ms * (rules.poopHappyCost && s.poop > 0 ? 2 : 1);
    const drain = (k, every) => { const n = Math.floor(s.acc[k] / every); s.acc[k] -= n * every; return n; };
    const dh = drain('hunger', rules.hungerEvery), dp = drain('happy', rules.happyEvery), np = drain('poop', rules.poopEvery);
    if (dh && s.hunger > 0) { const n = Math.min(dh, s.hunger); s.hunger -= n; out.push(push(s, { t: now, type: 'hungry', n })); }
    if (dp && s.happy > 0) { const n = Math.min(dp, s.happy); s.happy -= n; out.push(push(s, { t: now, type: 'bored', n })); }
    if (np && s.poop < rules.poopMax) { const n = Math.min(np, rules.poopMax - s.poop); s.poop += n; out.push(push(s, { t: now, type: 'poop', n })); }
    s.last = now;
    return out;
  }

  function stageOf(s, now = Date.now(), rules = RULES) {
    if (!s.hatched || now < s.hatched) return { id: 'egg', form: null };
    const age = (now - s.hatched) / DAY, lv = levelOf(s.xp).level;
    let st = rules.stages[0];
    for (const x of rules.stages) if (lv >= x.level) st = x;
    // teens and adults take a form from what they trained most (power / smarts / spirit), ties go to 'balanced'
    let form = null;
    if (st.id === 'teen' || st.id === 'adult') {
      const t = s.train, top = Math.max(t.power, t.smarts, t.spirit);
      const best = ['power', 'smarts', 'spirit'].filter(k => t[k] === top);
      form = top === 0 || best.length > 1 ? 'balanced' : best[0];
    }
    return { id: st.id, form, age };
  }

  // the pet's mood for the UI to pick a face: the lowest need wins
  function mood(s, now = Date.now(), rules = RULES) {
    if (!s.hatched) return 'egg';
    if (isAsleep(now, rules)) return 'asleep';
    if (s.hunger === 0) return 'hungry';
    if (s.poop > 0) return 'yucky';
    if (s.happy === 0) return 'sad';
    if (s.hunger + s.happy >= rules.max * 2 - 1) return 'happy';
    return 'okay';
  }

  // ---- coins from the budget ----
  // dayEnds: { 'YYYY-MM-DD': { left: cents, start: cents } } written by the budget app (see HOOKS.md).
  // Pays each finished day once, from the day the pet was made. Today is never paid (it isn't over).
  function syncBudget(s, dayEnds, now = Date.now(), rules = RULES) {
    const out = [], todayD = dateOf(now), bornD = dateOf(s.born);
    for (const date of Object.keys(dayEnds || {}).sort()) {
      if (date >= todayD || date < bornD || s.credited[date] != null) continue;
      const e = dayEnds[date] || {}, start = Number(e.start) || 0, left = Math.max(0, Math.min(Number(e.left) || 0, start));
      const coins = start > 0 ? Math.round(left / start * rules.coinsPerDay) : 0;
      s.credited[date] = coins;
      if (coins > 0) { s.coins += coins; s.earnedTotal += coins; out.push(push(s, { t: now, type: 'coins', date, coins })); }
      // 1. each untouched category's food, once per category symbol per day
      const foods = [...new Set((e.untouched || []).map(k => CAT_FOOD[k]).filter(Boolean))];
      for (const f of foods) s.inv[f] = (s.inv[f] || 0) + 1;
      if (foods.length) out.push(push(s, { t: now, type: 'treats', date, foods }));
      // 2. a no-spend day: the pet wakes up from sweet dreams with a full happy bar
      if (start > 0 && Number(e.left) >= start && date > (s.lastDream || '')) {
        s.lastDream = date; s.happy = rules.max; s.acc.happy = 0;
        out.push(push(s, { t: now, type: 'dream', date }));
      }
    }
    // keep the paid list small: anything older than 60 days can't come back from the budget anyway
    const cut = dateOf(now - 60 * DAY);
    for (const d of Object.keys(s.credited)) if (d < cut) delete s.credited[d];
    return out;
  }

  // the rest of the budget feed (key budget-pet.v1, see HOOKS.md): weeks, events, projects, savings
  function syncBudgetFeed(s, feed, now = Date.now(), rules = RULES) {
    feed = feed || {};
    const out = syncBudget(s, feed.days || {}, now, rules), todayD = dateOf(now), born = s.born, bornD = dateOf(born);
    // 7. a week that ended within budget sends the pet on an outing with a souvenir
    for (const wk of Object.keys(feed.weeks || {}).sort()) {
      const end = dateOf(new Date(wk + 'T12:00:00').getTime() + 6 * DAY);
      if (end >= todayD || end < bornD || s.weeks[wk] != null) continue;
      const w = feed.weeks[wk] || {};
      if (!(Number(w.start) > 0) || !(Number(w.left) >= 0)) { s.weeks[wk] = 0; continue; }
      const place = OUTINGS[s.outings % OUTINGS.length]; s.outings++;
      const souvenir = pickNew(place.souvenirs, s.decor, wk);
      if (souvenir) s.decor.push(souvenir);
      s.weeks[wk] = place.id;
      out.push(push(s, { t: now, type: 'outing', week: wk, place: place.id, souvenir }));
    }
    // 4, 5, 6: one-off moments from the budget app, each handled once
    for (const ev of (feed.events || []).slice().sort((a, b) => a.t - b.t)) {
      if (!ev || !ev.id || !(ev.t >= born) || ev.t > now + HOUR || s.seen[ev.id]) continue;
      s.seen[ev.id] = ev.t;
      if (ev.type === 'payday') {
        const gift = pick(PARTY_GIFTS, ev.id); s.inv[gift] = (s.inv[gift] || 0) + 1; s.lastParty = ev.t;
        s.happy = clamp(s.happy + 1, 0, rules.max);
        out.push(push(s, { t: now, type: 'party', gift }));
      } else if (ev.type === 'bill') {
        s.poop = 0; s.acc.poop = 0; s.lastBath = ev.t;
        out.push(push(s, { t: now, type: 'bath', bill: ev.name || '' }));
      } else if (ev.type === 'cents') {
        const item = pickNew(TRINKETS, s.decor, ev.id);
        if (item) s.decor.push(item);
        out.push(push(s, { t: now, type: 'treasure', item }));
      }
    }
    const cut = now - 60 * DAY;
    for (const k of Object.keys(s.seen)) if (s.seen[k] < cut) delete s.seen[k];
    for (const k of Object.keys(s.weeks)) if (k < dateOf(cut)) delete s.weeks[k];
    // 3. each savings project grows an egg; reaching its goal hatches a friend (once per project, kept forever)
    if (Array.isArray(feed.projects)) {
      const live = {};
      for (const p of feed.projects) {
        if (!p || !p.id) continue;
        const id = String(p.id), pct = clamp(Number(p.pct) || 0, 0, 1);
        if (s.friends.some(f => f.id === id)) continue;
        if (pct >= 1) {
          const f = { id, name: p.name || 'Friend', kind: pick(FRIEND_KINDS, id), color: pick(FRIEND_COLORS, id + '/c'), t: now };
          s.friends.push(f); delete s.eggs[id];
          out.push(push(s, { t: now, type: 'hatch-friend', friend: f }));
        } else live[id] = { name: p.name || '', pct };
      }
      s.eggs = live;   // an unfinished project that was deleted just takes its egg with it
    }
    // 10. home grows with Savings in days of pay, never shrinks
    if (feed.savingsDays != null) {
      let lv = HOMES.findIndex(h => h.id === s.home); if (lv < 0) lv = 0;
      let to = lv; HOMES.forEach((h, i) => { if (Number(feed.savingsDays) >= h.days) to = Math.max(to, i); });
      if (to > lv) { s.home = HOMES[to].id; out.push(push(s, { t: now, type: 'home', home: s.home })); }
    }
    return out;
  }
  function nextHome(s) { const i = HOMES.findIndex(h => h.id === s.home); return HOMES[i + 1] || null; }

  // 8 and 9: read Upkeep's current to-dos and spaces (read-only)
  // 8. the pet's room is as tidy as your Upkeep spaces (all spots across all spaces); mess never costs anything
  // 9. chips going down on a to-do (a Setback) brings the pet over for a hug. Nothing is taken from the pet.
  function syncUpkeepState(s, up, now = Date.now()) {
    const out = []; if (!up) return out;
    const tasks = [...(up.tasks || []), ...(up.goals || [])];
    const spots = tasks.filter(t => t && t.kind === 'spots').flatMap(t => t.spots || []);
    const tidy = spots.length ? spots.filter(x => x.ok).length / spots.length : null;
    if (tidy != null && s.room.tidy != null && tidy > s.room.tidy) out.push(push(s, { t: now, type: 'tidy', tidy }));
    s.room.tidy = tidy;
    const snap = {};
    for (const t of tasks) {
      if (!t || t.kind === 'spots' || !t.id) continue;
      snap[t.id] = (Number(t.chips) || 0) + (t.steps || []).reduce((a, x) => a + (Number(x.chips) || 0), 0);
    }
    if (Object.keys(snap).some(id => s.chipSnap[id] != null && snap[id] < s.chipSnap[id])) {
      s.lastHug = now; out.push(push(s, { t: now, type: 'hug' }));
    }
    s.chipSnap = snap;
    return out;
  }

  // ---- training from Upkeep ----
  // upkeepLog: Upkeep's S.log, entries { t, xp, kind?, id }. Each entry counts once. A Done has no kind (a habit).
  // Upkeep's slips and Undo never take XP back from the pet.
  function syncUpkeep(s, upkeepLog, now = Date.now()) {
    const out = [];
    let gained = 0; const by = { power: 0, smarts: 0, spirit: 0 };
    for (const l of upkeepLog || []) {
      if (!l || !(l.t >= s.upkeepSince) || !(l.xp > 0)) continue;
      const k = (l.kind || 'habit') + '|' + l.id + '|' + l.t;
      if (s.upkeepSeen[k]) continue;
      s.upkeepSeen[k] = 1;
      const stat = TRAIN[l.kind || 'habit'] || 'spirit';
      s.train[stat] += l.xp; by[stat] += l.xp; gained += l.xp;
    }
    // forget entries older than 30 days (Upkeep won't add new ones in the past)
    const cut = now - 30 * DAY;
    for (const k of Object.keys(s.upkeepSeen)) if (Number(k.split('|').pop()) < cut) delete s.upkeepSeen[k];
    if (s.upkeepSince < cut) s.upkeepSince = cut;
    if (gained) {
      const lv0 = levelOf(s.xp).level; s.xp += gained;
      out.push(push(s, { t: now, type: 'train', xp: gained, by }));
      const lv1 = levelOf(s.xp).level;
      for (let l = lv0 + 1; l <= lv1; l++) {
        out.push(push(s, { t: now, type: 'level', level: l }));
        for (const u of unlocksAt(l)) out.push(push(s, u.stage ? { t: now, type: 'grow', stage: u.stage, form: u.stage === 'teen' || u.stage === 'adult' ? stageOf(s, now).form : null } : { t: now, type: 'unlock', item: u.item, level: l }));
      }
    }
    return out;
  }

  // level n needs 50 * n more XP than the last (50, 100, 150...), so early levels come fast
  function levelOf(xp) {
    let level = 1, need = 50, into = xp;
    while (into >= need) { into -= need; level++; need = 50 * level; }
    return { level, into, need };
  }

  // ---- actions ----
  // each returns { ok, reason?, events } and changes s only when ok
  function freeMealsLeft(s, now = Date.now(), rules = RULES) {
    return s.freeMeal.date === dateOf(now) ? Math.max(0, rules.freeMealsPerDay - s.freeMeal.used) : rules.freeMealsPerDay;
  }
  const unlocked = (s, x) => levelOf(s.xp).level >= (x.level || 1);
  // the shop as the UI shows it: every item with whether it's open yet, owned, and affordable
  function shopList(s) {
    return [...SHOP.map(x => ({ ...x, kind: 'food' })), ...GOODS].map(x => ({ ...x, open: unlocked(s, x), owned: !!s.owned[x.id], canBuy: unlocked(s, x) && !s.owned[x.id] && s.coins >= x.price }));
  }
  function buy(s, id, now = Date.now()) {
    const f = SHOP.find(x => x.id === id), g = GOODS.find(x => x.id === id), x = f || g;
    if (!x) return { ok: false, reason: 'unknown', events: [] };
    if (!unlocked(s, x)) return { ok: false, reason: 'locked', events: [] };
    if (g && s.owned[g.id]) return { ok: false, reason: 'owned', events: [] };
    if (s.coins < x.price) return { ok: false, reason: 'coins', events: [] };
    s.coins -= x.price;
    if (f) s.inv[f.id] = (s.inv[f.id] || 0) + 1;
    else { s.owned[g.id] = 1; if (g.kind === 'outfit') s.wear = g.id; }
    return { ok: true, events: [push(s, f ? { t: now, type: 'buy', food: f.id, price: f.price } : { t: now, type: 'buy', item: g.id, price: g.price })] };
  }
  // put on an owned outfit, or null to take it off
  function wear(s, id) {
    if (id != null && !(s.owned[id] && (GOODS.find(x => x.id === id) || {}).kind === 'outfit')) return { ok: false, reason: 'none', events: [] };
    s.wear = id; return { ok: true, events: [] };
  }
  // feed from the bag; 'free' uses today's free meal. A full pet won't eat (no waste of coins).
  function feed(s, foodId, now = Date.now(), rules = RULES) {
    if (!s.hatched) return { ok: false, reason: 'egg', events: [] };
    if (isAsleep(now, rules)) return { ok: false, reason: 'asleep', events: [] };
    const f = foodId === 'free' ? FREE_MEAL : foodById(foodId);
    if (!f) return { ok: false, reason: 'unknown', events: [] };
    if (foodId === 'free' && freeMealsLeft(s, now, rules) <= 0) return { ok: false, reason: 'free-used', events: [] };
    if (foodId !== 'free' && !(s.inv[f.id] > 0)) return { ok: false, reason: 'none', events: [] };
    if (s.hunger >= rules.max && (f.happy === 0 || s.happy >= rules.max)) return { ok: false, reason: 'full', events: [] };
    if (foodId === 'free') { if (s.freeMeal.date !== dateOf(now)) s.freeMeal = { date: dateOf(now), used: 0 }; s.freeMeal.used++; }
    else if (--s.inv[f.id] <= 0) delete s.inv[f.id];
    s.hunger = clamp(s.hunger + f.hunger, 0, rules.max); s.happy = clamp(s.happy + f.happy, 0, rules.max); s.weight += f.weight;
    s.acc.hunger = 0;                                   // a fresh meal resets the clock toward the next hungry heart
    return { ok: true, events: [push(s, { t: now, type: 'eat', food: f.id })] };
  }
  // buy and feed in one tap (what most UIs want)
  function buyAndFeed(s, foodId, now = Date.now(), rules = RULES) {
    const probe = JSON.parse(JSON.stringify(s));
    const b = buy(probe, foodId, now); if (!b.ok) return b;
    const e = feed(probe, foodId, now, rules); if (!e.ok) return e;   // check both first so a full pet never costs coins
    Object.assign(s, probe);
    return { ok: true, events: [...b.events, ...e.events] };
  }
  // play: a free mini-game result. win adds a happy heart and burns a little weight; losing still counts a bit.
  function play(s, won, now = Date.now(), rules = RULES) {
    if (!s.hatched) return { ok: false, reason: 'egg', events: [] };
    if (isAsleep(now, rules)) return { ok: false, reason: 'asleep', events: [] };
    if (won) { s.happy = clamp(s.happy + 1, 0, rules.max); s.weight = Math.max(1, s.weight - 1); }
    else if (s.owned.ball) s.happy = clamp(s.happy + 1, 0, rules.max);
    s.acc.happy = Math.max(0, s.acc.happy - rules.happyEvery / 4);
    return { ok: true, events: [push(s, { t: now, type: 'play', won: !!won })] };
  }
  function clean(s, now = Date.now()) {
    if (!s.poop) return { ok: false, reason: 'clean', events: [] };
    const n = s.poop; s.poop = 0; s.acc.poop = 0;
    return { ok: true, events: [push(s, { t: now, type: 'clean', n })] };
  }

  // ---- storage (browser) ----
  const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  const readJSON = k => { try { const st = ls(), r = st && st.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
  function load(now = Date.now()) {
    const s = readJSON(KEY);
    if (!s || s.v !== 1) return create(now);
    const base = create(s.born || now);
    return Object.assign(base, s, { room: Object.assign(base.room, s.room), owned: Object.assign(base.owned, s.owned), acc: Object.assign(base.acc, s.acc), train: Object.assign(base.train, s.train) });
  }
  function save(s) { try { const st = ls(); st && st.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  // open the Pet tab: load, catch up, pull coins and training, save. Returns { state, events }.
  function open(now = Date.now()) {
    const s = load(now);
    const up = readJSON(UPKEEP_KEY);
    const feed = readJSON(BUDGET_KEY) || { days: readJSON(BUDGET_DAYS_KEY) || {} };   // budget-day-ends.v1 still works on its own
    const events = [...tick(s, now), ...syncBudgetFeed(s, feed, now), ...syncUpkeep(s, up && up.log, now), ...syncUpkeepState(s, up, now)];
    save(s);
    return { state: s, events };
  }

  return { TREATS, CAT_FOOD, FRIEND_KINDS, FRIEND_COLORS, PARTY_GIFTS, TRINKETS, OUTINGS, HOMES, BUDGET_KEY,
    syncBudgetFeed, syncUpkeepState, nextHome, RULES, SHOP, GOODS, FREE_MEAL, unlocksAt, nextUnlock, shopList, wear, TRAIN, KEY, BUDGET_DAYS_KEY, UPKEEP_KEY,
    create, tick, stageOf, mood, isAsleep, awakeMs, syncBudget, syncUpkeep, levelOf,
    freeMealsLeft, buy, feed, buyAndFeed, play, clean, load, save, open, dateOf };
});
