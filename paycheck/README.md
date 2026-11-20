# Paycheck

A budget that runs on one number you type: your bank balance.

From the balance, your bills, your paydays (with a pay advance stepping down) and the cushion you keep, it shows
**what you can spend until payday**, with every bill covered for the next four paydays. When money is tight it spreads
what there is evenly, so this pay period and the next ones get the same amount.

- **Bank** button: type your balance. It asks whether a paycheck or any bill due by today has come out, ticks them off, and moves the payday on.
- **Home**: the spend number and per-day amount, bills before payday, the next pay period's bills, and goals (cushion and things you're paying back, which shrink as their linked bills come out).
- **Bills**: monthly bills (with optional first and last month) and one-time bills.
- **Settings**: paycheck, pay advance, cushion, look, backup, and "Bring in from the simple app".

No purchase logging and no pots. Data stays on the phone (localStorage key `paycheck`). Styles are shared with `budget-simple/`.
