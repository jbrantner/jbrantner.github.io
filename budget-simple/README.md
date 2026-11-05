# Budget (simple)

A test version of the budget app (Jordan, 2026-11-05): the same look and feel (the main app's `css/` files, copied as they
are, and the same card markup), with nothing that adds money over time. No daily trickle, no paycheck engine, no weekly
budget, no auto-filling pots, projects or debts. It only organizes money you put in by hand:

- **Free money** (top card): money you have that isn't sorted yet. Tap it to add money (a paycheck, a gift).
- **Bills**: money set aside for bills. The Bills tab lists each bill; Paid takes it out of what's set aside (and, if
  that's short, out of Free money after asking). A new month shows every bill unpaid again; what's set aside stays.
- **Pots** (money you keep) and **Projects** (money toward a goal): Put money in, Move money, Spend from it, Edit.
- **Pay advance** planner: what is borrowed now, how much to borrow back each payday (step $50-$200 less each time), the schedule and the payoff date. "Payday done" records what was borrowed back. It only tracks the plan; no money moves.
- **Restore backup** also takes a backup from the main app: `js/import-worker.js` loads the main app's own scripts from `/budget/js/` in a worker (no page, no storage: an in-memory stand-in) and works out today's balances. This week's money + Savings + spare change become Free money (one lump, no weekly budget), bills held become Bills, pots and goals become pots and projects (debts become Debt cards with what's owed, APR, minimum and a payoff date; paying a linked bill lowers what's owed), and bills paid this month stay paid.
- **Payday** (Settings, or from the main app's paycheck on import): the top card becomes "Safe to spend until <payday>" = Free money, less any bills due before payday that Bills can't cover; the Bills card lists what's due before payday.
- **Spend** takes money out of any place. **Bank check** (Settings) matches the app to your bank through Free money.

Every amount is whole cents, and no balance can go below $0: moves and spends are capped at what's there.

Its data lives under its own key (`budget-simple`, plus `bsimple-look` / `bsimple-pal` for the Look), and its offline cache
is `budget-simple`, so it never touches the main app (`budget/`) or the shared copy (`budget-share/`).
Files: `index.html`, `js/app.js` (all of the app), `js/head.js` + `js/looks.js` (the main app's, with its own keys),
`css/simple.css` (the few extra styles), `sw.js` (network first, cache for offline).
