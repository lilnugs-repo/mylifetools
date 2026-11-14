import { lazy } from "react";
import { homeBadge } from "./utilities/deals.js";
import { homeBadge as bigBuysBadge } from "./big-buys/purchases.js";
import { homeBadge as subsBadge } from "./subscriptions/subs.js";
import { homeHeadline as fixedHeadline } from "./fixed-expenses/fixed.js";

/**
 * The tool directory. Each entry becomes a tile on the home screen and a
 * route at #/<id>. To add a tool:
 *   1. Create src/tools/<id>/<Component>.jsx (default export).
 *   2. Add an entry below. `locked: true` puts it behind the PIN login,
 *      which is checked on the server (PIN_KEY env var).
 *   3. Optional `badge()` returns { text, tone } to flag something on the tile
 *      (tone: "warn" or "soon"), or null. It runs on the home screen, so keep it light.
 *   4. Optional `featured: true` shows it in its own section above the others, with
 *      `headline()` returning { value, per } (e.g. "$4,210.00", "a month") or null.
 *   5. Optional `hidden: true` keeps it off the home screen (reached some other way).
 * Tools are lazy-loaded, so each one only downloads when it's opened.
 */
export const tools = [
  {
    id: "fixed-expenses",
    name: "All My Fixed Expenses",
    description: "Every regular cost from your other tools, plus your own, in one total",
    icon: "wallet",
    locked: true,
    featured: true,
    headline: fixedHeadline,
    component: lazy(() => import("./fixed-expenses/FixedExpenses.jsx")),
  },
  {
    id: "car-loan",
    name: "My Car Loan",
    description: "Repayments, interest paid and payout estimate",
    icon: "car",
    locked: true,
    component: lazy(() => import("./car-loan/CarLoanTracker.jsx")),
  },
  {
    id: "home-loan",
    name: "My Home Loan",
    description: "Repayments and payout in Nrs.",
    icon: "home",
    locked: true,
    component: lazy(() => import("./home-loan/HomeLoanTracker.jsx")),
  },
  {
    id: "utilities",
    name: "Household Utilities",
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
  {
    id: "subscriptions",
    name: "My Subscriptions",
    description: "What you're subscribed to, what it costs and when it renews",
    icon: "repeat",
    locked: true,
    badge: subsBadge,
    component: lazy(() => import("./subscriptions/Subscriptions.jsx")),
  },
  {
    id: "reminders",
    name: "Email Reminders",
    description: "An email when a repayment, trial or deal is close",
    icon: "bell",
    locked: true,
    hidden: true, // opened from the Notifications button in the top bar
    component: lazy(() => import("./reminders/Reminders.jsx")),
  },
];

export const findTool = (id) => tools.find((t) => t.id === id);
