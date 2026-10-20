# budget-next

The budget app (v315) rebuilt on a cleaner footing: the same app, the same math, the same screens, split out of the one
1 MB `index.html` into files you can find things in. Nothing a user sees is different, and saved data and backups load
as they are. The live app is still `budget/`; this copy goes live only when Jordan says so.

## Where things are

- `index.html` is now just the page's markup and the list of files below, in load order.
- `css/app.css` holds the styles, `css/fonts.css` the fonts, and `css/looks.css` the Looks: every Coral reef color the
  styles use is a variable there, and each other Look (Twilight, Night swim, Moss, Arcade, Burgundy) swaps in its own.
- `js/` holds the script, in folders by what each part does:
  - `core/`: small helpers (dates, number formats, `$`).
  - `data/`: the saved data, transactions, backups.
  - `money/`: the math. Paydays, bills held, the week's pace, villagers, pots and goals, debts. These files work the
    numbers out from the saved data and don't touch the screen.
  - `app/`: the actions that change the money (pay a bill, move money, collect, plan).
  - `ui/`: the screens, sheets and pop-ups.
  - `legacy/`: older screens a few paths still open (the old "This week" page and the transaction list), and support
    for older saved data (money still on a cart from the old farms). The old Pots, Bills and Scavenger pages, which
    nothing opened any more, are gone; the pieces the town's sheets borrow from them wait in `#townDock`.
- `js/sandbox.js` keeps the test copy's saved data apart from the live app's (they share one site): at
  `/budget-next/` every saved key starts with `budget-next:`, so it starts empty and you restore a backup in it.
  At any other address it does nothing.
- `sw.js` is the offline cache (`budget-next` at the test address, `budget-main` otherwise).

The scripts are plain classic scripts sharing one global scope, as before, so the load order in `index.html` matters:
each file only uses, while loading, what the files before it define.

## The 1:1 tests (`dev/`)

These run v315 (A) and this copy (B) side by side in Chromium (Playwright) with the same saved data, the same clock and
the same random numbers, and compare them. Serve a folder with `A/` (a copy of `budget/`) and `B/` (this folder) on
port 8801, or set `PARITY_URL`.

- `screens.js <data.json|demo> [outDir] [--looks]`: every screen, sheet and pop-up, and every Home card opened. Every
  element's computed style and the screenshot must match exactly. `--looks` repeats it in all nine Looks and themes.
- `sim.js <data.json|demo|setup> [days] [seed]`: lives day by day (paychecks, spends, opening the app) and compares
  every number the books work out, the saved data and the screen after each day.
- `fuzz.js <data.json|demo|setup> [steps] [seed]`: random taps, typing and waiting, the same in both, compared after
  every step.
- `battery.sh data...`: all of the above over several seeds, in parallel.
- `cov.js` / `covreport.js`: which code ever runs, to find leftovers.
- `lint.js`: `js/money/` stays screen-free.
- `port.py`: carries a change made to `budget/index.html` into these files (`git diff ... -- budget/index.html | python3 dev/port.py`).
