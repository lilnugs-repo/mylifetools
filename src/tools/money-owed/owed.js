// Pure logic for Money Owed to Me: what's still owed, what's overdue, and when the
// next reminder to the borrower is due. No React or browser APIs, so the server's
// daily job (api/_lib/owed.js) and the screen use exactly the same rules.
import { parseISO, toISO } from "../_shared/loan/loan.js";

export { parseISO, toISO };

export const STORAGE_KEY = "tools:money-owed:v1";
export const SOON_DAYS = 3; // "Due soon" this many days before the return date
const DAY = 864e5;

// How often to remind the borrower once the return date has passed (0 = just once)
export const REMIND_EVERY = {
  0: "Once, the day after it's due",
  3: "Every 3 days until repaid",
  7: "Every week until repaid",
  14: "Every 2 weeks until repaid",
};

export const emptyState = { me: "", entries: [] };

export function shapeState(v) {
  if (!v || !Array.isArray(v.entries)) return null;
  return { me: typeof v.me === "string" ? v.me : "", entries: v.entries };
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysUntil = (d, today) => Math.round((d - today) / DAY);

export function newEntry(today = new Date()) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    email: "",
    amount: "",
    what: "", // what it was for
    lent: toISO(today),
    due: toISO(addDays(today, 14)),
    remind: true, // email them once the return date has passed
    remindEvery: 7,
    payments: [], // [{ date, amount }] repaid so far
    settledOn: "", // set when marked fully repaid (or forgiven)
    forgiven: false,
    notes: "",
    sent: [], // emails sent from the app: [{ at, kind: "new" | "reminder" }]
  };
}

export const amountOf = (e) => Number(e.amount) || 0;
export const repaidOf = (e) => (e.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
export const outstandingOf = (e) => (e.settledOn ? 0 : Math.max(0, Math.round((amountOf(e) - repaidOf(e)) * 100) / 100));

/**
 * Where an entry is at, on `today`:
 *   settled  repaid (or forgiven)
 *   overdue  return date has passed, money still owed
 *   soon     due within SOON_DAYS
 *   open     owed, not due yet
 */
export function status(e, today) {
  const due = parseISO(e.due);
  const days = daysUntil(due, today);
  if (e.settledOn || outstandingOf(e) <= 0) return { state: "settled", due, days };
  if (days < 0) return { state: "overdue", due, days };
  return { state: days <= SOON_DAYS ? "soon" : "open", due, days };
}

const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
export const canEmail = (e) => validEmail(e.email);

/**
 * Date the next overdue reminder should go to the borrower, or null if none will.
 * The first goes the day after the return date; then every `remindEvery` days after the
 * last one sent (`lastSent`, an ISO date), until it's repaid.
 */
export function nextReminder(e, lastSent, today) {
  if (!e.remind || !canEmail(e) || status(e, today).state === "settled") return null;
  const first = addDays(parseISO(e.due), 1);
  if (!lastSent || parseISO(lastSent.slice(0, 10)) < first) return first;
  const every = Number(e.remindEvery) || 0;
  if (!every) return null;
  return addDays(parseISO(lastSent.slice(0, 10)), every);
}

/** Last reminder date from the app's own log and the server's daily job, whichever is later. */
export function lastReminder(e, serverLog) {
  const mine = (e.sent || []).filter((s) => s.kind === "reminder").map((s) => s.at);
  const all = [...mine, serverLog?.[e.id]?.last].filter(Boolean).sort();
  return all.length ? all[all.length - 1] : null;
}

/** Entries the daily job should email today: [{ e, days }] (days overdue). */
export function remindersDue(entries, serverLog, today) {
  const out = [];
  for (const e of entries) {
    const when = nextReminder(e, lastReminder(e, serverLog), today);
    if (when && when <= today) out.push({ e, days: -status(e, today).days });
  }
  return out;
}

export function summary(entries, today) {
  let owed = 0, overdue = 0, overdueCount = 0, open = 0;
  const people = new Set();
  for (const e of entries) {
    const st = status(e, today).state;
    if (st === "settled") continue;
    open++;
    owed += outstandingOf(e);
    people.add((e.name || "").trim().toLowerCase());
    if (st === "overdue") {
      overdue += outstandingOf(e);
      overdueCount++;
    }
  }
  return { owed, overdue, overdueCount, open, people: people.size };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Badge for the home screen tile, read from this device's saved copy. */
export function homeBadge() {
  try {
    const state = shapeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (!state) return null;
    const s = summary(state.entries, startOfToday());
    if (s.overdueCount) return { tone: "warn", text: `${s.overdueCount} overdue` };
    if (s.open) return { tone: "soon", text: `$${s.owed.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} owed to you` };
  } catch {}
  return null;
}
