// Logic for All My Fixed Expenses: which tools feed it, currency conversion, and
// turning everything into one period (fortnight, month, quarter, year). No React here.
import carLoan from "../car-loan/config.js";
import homeLoan from "../home-loan/config.js";
import { loanFixedItems, makeLoanShape } from "../_shared/loan/fixed.js";
import * as utilities from "../utilities/deals.js";
import * as subscriptions from "../subscriptions/subs.js";
import { readCache } from "../../lib/useCloudState.js";

export const STORAGE_KEY = "tools:fixed-expenses:v1";
const SNAPSHOT_KEY = "tools:fixed-expenses:snapshot"; // each source's monthly total, from the last visit
export const DEFAULT_NPR_PER_AUD = 105;

/**
 * Tools that can send costs here. Each tool has its own "Send to Fixed Expenses"
 * switch, saved in that tool's data; `items(state, today)` returns nothing while it's off.
 * Items: { key, name, detail, monthly, currency }
 */
export const SOURCES = [
  {
    id: "car-loan",
    name: carLoan.title,
    icon: "car",
    keys: [carLoan.storageKey, ...(carLoan.legacyKeys || [])],
    shape: makeLoanShape(carLoan),
    isOn: (st) => !!st.settings.sendToFixed,
    items: (st, today) => loanFixedItems(carLoan, st, today),
  },
  {
    id: "home-loan",
    name: homeLoan.title,
    icon: "home",
    keys: [homeLoan.storageKey],
    shape: makeLoanShape(homeLoan),
    isOn: (st) => !!st.settings.sendToFixed,
    items: (st, today) => loanFixedItems(homeLoan, st, today),
  },
  {
    id: "utilities",
    name: "Household Utilities",
    icon: "bolt",
    keys: [utilities.STORAGE_KEY],
    shape: utilities.shapeState,
    isOn: (st) => !!st.sendToFixed,
    items: utilities.fixedItems,
  },
  {
    id: "subscriptions",
    name: "My Subscriptions",
    icon: "repeat",
    keys: [subscriptions.STORAGE_KEY],
    shape: subscriptions.shapeState,
    isOn: (st) => !!st.sendToFixed,
    items: subscriptions.fixedItems,
  },
];

// How often your own expenses are paid, as a share of a month
export const CYCLES = {
  week: { label: "Weekly", perMonth: 52 / 12 },
  fortnight: { label: "Fortnightly", perMonth: 26 / 12 },
  month: { label: "Monthly", perMonth: 1 },
  quarter: { label: "Quarterly", perMonth: 1 / 3 },
  year: { label: "Yearly", perMonth: 1 / 12 },
};

// The period everything is shown in, as months
export const VIEWS = {
  fortnight: { label: "Fortnightly", per: "a fortnight", months: 12 / 26 },
  month: { label: "Monthly", per: "a month", months: 1 },
  quarter: { label: "Quarterly", per: "a quarter", months: 3 },
  year: { label: "Yearly", per: "a year", months: 12 },
};

export const CATEGORIES = {
  housing: "Housing & rent",
  insurance: "Insurance",
  transport: "Transport & car",
  bills: "Bills & phone",
  family: "Kids & family",
  health: "Health",
  savings: "Savings & investing",
  other: "Other",
};

export const emptyState = { custom: [], view: "month", nprPerAud: DEFAULT_NPR_PER_AUD };

export function shapeState(v) {
  if (!v || !Array.isArray(v.custom)) return null;
  return {
    custom: v.custom,
    view: VIEWS[v.view] ? v.view : "month",
    nprPerAud: Number(v.nprPerAud) > 0 ? Number(v.nprPerAud) : DEFAULT_NPR_PER_AUD,
  };
}

export function newExpense() {
  return { id: Math.random().toString(36).slice(2, 10), name: "", category: "insurance", amount: "", cycle: "month", notes: "" };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** A monthly amount in `currency`, in AUD. */
export function toAud(monthly, currency, nprPerAud) {
  return currency === "NPR" ? monthly / nprPerAud : monthly;
}

export const customMonthly = (e) => (Number(e.amount) || 0) * (CYCLES[e.cycle] ?? CYCLES.month).perMonth;

/**
 * Everything that adds up to the total, as groups:
 *   { id, name, icon, linked, on, items: [{ key, name, detail, monthly (AUD), original? }], monthly }
 * `sourceStates` maps a source id to its loaded state (or null if never opened).
 */
export function buildGroups(state, sourceStates, today) {
  const groups = SOURCES.map((src) => {
    const st = sourceStates[src.id];
    const on = !!st && src.isOn(st);
    const items = st
      ? src.items(st, today).map((i) => ({
          ...i,
          original: i.currency !== "AUD" ? { monthly: i.monthly, currency: i.currency } : null,
          monthly: toAud(i.monthly, i.currency, state.nprPerAud),
        }))
      : [];
    return { id: src.id, name: src.name, icon: src.icon, linked: true, loaded: !!st, on, items };
  });
  groups.push({
    id: "custom",
    name: "Your own",
    icon: "pin",
    linked: false,
    loaded: true,
    on: true,
    items: state.custom.map((e) => ({ key: e.id, name: e.name, detail: CATEGORIES[e.category] ?? "", monthly: customMonthly(e), expense: e })),
  });
  for (const g of groups) g.monthly = g.items.reduce((a, i) => a + i.monthly, 0);
  return groups;
}

export const totalMonthly = (groups) => groups.reduce((a, g) => a + g.monthly, 0);

/** Each source's state from this device's saved copy (used before the server answers, and on the home screen). */
export function cachedSourceStates() {
  const out = {};
  for (const src of SOURCES) out[src.id] = readCache(src.keys, src.shape)?.state ?? null;
  return out;
}

/** Remember each source's monthly total, for tools this device hasn't opened itself. */
export function saveSnapshot(groups) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(Object.fromEntries(groups.filter((g) => g.linked).map((g) => [g.id, g.monthly]))));
  } catch {}
}

/**
 * Monthly total for the home screen tile, from this device's saved copies (no login needed).
 * A tool this device hasn't opened falls back to its total from the last Fixed Expenses visit.
 */
export function homeHeadline() {
  try {
    const own = readCache([STORAGE_KEY], shapeState)?.state ?? emptyState;
    const cached = cachedSourceStates();
    let snapshot = {};
    try {
      snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY)) || {};
    } catch {}
    const groups = buildGroups(own, cached, startOfToday());
    const total = groups.reduce((a, g) => a + (g.linked && !cached[g.id] ? Number(snapshot[g.id]) || 0 : g.monthly), 0);
    if (!total) return null;
    const v = VIEWS[own.view] ?? VIEWS.month;
    const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { value: `$${nf.format(total * v.months)}`, per: v.per };
  } catch {
    return null;
  }
}
