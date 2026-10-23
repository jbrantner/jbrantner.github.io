# The budget app

Since v317 (2026-10-20) the app is split out of the one 1 MB `index.html` into files you can find things in, with the
same math and the same screens as v316, tested 1:1 against it (built and tested at `budget-next/` first). Saved data
and backups load as they are. The one difference a user sees: the Pet tab is gone (Jordan, 2026-10-20: not the direction
the app is going); Upkeep's level on top is its own hearth again, as in the shared copy. `budget-share/` is the same app
for Jordan's sister (built from this folder by `/mnt/project-files/budget-app/share-v317/build.sh`).

The old files here that the app no longer loads (`pet.html`, `pet-engine.js`, `pet-sprites.js`, `friends/`, `art.png`,
`town-art*.png`) stay on the site: an older copy's Update fetches its own file list, and a missing file would stop it.

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
- `js/sandbox.js` keeps a test copy's saved data apart from the live app's (they share one site): at
  `/budget-next/` every saved key starts with `budget-next:`. At any other address, this one included, it does nothing.
- `sw.js` is the offline cache (`budget-next` at the test address, `budget-main` otherwise).

The scripts are plain classic scripts sharing one global scope, as before, so the load order in `index.html` matters:
each file only uses, while loading, what the files before it define.

## The 1:1 tests (`dev/`)

These run a reference build (A) and this copy (B) side by side in Chromium (Playwright) with the same saved data, the same clock and
the same random numbers, and compare them. Serve a folder with `A/` (the reference, e.g. the last release) and `B/` (this folder) on
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
- `globals.js`: every name the scripts use is defined somewhere. The scripts share one global scope, so a helper
  defined inside one file's function can't be called from another file; this catches that before a phone does.

`CHANGELOG.md` has what each cleanup or release changed, from 2026-10-23 on (earlier ones: the git log).
