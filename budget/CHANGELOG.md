# Changelog

The release-by-release history before this file is in the git log. This file starts with the 2026-10-23 cleanup pass.

## 2026-10-27: weekly spending line names the categories (v320)

Settings > Money said "$20.00 a day" under a $140 week, but Home showed about $15 a day, because the weekly Gas
category ($30) comes out first. The line under the weekly amount now says what each category takes and what's really
left a day for Anything: "Gas $30 · Anything $15.71 a day · a change counts from today". With no categories it reads
as before.

## 2026-10-23: cleanup pass (v319)

Same app, same math and screens. Checked side by side against v318 with the `dev/` kit.

**Fixed**
- Home could stop drawing when a project with a goal set in months of bills (say "3 months of bills") reached it. The
  "reached its goal: 3 months of bills set aside" line called `plural()`, which only existed inside Home's own code, so
  it threw, the screen stopped updating, and the line's "Nice" button (the only way to clear it) never showed. `plural`
  now lives in `js/core/format.js` with the other text helpers.

**Tidied (nothing a user sees)**
- Removed code that could never run: two `if (false)` blocks on Home (the old "Your money a day" panel and the old
  "Next paycheck" tip), the island and scene view toggles after their `return`, and the pager name flash.
- Removed the groups-of-five tally that only fed that old panel, so Home does a little less work on each draw.
- Removed about 20 variables that were worked out and never used, a repeated line in `tidy()`, and the unused
  `mover` flag.

**Added**
- `dev/globals.js`: checks that every name the scripts use is defined somewhere (the check that would have caught
  the `plural` bug). Run `node dev/globals.js` before a release, with `node dev/lint.js`.
