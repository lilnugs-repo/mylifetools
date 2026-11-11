import { lazy } from "react";

/**
 * The tool directory. Each entry becomes a tile on the home screen and a
 * route at #/<id>. To add a tool:
 *   1. Create src/tools/<id>/<Component>.jsx (default export).
 *   2. Add an entry below. Set `lockHash` to protect it with the DoB gate,
 *      or leave it out for an open tool.
 * Tools are lazy-loaded, so each one only downloads when it's opened.
 */

// SHA-256 of `${LOCK_SALT}${DDMMYYYY}`. Generate a new one with:
//   node -e "console.log(require('crypto').createHash('sha256').update('sach-tools:v1:DDMMYYYY').digest('hex'))"
export const LOCK_SALT = "sach-tools:v1:";
const DOB_HASH = "49161a1422c83d73b18da563c75e75098eb73d173d1d1ca4dc15965eb1b27bc5";

export const tools = [
  {
    id: "car-loan",
    name: "My Car Loan Tracker",
    description: "Repayments, interest paid and payout estimate",
    icon: "car",
    lockHash: DOB_HASH,
    component: lazy(() => import("./car-loan/CarLoanTracker.jsx")),
  },
];

export const findTool = (id) => tools.find((t) => t.id === id);
