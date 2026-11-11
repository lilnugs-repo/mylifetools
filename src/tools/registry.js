import { lazy } from "react";

/**
 * The tool directory. Each entry becomes a tile on the home screen and a
 * route at #/<id>. To add a tool:
 *   1. Create src/tools/<id>/<Component>.jsx (default export).
 *   2. Add an entry below. `locked: true` puts it behind the DoB login,
 *      which is checked on the server (UNLOCK_DOB env var).
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
];

export const findTool = (id) => tools.find((t) => t.id === id);
