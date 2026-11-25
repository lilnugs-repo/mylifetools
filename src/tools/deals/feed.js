// Deals & Sign-up Bonuses: what to search for, the scan limits, and the shape of
// the saved data. No React or browser APIs, so the server (api/deals.js) uses the same rules.
// Searches go through Tavily (https://tavily.com): 1,000 free credits a month, 1 per basic search.

export const STORAGE_KEY = "tools:deals:v1";

/** One Tavily search per category, each favouring Australian results from the last month. */
export const CATEGORIES = {
  banking: { label: "Bank accounts", icon: "wallet", query: "bank account sign up bonus offer Australia new customers" },
  cards: { label: "Credit cards", icon: "tag", query: "credit card sign up bonus points offer Australia new customers" },
  energy: { label: "Electricity & gas", icon: "bolt", query: "electricity gas provider sign up credit discount offer Australia new customers" },
  internet: { label: "Internet", icon: "wifi", query: "NBN plan discount first months new customers offer Australia" },
  mobile: { label: "Mobile", icon: "phone", query: "SIM only mobile plan intro discount offer Australia new customers" },
  streaming: { label: "Streaming & subscriptions", icon: "play", query: "streaming subscription free trial deal Australia" },
  cashback: { label: "Cashback & rewards", icon: "gem", query: "cashback rewards app sign up bonus Australia" },
};

/**
 * Scan limits, kept well inside Tavily's free 1,000 credits a month:
 * a weekly scan (~7 credits) plus at most MANUAL_PER_30_DAYS on-demand ones (~7 each).
 */
export const LIMITS = { minGapHours: 6, manualPer30Days: 20 };
const HOUR = 36e5;
const MONTH = 30 * 24 * HOUR;

/** Whether an on-demand scan is allowed now, given past scans [{ at, trigger }]. */
export function scanAllowance(runs = [], now = Date.now()) {
  const last = runs.reduce((m, r) => Math.max(m, Date.parse(r.at) || 0), 0);
  const manual = runs.filter((r) => r.trigger === "manual" && now - Date.parse(r.at) < MONTH);
  const left = Math.max(0, LIMITS.manualPer30Days - manual.length);
  const gapWait = last ? Math.max(0, last + LIMITS.minGapHours * HOUR - now) : 0;
  const monthWait = left ? 0 : Math.min(...manual.map((r) => Date.parse(r.at))) + MONTH - now;
  const wait = Math.max(gapWait, monthWait);
  return { ok: wait <= 0, left, retryAfter: Math.ceil(Math.max(0, wait) / 1000), lastScan: last ? new Date(last).toISOString() : null };
}

// What the Deals tab saves (tools/deals.json): which categories to scan, the weekly email,
// and what you've done with each deal, keyed by its link.
export const MARKS = { star: "Interested", signed: "Signed up", hide: "Not for me" };

export const defaults = () => ({
  categories: Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, true])),
  email: true,
  marks: {}, // url → "star" | "signed" | "hide"
});

export const emptyState = defaults();

export function shapeState(v) {
  if (!v || typeof v !== "object" || !v.categories) return null;
  const d = defaults();
  return { categories: { ...d.categories, ...v.categories }, email: v.email !== false, marks: v.marks || {} };
}

export const enabledCategories = (state) => Object.keys(CATEGORIES).filter((k) => (state ?? defaults()).categories[k] !== false);

export const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
