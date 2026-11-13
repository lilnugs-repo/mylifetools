import { lazy } from "react";
import { homeBadge } from "./utilities/deals.js";
import { homeBadge as bigBuysBadge } from "./big-buys/purchases.js";

/**
 * The tool directory. Each entry becomes a tile on the home screen and a
 * route at #/<id>. To add a tool:
 *   1. Create src/tools/<id>/<Component>.jsx (default export).
 *   2. Add an entry below. `locked: true` puts it behind the DoB login,
 *      which is checked on the server (UNLOCK_DOB env var).
 *   3. Optional `badge()` returns { text, tone } to flag something on the tile
 *      (tone: "warn" or "soon"), or null. It runs on the home screen, so keep it light.
 * Tools are lazy-loaded, so each one only downloads when it's opened.
 */
export const tools = [
  {
    id: "car-loan",
    name: "My Car Loan Tracker",
    description: "Repayments, interest paid and payout estimate",
    icon: "car",
    locked: true,
    component: lazy(() => import("./car-loan/CarLoanTracker.jsx")),
  },
  {
    id: "home-loan",
    name: "My Home Loan Tracker",
    description: "Repayments and payout in Nrs.",
    icon: "home",
    locked: true,
    component: lazy(() => import("./home-loan/HomeLoanTracker.jsx")),
  },
  {
    id: "utilities",
    name: "Household Utility Tracker",
    description: "Providers, intro deals and when they end",
    icon: "bolt",
    locked: true,
    badge: homeBadge,
    component: lazy(() => import("./utilities/UtilityTracker.jsx")),
  },
  {
    id: "big-buys",
    name: "Big Buys & Warranties",
    description: "What you bought, when, and how long it's covered",
    icon: "receipt",
    locked: true,
    badge: bigBuysBadge,
    component: lazy(() => import("./big-buys/BigBuys.jsx")),
  },
];

export const findTool = (id) => tools.find((t) => t.id === id);
