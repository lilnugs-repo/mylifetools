// Bring every tool's saved copy on this device up to date with the server, so the
// home screen (Fixed Expenses total, badges, countdowns) is current without opening
// each tool. Needs a login: /api/state refuses without one, which keeps data private.
import { api } from "./api.js";
import carLoan from "../tools/car-loan/config.js";
import homeLoan from "../tools/home-loan/config.js";
import { STORAGE_KEY as UTILITIES } from "../tools/utilities/deals.js";
import { STORAGE_KEY as SUBSCRIPTIONS } from "../tools/subscriptions/subs.js";
import { STORAGE_KEY as BIG_BUYS } from "../tools/big-buys/purchases.js";
import { STORAGE_KEY as RENT_PAYDAY } from "../tools/rent-payday/schedule.js";
import { STORAGE_KEY as FIXED } from "../tools/fixed-expenses/fixed.js";

// Tool id (its file on the server) → its copy in this browser (same keys useCloudState uses)
const TOOLS = [
  ["car-loan", carLoan.storageKey],
  ["home-loan", homeLoan.storageKey],
  ["utilities", UTILITIES],
  ["subscriptions", SUBSCRIPTIONS],
  ["big-buys", BIG_BUYS],
  ["rent-payday", RENT_PAYDAY],
  ["fixed-expenses", FIXED],
  ["reminders", "tools:reminders:v1"],
];

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLocal(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, pendingSync: false }));
  } catch {}
}

/**
 * Sync every tool in parallel. Edits made on this device that never reached the
 * server (pendingSync) are uploaded first, as when the tool itself opens; otherwise
 * the server copy replaces the local one. Resolves to "ok", "locked" or "offline".
 */
export async function syncAll() {
  const results = await Promise.allSettled(
    TOOLS.map(async ([id, key]) => {
      const local = readLocal(key);
      if (local?.pendingSync) {
        const { pendingSync, ...data } = local; // eslint-disable-line no-unused-vars
        await api.putState(id, data);
        writeLocal(key, data);
        return;
      }
      const r = await api.getState(id);
      if (r.data) writeLocal(key, r.data);
    })
  );
  const err = results.find((r) => r.status === "rejected")?.reason;
  return !err ? "ok" : err.code === "unauthorised" ? "locked" : "offline";
}
