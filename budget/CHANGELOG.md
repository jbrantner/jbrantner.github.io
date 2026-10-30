# Changelog

The release-by-release history before this file is in the git log. This file starts with the 2026-10-23 cleanup pass.

## 2026-10-30: Cushion under the week, pip week card for Anything alone (v323)

- The Cushion card sits under the This week card (Jordan). It shows on every Home, also before a week has money.
- The weekly card uses the pip look (Left today, the day bars) when all spending is Anything, with no categories, and
  when the week is loaded by hand and nothing is in it yet. It used to fall back to the old week look.
- Loading the week by hand sits behind a small + next to This week (Jordan: it doesn't have to be up there all the
  time); it closes again after a load.

## 2026-10-30: Savings is what's really in the bank (v322)

Jordan's Month cushion showed −$592 on payday because the app counted the whole $1,518.72 paycheck as in the bank
when $800 of it (an advance) hadn't landed, and because Savings left out the part of the paycheck still being handed
out a day at a time. Now:
- **Savings (and the Month cushion) gets a paycheck whole the moment it lands** (less the bills' share). Its money a
  day moves out of Savings into weekly spending, pots, projects and debts as it goes, so Savings is always bank −
  bills held − pots and projects − this week's money not spent yet.
- **The weekly money through the next payday comes out of Savings on payday** (Jordan: "so I know exactly how much
  I actually have to spend"), so Savings is what's free. Home now opens with one card, the **Cushion** (Jordan: a pay period that can't make its
  bills takes it from the cushion, that's what it's for). It is **yours until payday** (paycheck to paycheck:
  bank − bills due before the next payday − spending money − pots; if bills after it need some of that, "Keep $X of it
  for bills after (payday)" instead of a negative number; plus any pay not landed yet and It's here). The **Month cushion** moved into that card: "Cushion $X of
  $(a month of bills)" with a bar, never below $0; tap it for the cushion sheet. The separate cushion card is gone, then the weekly card with **This week**'s lump sum on top of the day-by-day
  numbers.
  Under the cushion: "Spending money through (payday) is already taken out" and "$Y more goes to pots and projects
  by (payday), a day at a time".
- **Weekly money loaded by hand** (Jordan 16:49, optional): "Load it by hand each week instead" on the This week card.
  Then nothing is set aside from pay and no week starts on its own; type an amount and Load from cushion moves it into
  this week (like postage). What's left on Sunday goes back to Savings as ever. "Set aside automatically instead"
  switches back from the next Monday.
- **Pay that hasn't landed:** the paycheck sheet has "Still coming" for an advance or second deposit. It isn't counted
  in the bank until you tap It's here on the cushion card.
- **The bank check asks about pay too:** a paycheck from the last 3 days shows with It's here / Not yet, next to the
  bills.

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
