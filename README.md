# My Life Tools

A lightweight React app (Vite) holding a directory of personal tools, deployed on Vercel. The home screen is a grid of tiles; each tile opens a tool at its own URL (`#/<tool-id>`). Locked tools need a PIN login, checked on the server. Data is saved to a **private Vercel Blob store**, so it syncs across devices.

**Tools**
0. **All My Fixed Expenses** (locked, $, shown in its own section at the top of the home screen): one total for everything you pay regularly, shown fortnightly, monthly, quarterly or yearly. Each tool with regular costs (both loans, Household Utilities, My Subscriptions) has a **Send to Fixed Expenses** switch; while it's on, that tool's costs are pulled in automatically and marked as linked. My Home Loan's rupees are converted at an editable rate (default $1 = Nrs. 105). You can also add your own expenses (weekly to yearly). The home tile shows the total.
1. **My Car Loan** (locked, $): tick off repayments, see principal and interest paid to date, a payout estimate (early termination fee, admin fee, estimated break cost), and a "Check a date" panel for the repayment due and payout figure on any date.
2. **My Home Loan** (locked, **always Nrs.**): the same loan screen, set up from the bank statement. Variable rate with a fixed EMI (a rate change moves the end date), daily interest, the current rate and expected pay-off date, and a "Pay-off goal" panel. See `src/tools/home-loan/NOTES.md`.
3. **Household Utilities** (locked, $): **Mark as cancelled** keeps a service on record at the end of the list without counting it in totals, alerts or reminders (Undo to bring it back). Covers electricity, gas, internet, mobile and anything else on an intro deal ("$45/mo for 6 months, then $75/mo"). Shows each provider, website and account number, how long is left on each deal, a banner when one has ended (and "ending soon" 14 days before), monthly totals now vs once deals end, savings so far, an "Add to calendar" (.ics) reminder, and a record of past providers. The home tile shows a badge when a deal has ended or is ending soon, read from this device's saved copy.
4. **Big Buys & Warranties** (locked, $): a record of big purchases across 16 categories (phones, computers, appliances, furniture, vehicles, solar…), with date bought, store, price, serial number, manufacturer and extended warranty, and where the warranty and receipt are kept (email, cloud drive, paper folder…, plus a link). Shows how long each item is covered, flags warranties ending in the next 60 days (banner and home tile badge), offers a calendar reminder 30 days before cover ends, and keeps items you've sold or replaced. Search, filter by category and sort.
5. **My Subscriptions** (locked, $): one place for everything you pay for on repeat (streaming, music, apps, cloud storage, gym…). Each has a price and billing cycle (weekly to yearly), the next payment date (rolled forward automatically), free trials, what it's paid with, the account, a manage/cancel link and "still worth it?". Shows the total per month and per year, payments in the next 30 days, spend by category, what cancelling the ones you're unsure about would save, a banner for trials ending within 7 days and big (3-monthly or longer) renewals within 14 days (also a home tile badge), calendar reminders, and pause / cancel with a record of cancelled ones.
7. **Rent & Payday** (locked, $): countdowns to the next payday, your next rent payment and your co-tenant's next rent ("Payday in 4 days", "Rent in 2 days", "JD pays tomorrow"), also shown in a strip at the top of the home screen. Each schedule repeats weekly, fortnightly or monthly from a date you set (started from the Google Calendar: rent 
6. **Email Reminders**,160 every 2nd Monday from 2 Nov 2026, Sonder payday every 2nd Wednesday from 4 Nov, JD $300 every Sunday from 1 Nov). Tick off each rent payment, yours and the co-tenant's, with what's been received, what's owing, and a note when rent comes out before payday.
6. **Email Reminders** (locked, opened from the **Notifications** button in the top bar): one email when something's close, nothing otherwise. Loan repayments not yet ticked off (default 3 days before, repeated every morning until ticked off, with past-due ones as one "not ticked off" line per loan), subscription free trials ending (3 days), utility intro deals ending (7 days, repeated every morning until the service is marked cancelled or updated; can be switched to once), and optionally big subscription renewals and warranties ending. Each kind has its own switch and notice period. Every reminder includes its money details: loan reminders show the repayment breakdown plus what's been paid so far and what's left (balance, repayments, interest and total still to pay); utilities show intro vs standard price and the extra per month and year; subscriptions show the price per month and year. Shows what's coming up and whether it's been emailed, and has a **Send a test email** button. A Vercel Cron job checks once a day (see [Email reminders](#email-reminders)).

