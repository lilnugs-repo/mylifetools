# My Tools

A lightweight React app (Vite) that holds a directory of personal tools. The home screen is a grid of tiles; each tile opens a tool at its own URL (`#/<tool-id>`). Tools can be locked behind a date-of-birth check.

**Tool 1: My Car Loan Tracker** (locked) — tick off repayments, see principal and interest paid to date, and get a payout estimate with the early termination fee, admin fee and an estimated break cost.

## Project structure

```
my-tools/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx                 # entry point
    ├── App.jsx                  # shell: top bar, routing, lock gate
    ├── styles/
    │   └── base.css             # shared tokens (colours, fonts) + shell, tiles, gate
    ├── lib/
    │   ├── useHashRoute.js      # tiny hash router (#/tool-id)
    │   └── lock.js              # DoB check, session unlock, attempt limit
    ├── components/
    │   ├── Home.jsx             # tile directory
    │   ├── DobGate.jsx          # DoB entry screen
    │   └── icons.jsx            # inline SVG icons
    └── tools/
        ├── registry.js          # list of tools → tiles + routes
        └── car-loan/
            ├── CarLoanTracker.jsx
            ├── loan.js          # loan maths (schedule, totals, payout, break cost)
            └── car-loan.css
```

## Adding a tool

1. Create `src/tools/<id>/<Name>.jsx` with a default-exported component (wrap its content in `<div className="wrap">` to match the layout).
2. Add an entry to `src/tools/registry.js`:
   ```js
   { id: "budget", name: "Budget", description: "Monthly spend", icon: "plus",
     component: lazy(() => import("./budget/Budget.jsx")) }
   ```
   Add `lockHash: DOB_HASH` to lock it with the same DoB.
3. Add an icon to `src/components/icons.jsx` if you want a custom one.

Each tool is loaded only when opened, so the home screen stays small.

## The DoB lock

- The date isn't in the code, only a salted SHA-256 hash of it (`registry.js`).
- Accepts DD/MM/YYYY (slashes are inserted as you type).
- An unlock lasts for the browser tab session; **Lock** in the top bar re-locks.
- After 5 wrong tries the gate pauses for 60 seconds.

To change the date, generate a new hash and replace `DOB_HASH`:
```bash
node -e "console.log(require('crypto').createHash('sha256').update('sach-tools:v1:DDMMYYYY').digest('hex'))"
```

**This is a privacy screen, not real security.** A date of birth has only ~36,000 possible values over 100 years, so anyone who downloads the JS could find it by trying them all. Your loan data is only ever stored in your own browser, so nothing is exposed to other visitors, but if you want the whole site private, turn on **Vercel → Project → Settings → Deployment Protection → Password Protection**, or put real auth in front of it.

## Data

Each tool saves to your browser's localStorage (car loan key: `tools:car-loan:v1`). Use **Loan details → Export backup / Import** to move data between devices.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

**GitHub:** push this folder to a repo, then in Vercel choose **Add New → Project** and import it. Vercel detects Vite automatically (build `npm run build`, output `dist`). Hash routing means no rewrite config is needed.

**CLI:**
```bash
npm i -g vercel
vercel --prod
```
