# My Tools

A lightweight React app (Vite) holding a directory of personal tools, deployed on Vercel. The home screen is a grid of tiles; each tile opens a tool at its own URL (`#/<tool-id>`). Locked tools need a date-of-birth login, checked on the server. Data is saved to a **private Vercel Blob store**, so it syncs across devices.

**Tools**
1. **My Car Loan Tracker** (locked, $): tick off repayments, see principal and interest paid to date, a payout estimate (early termination fee, admin fee, estimated break cost), and a "Check a date" panel for the repayment due and payout figure on any date.
2. **My Home Loan Tracker** (locked, **always Nrs.**): same tracker; figures are placeholders for now. See `src/tools/home-loan/NOTES.md`.
3. **Household Utility Tracker** (locked, $): electricity, gas, internet, mobile and anything else on an intro deal ("$45/mo for 6 months, then $75/mo"). Shows each provider, website and account number, how long is left on each deal, a banner when one has ended (and "ending soon" 14 days before), monthly totals now vs once deals end, savings so far, an "Add to calendar" (.ics) reminder, and a record of past providers. The home tile shows a badge when a deal has ended or is ending soon, read from this device's saved copy.
4. **Big Buys & Warranties** (locked, $): a record of big purchases across 16 categories (phones, computers, appliances, furniture, vehicles, solar…), with date bought, store, price, serial number, manufacturer and extended warranty, and where the warranty and receipt are kept (email, cloud drive, paper folder…, plus a link). Shows how long each item is covered, flags warranties ending in the next 60 days (banner and home tile badge), offers a calendar reminder 30 days before cover ends, and keeps items you've sold or replaced. Search, filter by category and sort.

## How it fits together

```
Browser (React)                Vercel Functions (/api)            Private Blob store
───────────────                ───────────────────────            ──────────────────
DoB screen ── POST /api/unlock ─▶ checks UNLOCK_DOB,               _system/unlock-attempts.json
                                  sets signed HttpOnly cookie
Each tool ─── GET/PUT /api/state?tool=… ─▶ checks cookie ──────▶  tools/car-loan.json
                                                                   tools/home-loan.json
                                                                   tools/utilities.json
                                                                   tools/big-buys.json
localStorage: offline cache only
```

- The DoB is only in the `UNLOCK_DOB` env var on the server. It isn't in the browser code.
- After 5 wrong tries in 15 minutes, logins are paused for 15 minutes.
- A login lasts 7 days (`SESSION_DAYS`). **Lock** in the top bar signs out.
- Every save writes the whole tool file (last write wins). Reads bypass Blob's cache, so you always get the latest save.
- If the server can't be reached, edits are kept in the browser and uploaded next time the tool opens.

## Project structure

```
my-tools/
├── .env.local                   # your secrets (git-ignored; values left blank)
├── .env.example                 # same names, committed as a template
├── api/                         # Vercel Functions
│   ├── unlock.js                # POST: DoB → session cookie (rate-limited)
│   ├── session.js               # GET: am I logged in?
│   ├── logout.js                # POST: clear cookie
│   ├── state.js                 # GET/PUT a tool's data
│   └── _lib/                    # not routes (underscore)
│       ├── auth.js              # cookie signing, DoB check, attempt limit
│       ├── store.js             # private Blob read/write
│       └── http.js
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
    │   ├── DobGate.jsx          # DoB login screen
    │   └── icons.jsx
    └── tools/
        ├── registry.js          # list of tools → tiles + routes
        ├── _shared/loan/        # shared by every loan tracker
        │   ├── LoanTracker.jsx  # UI, driven by a config
        │   ├── loan.js          # maths: schedule, totals, payout, date projection
        │   └── loan-tracker.css
        ├── car-loan/            # CarLoanTracker.jsx + config.js ($)
        ├── home-loan/           # HomeLoanTracker.jsx + config.js (Nrs.) + NOTES.md
        ├── utilities/           # UtilityTracker.jsx, deals.js (status, totals, .ics, home badge), utilities.css
        └── big-buys/            # BigBuys.jsx, purchases.js (categories, warranty status, badge), big-buys.css
```

## Environment variables

| Name | What it is | Where it comes from |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Access to the private Blob store | Vercel → Storage → your Blob store. On Vercel it's added automatically when the store is connected; you need it in `.env.local` for local dev |
| `SESSION_SECRET` | Signs the login cookie. 32+ characters | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `UNLOCK_DOB` | The DoB that unlocks the tools, `DD/MM/YYYY` | You |
| `SESSION_DAYS` | Optional. Days a login lasts (default 7) | You |

`.env.local` only feeds local development. **For the live site, add `SESSION_SECRET` and `UNLOCK_DOB` (and `SESSION_DAYS` if used) in Vercel → Project → Settings → Environment Variables**, then redeploy. Changing `SESSION_SECRET` signs everyone out.

## Setup

1. **Blob store:** Vercel → your project → Storage → Create → Blob → set access to **Private** → connect it to the project.
2. **Env vars:** add `SESSION_SECRET` and `UNLOCK_DOB` in the project settings (above).
3. **Deploy:** push to GitHub and import the repo in Vercel (Vite is detected automatically), or run `vercel --prod`.

## Run locally

The `/api` routes only run under the Vercel CLI:

```bash
npm install
npm i -g vercel
vercel link          # once: connect this folder to the Vercel project
vercel env pull      # optional: pulls the project's env vars into .env.local
vercel dev           # app + API at http://localhost:3000
```

`npm run dev` starts only the front end (no API), so the DoB screen will say the server isn't running.

## Adding a tool

1. Create `src/tools/<id>/<Name>.jsx` with a default-exported component (wrap content in `<div className="wrap">`).
2. Add it to `src/tools/registry.js` (`locked: true` to put it behind the login).
3. To save data, call `api.getState("<id>")` / `api.putState("<id>", data)` from `src/lib/api.js`, or reuse `useCloudState` from `src/lib/` (pass `shape` to validate saved data and `empty` for the starting state). Each tool gets its own file in Blob.

For another loan, copy a loan folder, change its `config.js` (new `id`!) and add it to the registry.