## How it fits together

```
Browser (React)                Vercel Functions (/api)            Private Blob store
───────────────                ───────────────────────            ──────────────────
PIN screen ── POST /api/unlock ─▶ checks PIN_KEY,                  _system/unlock-attempts.json
                                  sets signed HttpOnly cookie
Each tool ─── GET/PUT /api/state?tool=… ─▶ checks cookie ──────▶  tools/car-loan.json
                                                                   tools/home-loan.json
                                                                   tools/utilities.json
                                                                   tools/big-buys.json
                                                                   tools/subscriptions.json
                                                                   tools/fixed-expenses.json
                                                                   tools/rent-payday.json
                                                                   tools/reminders.json
Vercel Cron (daily) ─ GET /api/notify ─▶ checks CRON_SECRET,
                                  reads the tools above ────────▶  _system/reminders-sent.json
                                  emails what's due via Resend
localStorage: offline cache only
```

- The PIN is only in the `PIN_KEY` env var on the server. It isn't in the browser code.
- After 5 wrong tries in 15 minutes, logins are paused for 15 minutes, and no more than 15 wrong tries are allowed in 24 hours (a 4-digit PIN has only 10,000 combinations).
- A login lasts 7 days (`SESSION_DAYS`). **Lock** in the top bar signs out.
- Every save writes the whole tool file (last write wins). Reads bypass Blob's cache, so you always get the latest save.
- If the server can't be reached, edits are kept in the browser and uploaded next time the tool opens.

## Project structure

```
my-tools/                        # folder and Blob prefix keep the original name
├── .env.local                   # your secrets (git-ignored; values left blank)
├── .env.example                 # same names, committed as a template
├── api/                         # Vercel Functions
│   ├── unlock.js                # POST: PIN → session cookie (rate-limited)
│   ├── session.js               # GET: am I logged in?
│   ├── logout.js                # POST: clear cookie
│   ├── state.js                 # GET/PUT a tool's data
│   ├── notify.js                # email reminders: daily cron run, preview, test email
│   └── _lib/                    # not routes (underscore)
│       ├── auth.js              # cookie signing, PIN check, attempt limits
│       ├── store.js             # private Blob read/write
│       ├── reminders.js         # daily run, sent-once log, email body, Resend
│       └── http.js
├── vercel.json                  # cron schedule for /api/notify
├── index.html
├── package.json
├── vite.config.js
├── public/favicon.svg
└── src/
    ├── main.jsx
    ├── App.jsx                  # shell: top bar, routing, session, gate
    ├── styles/base.css          # shared tokens + shell, tiles, gate
    ├── lib/
    │   ├── api.js               # client for /api
    │   ├── useCloudState.js     # sync a tool's state to /api/state + offline cache
    │   ├── files.js             # safe links, calendar (.ics) reminders, downloads
    │   ├── theme.js             # light/dark toggle
    │   └── useHashRoute.js      # tiny hash router
    ├── components/
    │   ├── Home.jsx             # tile directory
    │   ├── PinGate.jsx          # PIN login screen
    │   └── icons.jsx
    └── tools/
        ├── registry.js          # list of tools → tiles + routes
        ├── _shared/loan/        # shared by both loans
        │   ├── LoanTracker.jsx  # UI, driven by a config
        │   ├── loan.js          # maths: schedule, totals, payout, date projection
        │   └── loan-tracker.css
        ├── car-loan/            # CarLoanTracker.jsx + config.js ($)
        ├── home-loan/           # HomeLoanTracker.jsx + config.js (Nrs.) + NOTES.md
        ├── utilities/           # UtilityTracker.jsx, deals.js (status, totals, .ics, home badge), utilities.css
        ├── big-buys/            # BigBuys.jsx, purchases.js (categories, warranty status, badge), big-buys.css
        ├── subscriptions/       # Subscriptions.jsx, subs.js (billing cycles, next payment, totals, badge), subscriptions.css
        ├── fixed-expenses/      # FixedExpenses.jsx, fixed.js (sources, currency, periods, home total), fixed-expenses.css
        ├── rent-payday/         # RentPayday.jsx, schedule.js (repeating dates, countdowns, home strip), rent-payday.css
        └── reminders/           # Reminders.jsx (settings screen), rules.js (what's due; shared with the server)
```

