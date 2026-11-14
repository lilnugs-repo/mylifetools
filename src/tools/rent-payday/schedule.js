// Pure logic for Rent & Payday: repeating dates (weekly, fortnightly, monthly),
// countdowns, and who has paid what. No React here, so the home screen can use it.
// Starting figures come from the user's Google Calendar (Nov 2026):
//   "PAY RENT $1,160.00" every 2nd Monday from 2 Nov; "Pay Sonder for last two weeks"
//   every 2nd Wednesday from 4 Nov; "JD Rent - $300" every Sunday from 1 Nov.
import { addMonths, parseISO, toISO } from "../_shared/loan/loan.js";

export { parseISO, toISO };

export const STORAGE_KEY = "tools:rent-payday:v1";
const DAY = 864e5;

export const EVERY = {
  week: { label: "Every week", days: 7 },
  fortnight: { label: "Every 2 weeks", days: 14 },
  month: { label: "Every month", months: 1 },
};

export const defaults = () => ({
  payday: { label: "Sonder", from: "2026-11-04", every: "fortnight", amount: "" },
  rent: { from: "2026-11-02", every: "fortnight", amount: 1160, paid: {} },
  cotenant: { name: "JD", from: "2026-11-01", every: "week", amount: 300, paid: {} },
});

export const emptyState = defaults();

/** Saved data → state (filling in anything missing), or null if it isn't ours. */
export function shapeState(v) {
  if (!v || !v.payday || !v.rent || !v.cotenant) return null;
  const d = defaults();
  return {
    payday: { ...d.payday, ...v.payday },
    rent: { ...d.rent, ...v.rent, paid: v.rent.paid || {} },
    cotenant: { ...d.cotenant, ...v.cotenant, paid: v.cotenant.paid || {} },
  };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** The n-th date of a repeating schedule (n = 0 is the first). */
export function nth(from, every, n) {
  const start = parseISO(from);
  if (every === "month") return addMonths(start, n);
  const step = (EVERY[every] ?? EVERY.week).days;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + step * n);
}

/** Index of the first date on or after `day` (0 if `day` is before the start). */
function indexOnOrAfter(from, every, day) {
  const start = parseISO(from);
  if (day <= start) return 0;
  const approx = every === "month" ? 30.44 : (EVERY[every] ?? EVERY.week).days;
  let n = Math.max(0, Math.floor((day - start) / DAY / approx) - 1);
  while (nth(from, every, n) < day) n++;
  return n;
}

/** Next date on or after `today`. */
export const next = (sched, today) => nth(sched.from, sched.every, indexOnOrAfter(sched.from, sched.every, today));

/** Dates from the schedule's start up to `ahead` dates after today, newest first. */
export function dates(sched, today, ahead = 3) {
  const last = indexOnOrAfter(sched.from, sched.every, today) + ahead - 1;
  const out = [];
  for (let n = 0; n <= last && n < 600; n++) out.push(nth(sched.from, sched.every, n));
  return out.reverse();
}

export const daysUntil = (d, today) => Math.round((d - today) / DAY);

/** "today", "tomorrow", "in 3 days" */
export const inDays = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** Payments due up to today that aren't ticked off: [{ date, amount }]. */
export function unpaid(sched, today) {
  return dates(sched, today, 0)
    .filter((d) => d <= today && !sched.paid?.[toISO(d)])
    .map((d) => ({ date: d, amount: Number(sched.amount) || 0 }));
}

/** Total ticked off as received/paid. */
export const totalPaid = (sched) => Object.values(sched.paid || {}).reduce((a, p) => a + (Number(p.amount) || 0), 0);

/** The three countdowns, used by the tool and the home screen. */
export function countdowns(state, today) {
  const pay = next(state.payday, today);
  const rent = next(state.rent, today);
  const co = next(state.cotenant, today);
  return [
    { key: "payday", label: "Next payday", short: "Payday", date: pay, days: daysUntil(pay, today) },
    { key: "rent", label: "Rent due", short: "Rent", date: rent, days: daysUntil(rent, today) },
    { key: "cotenant", label: `${state.cotenant.name || "Co-tenant"}'s rent due`, short: `${state.cotenant.name || "Co-tenant"} pays`, date: co, days: daysUntil(co, today) },
  ];
}

/** Countdowns for the home screen, from this device's saved copy (or the starting dates). */
export function homeCountdowns() {
  let state = null;
  try {
    state = shapeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {}
  const today = startOfToday();
  const st = state ?? defaults();
  const owing = unpaid(st.cotenant, today).length;
  return countdowns(st, today).map((c) => ({
    ...c,
    text: `${c.short} ${inDays(c.days)}`,
    warn: c.key === "cotenant" && owing > 0 ? `${st.cotenant.name || "Co-tenant"} owes ${owing} payment${owing > 1 ? "s" : ""}` : null,
  }));
}
