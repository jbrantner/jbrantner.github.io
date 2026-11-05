# Budget (simple)

A test version of the budget app (Jordan, 2026-11-05): the same look and feel (the main app's `css/` files, copied as they
are, and the same card markup), with nothing that adds money over time. No daily trickle, no paycheck engine, no weekly
budget, no auto-filling pots, projects or debts. It only organizes money you put in by hand:

- **Free money** (top card): money you have that isn't sorted yet. Tap it to add money (a paycheck, a gift).
- **Bills**: money set aside for bills. The Bills tab lists each bill; Paid takes it out of what's set aside (and, if
  that's short, out of Free money after asking). A new month shows every bill unpaid again; what's set aside stays.
- **Pots** (money you keep) and **Projects** (money toward a goal): Put money in, Move money, Spend from it, Edit.
- **Spend** takes money out of any place. **Bank check** (Settings) matches the app to your bank through Free money.

Every amount is whole cents, and no balance can go below $0: moves and spends are capped at what's there.

Its data lives under its own key (`budget-simple`, plus `bsimple-look` / `bsimple-pal` for the Look), and its offline cache
is `budget-simple`, so it never touches the main app (`budget/`) or the shared copy (`budget-share/`).
Files: `index.html`, `js/app.js` (all of the app), `js/head.js` + `js/looks.js` (the main app's, with its own keys),
`css/simple.css` (the few extra styles), `sw.js` (network first, cache for offline).