## Environment variables

| Name | What it is | Where it comes from |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Access to the private Blob store | Vercel → Storage → your Blob store. On Vercel it's added automatically when the store is connected; you need it in `.env.local` for local dev |
| `SESSION_SECRET` | Signs the login cookie. 32+ characters | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PIN_KEY` | The 4-digit PIN that unlocks the tools | You |
| `SESSION_DAYS` | Optional. Days a login lasts (default 7) | You |
| `RESEND_API_KEY` | Sends reminder emails | [resend.com](https://resend.com) → API Keys |
| `NOTIFY_EMAIL` | Where reminders go (comma-separate for more than one) | You. Without your own domain in Resend, use the address your Resend account is under |
| `CRON_SECRET` | Lets only Vercel's scheduler trigger the daily check | Any long random text, e.g. the same command as `SESSION_SECRET` |
| `NOTIFY_FROM` | Optional. Sender, default `My Life Tools <onboarding@resend.dev>` | Your verified Resend domain, e.g. `My Life Tools <reminders@yourdomain.com>` |
| `NOTIFY_TZ` | Optional. Whose "today" counts, default `Australia/Sydney` | You |
| `APP_URL` | Optional. Link used in emails, default the site's own address | You |

`.env.local` only feeds local development. **For the live site, add `SESSION_SECRET` and `PIN_KEY` (and `SESSION_DAYS` if used) in Vercel → Project → Settings → Environment Variables**, then redeploy. Changing `SESSION_SECRET` signs everyone out.

## Setup

1. **Blob store:** Vercel → your project → Storage → Create → Blob → set access to **Private** → connect it to the project.
2. **Env vars:** add `SESSION_SECRET` and `PIN_KEY` in the project settings (above).
3. **Deploy:** push to GitHub and import the repo in Vercel (Vite is detected automatically), or run `vercel --prod`.

## Email reminders

1. Sign up at [resend.com](https://resend.com) (free tier is plenty) and create an API key.
2. In Vercel → Project → Settings → Environment Variables add `RESEND_API_KEY`, `NOTIFY_EMAIL` and `CRON_SECRET` (table above), then redeploy.
3. Open **Email Reminders** in the app and tap **Send a test email**.

The daily check is set in `vercel.json` for 21:00 UTC (8am in Sydney in summer, 7am in winter). On the Hobby plan Vercel runs it once a day, sometime within that hour. Each reminder is sent once (logged in `_system/reminders-sent.json`); a day with nothing new due sends nothing. The rules for what's "due" live in `src/tools/reminders/rules.js` and are the same ones the settings screen previews.

## Run locally

The `/api` routes only run under the Vercel CLI:

```bash
npm install
npm i -g vercel
vercel link          # once: connect this folder to the Vercel project
vercel env pull      # optional: pulls the project's env vars into .env.local
vercel dev           # app + API at http://localhost:3000
```

`npm run dev` starts only the front end (no API), so the PIN screen will say the server isn't running.

## Adding a tool

1. Create `src/tools/<id>/<Name>.jsx` with a default-exported component (wrap content in `<div className="wrap">`).
2. Add it to `src/tools/registry.js` (`locked: true` to put it behind the login).
3. To save data, call `api.getState("<id>")` / `api.putState("<id>", data)` from `src/lib/api.js`, or reuse `useCloudState` from `src/lib/` (pass `shape` to validate saved data and `empty` for the starting state). Each tool gets its own file in Blob.

To feed a tool into All My Fixed Expenses: keep a `sendToFixed` flag in its saved data, show `<FixedToggle>` (src/components/FixedToggle.jsx), export a `fixedItems(state, today)` returning `{ key, name, detail, monthly, currency }`, and add it to `SOURCES` in `src/tools/fixed-expenses/fixed.js`.

For another loan, copy a loan folder, change its `config.js` (new `id`!) and add it to the registry.
