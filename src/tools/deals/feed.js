// Deals & Sign-up Bonuses: what to search for, the scan limits, and the shape of
// the saved data. No React or browser APIs, so the server (api/deals.js) uses the same rules.
// Two sources:
//   OzBargain (https://www.ozbargain.com.au): its public RSS feeds, free, no key needed.
//   Tavily (https://tavily.com): web search, 1,000 free credits a month, 1 per basic search.

export const STORAGE_KEY = "tools:deals:v1";

const has = (re) => (item) => re.test(`${item.title} ${item.tags.join(" ")}`);

/**
 * Per category: a Tavily search (Australian sites preferred, last month) and an OzBargain
 * feed with a filter that picks this category's deals out of it.
 */
export const CATEGORIES = {
  banking: {
    label: "Bank accounts",
    icon: "wallet",
    query: "bank account sign up bonus new customers Australia",
    ozb: { feed: "/cat/financial/feed", match: has(/\b(bank account|savings account|transaction account|term deposit|bank)\b/i) },
  },
  cards: {
    label: "Credit cards",
    icon: "tag",
    query: "credit card sign up bonus points new customers Australia",
    ozb: { feed: "/cat/financial/feed", match: has(/credit card|frequent flyer|reward points|amex|american express/i) },
  },
  energy: {
    label: "Electricity & gas",
    icon: "bolt",
    query: "electricity gas retailer sign up credit new customers Australia",
    ozb: { feed: "/deals/feed", match: has(/electricity|energy|\bgas\b|solar|power bill|energy retailer/i) },
  },
  internet: {
    label: "Internet",
    icon: "wifi",
    query: "NBN plan discount first months new customers Australia",
    ozb: { feed: "/cat/internet/feed", match: has(/\bnbn\b|broadband|home internet|fixed wireless|5g home|internet plan/i) },
  },
  mobile: {
    label: "Mobile",
    icon: "phone",
    query: "SIM only mobile plan intro discount new customers Australia",
    ozb: { feed: "/cat/mobile/feed", match: has(/\bsim\b|prepaid|postpaid|mobile plan|\d+\s?gb\b.*(month|days)/i) },
  },
  streaming: {
    label: "Streaming & subscriptions",
    icon: "play",
    query: "streaming subscription free trial discount Australia",
    ozb: {
      feed: "/cat/entertainment/feed",
      match: has(/subscription|free trial|\/month|per month|netflix|stan|binge|disney\+?|hbo|max|paramount|kayo|foxtel|prime video|spotify|youtube premium|apple tv/i),
    },
  },
  cashback: {
    label: "Cashback & rewards",
    icon: "gem",
    query: "cashback rewards app sign up bonus Australia",
    ozb: { feed: "/cat/financial/feed", match: has(/cashback|shopback|topcashback|cashrewards|sign[- ]?up bonus|referral|gift card bonus/i) },
  },
  freebies: {
    label: "Freebies",
    icon: "gift",
    query: null, // OzBargain only
    ozb: { feed: "/freebies/feed", match: () => true },
  },
};

export const SOURCES = { ozbargain: "OzBargain", tavily: "Web search (Tavily)" };

/**
 * Keep Tavily to Australia: it boosts Australian results (country), prefers these Australian
 * deal and comparison sites, and anything on another country's domain is dropped.
 * Whirlpool is here rather than read directly: its robots.txt only admits named search
 * engines, so its threads reach the app through Tavily's index, never by the app visiting it.
 */
export const AU_SITES = [
  "ozbargain.com.au",
  "whirlpool.net.au",
  "finder.com.au",
  "canstar.com.au",
  "mozo.com.au",
  "savings.com.au",
  "pointhacks.com.au",
  "whistleout.com.au",
  "choice.com.au",
  "ratecity.com.au",
  "money.com.au",
];
const FOREIGN = /\.(uk|nz|ca|in|sg|ie|us|za|ph|my|hk|de|fr|jp|ae|pk|ng|ke)$/i;
export const isForeignDomain = (domain) => FOREIGN.test(domain || "");

/**
 * Scan limits: polite to OzBargain, and well inside Tavily's free 1,000 credits a month:
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
  sources: { ozbargain: true, tavily: true },
  email: true,
  marks: {}, // url → "star" | "signed" | "hide"
});

export const emptyState = defaults();

export function shapeState(v) {
  if (!v || typeof v !== "object" || !v.categories) return null;
  const d = defaults();
  return {
    categories: { ...d.categories, ...v.categories },
    sources: { ...d.sources, ...(v.sources || {}) },
    email: v.email !== false,
    marks: v.marks || {},
  };
}

export const enabledCategories = (state) => Object.keys(CATEGORIES).filter((k) => (state ?? defaults()).categories[k] !== false);

export const domainOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
