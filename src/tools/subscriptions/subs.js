// Pure logic for My Subscriptions: categories, billing cycles, next payment dates,
// totals and the home screen badge. No React here, so the home screen can use it cheaply.
import { addMonths, parseISO, toISO } from "../_shared/loan/loan.js";
import { calendarEvent, safeUrl } from "../../lib/files.js";

export { parseISO, toISO };

export const STORAGE_KEY = "tools:subscriptions:v1";
export const TRIAL_DAYS = 7; // flag free trials ending within this many days
export const BIG_RENEWAL_DAYS = 14; // flag quarterly / 6-monthly / yearly payments this far ahead
export const UPCOMING_DAYS = 30; // "Coming up" window

const DAY = 864e5;

// `examples` fill the placeholder and the empty-state guide.
export const CATEGORIES = {
  video: { label: "Streaming video", icon: "play", examples: "Netflix, Disney+, Stan, Binge, YouTube Premium" },
  music: { label: "Music & audio", icon: "music", examples: "Spotify, Apple Music, Audible, podcasts" },
  apps: { label: "Apps & software", icon: "grid", examples: "Microsoft 365, Adobe, ChatGPT, password manager, VPN" },
  cloud: { label: "Cloud storage", icon: "cloud", examples: "iCloud+, Google One, Dropbox, OneDrive" },
  news: { label: "News & reading", icon: "news", examples: "Newspaper, magazine, Kindle Unlimited, Medium" },
  gaming: { label: "Gaming", icon: "gamepad", examples: "Xbox Game Pass, PlayStation Plus, Nintendo Switch Online" },
  fitness: { label: "Fitness & health", icon: "dumbbell", examples: "Gym, Strava, meditation app, health insurance extras" },
  food: { label: "Food & delivery", icon: "bag", examples: "Uber One, DoorDash DashPass, meal kits, coffee club" },
  memberships: { label: "Shopping & memberships", icon: "tag", examples: "Amazon Prime, Costco, roadside assistance, club fees" },
  learning: { label: "Learning", icon: "book", examples: "Duolingo, online courses, language classes" },
  other: { label: "Other", icon: "repeat", examples: "Anything else that charges you regularly" },
};

// How often it charges, and what that is per month.
export const BILLING = {
  week: { label: "Weekly", short: "week", perMonth: 52 / 12 },
  month: { label: "Monthly", short: "month", perMonth: 1, months: 1 },
  quarter: { label: "Every 3 months", short: "3 months", perMonth: 1 / 3, months: 3 },
  half: { label: "Every 6 months", short: "6 months", perMonth: 1 / 6, months: 6 },
  year: { label: "Yearly", short: "year", perMonth: 1 / 12, months: 12 },
};

export const WORTH = {
  yes: "Worth it",
  unsure: "Not sure",
  no: "Thinking of cancelling",
};

export const emptyState = { subs: [] };

export function shapeState(v) {
  return v && Array.isArray(v.subs) ? { subs: v.subs } : null;
}

export function newSub(category = "video", today = new Date()) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    category,
    plan: "",
    price: "",
    billing: "month",
    nextPayment: toISO(today), // any date it charges on; later dates roll forward from it
    trial: false,
    trialEnds: "", // first paid charge after a free trial
    status: "active", // active | paused | cancelled
    cancelledOn: "",
    paidWith: "",
    account: "",
    url: "",
    worth: "yes",
    notes: "",
  };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const price = (s) => Number(s.price) || 0;
export const perMonth = (s) => price(s) * (BILLING[s.billing] ?? BILLING.month).perMonth;
export const perYear = (s) => perMonth(s) * 12;
const daysUntil = (d, today) => Math.round((d - today) / DAY);

/** The n-th charge after `anchor` (0 = the anchor itself). */
function chargeAt(anchor, billing, n) {
  if (billing === "week") return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * n);
  return addMonths(anchor, n * (BILLING[billing] ?? BILLING.month).months);
}

/** Next charge on or after `today`, rolling the saved date forward by the billing cycle. */
export function nextCharge(s, today) {
  if (s.status !== "active") return null;
  if (s.trial && s.trialEnds) {
    const t = parseISO(s.trialEnds);
    if (t >= today) return t;
    // Trial's over: charges continue from the end of the trial
    return rollForward(t, s.billing, today);
  }
  if (!s.nextPayment) return null;
  return rollForward(parseISO(s.nextPayment), s.billing, today);
}

function rollForward(anchor, billing, today) {
  if (anchor >= today) return anchor;
  // Jump close, then step, so old dates stay cheap
  const per = billing === "week" ? 7 : 30.44 * (BILLING[billing] ?? BILLING.month).months;
  let n = Math.max(0, Math.floor((today - anchor) / DAY / per) - 1);
  let d = chargeAt(anchor, billing, n);
  while (d < today) d = chargeAt(anchor, billing, ++n);
  return d;
}

/** Every charge from `today` up to `days` ahead, for "Coming up". */
export function chargesWithin(s, today, days) {
  const first = nextCharge(s, today);
  if (!first) return [];
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const out = [];
  for (let n = 0, d = first; d <= until && n < 60; d = chargeAt(first, s.billing, ++n)) out.push(d);
  return out;
}

/**
 * Where a subscription is at, on `today`:
 *   trial      free trial running (paying starts on trialEnds)
 *   active     paying
 *   paused     on hold, not paying
 *   cancelled  stopped
 * `flag` marks one that needs attention soon: a trial about to end, or a big
 * (3-monthly or longer) payment coming up.
 */
export function subStatus(s, today) {
  if (s.status === "cancelled") return { state: "cancelled" };
  if (s.status === "paused") return { state: "paused" };
  const next = nextCharge(s, today);
  const days = next ? daysUntil(next, today) : null;
  const onTrial = s.trial && s.trialEnds && parseISO(s.trialEnds) >= today;
  if (onTrial) return { state: "trial", next, days, flag: days <= TRIAL_DAYS };
  const big = (BILLING[s.billing]?.months ?? 0) >= 3;
  return { state: "active", next, days, flag: big && days != null && days <= BIG_RENEWAL_DAYS };
}

/** Totals for subscriptions you're paying for now (not trials, paused or cancelled). */
export function summary(subs, today) {
  let month = 0, trialsAfter = 0, paying = 0, trials = 0, paused = 0, reviewMonth = 0, review = 0;
  for (const s of subs) {
    const st = subStatus(s, today).state;
    if (st === "active") {
      paying++;
      month += perMonth(s);
      if (s.worth === "no" || s.worth === "unsure") {
        review++;
        reviewMonth += perMonth(s);
      }
    } else if (st === "trial") {
      trials++;
      trialsAfter += perMonth(s);
    } else if (st === "paused") paused++;
  }
  return { month, year: month * 12, paying, trials, trialsAfter, paused, review, reviewMonth };
}

/** Monthly spend per category, biggest first. */
export function byCategory(subs, today) {
  const m = {};
  for (const s of subs) if (subStatus(s, today).state === "active") m[s.category] = (m[s.category] || 0) + perMonth(s);
  return Object.entries(m)
    .map(([k, v]) => ({ key: k, month: v }))
    .sort((a, b) => b.month - a.month);
}

/** Charges in the next `days`, soonest first. */
export function upcoming(subs, today, days = UPCOMING_DAYS) {
  const out = [];
  for (const s of subs) for (const d of chargesWithin(s, today, days)) out.push({ s, date: d, amount: price(s) });
  return out.sort((a, b) => a.date - b.date || a.s.name.localeCompare(b.s.name));
}

/** Trials ending soon and big renewals coming up, for the banner and the home badge. */
export function attention(subs, today) {
  const trials = [], renewals = [];
  for (const s of subs) {
    const st = subStatus(s, today);
    if (!st.flag) continue;
    (st.state === "trial" ? trials : renewals).push({ s, st });
  }
  const byDate = (a, b) => a.st.next - b.st.next;
  return { trials: trials.sort(byDate), renewals: renewals.sort(byDate) };
}

/** Badge for the home screen tile, read from this device's saved copy (no login needed). */
export function homeBadge() {
  try {
    const state = shapeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (!state) return null;
    const { trials, renewals } = attention(state.subs, startOfToday());
    if (trials.length) return { tone: "warn", text: `${trials.length} trial${trials.length > 1 ? "s" : ""} ending soon` };
    if (renewals.length) return { tone: "soon", text: `${renewals.length} big renewal${renewals.length > 1 ? "s" : ""} soon` };
  } catch {}
  return null;
}

/** An .ics reminder for the next charge (or the end of a free trial), 3 days ahead. */
export function calendarFile(s, today, money) {
  const st = subStatus(s, today);
  const what = s.name || "Subscription";
  const trial = st.state === "trial";
  const title = trial ? `${what} free trial ends` : `${what} renews`;
  const description = [
    trial
      ? `Free trial ends. You'll be charged ${money(price(s))} a ${BILLING[s.billing]?.short ?? "month"} from here unless you cancel.`
      : `${what} charges ${money(price(s))} today.`,
    s.plan && `Plan: ${s.plan}`,
    s.paidWith && `Paid with: ${s.paidWith}`,
    s.account && `Account: ${s.account}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    name: `${what}-${trial ? "trial-ends" : "renews"}-${toISO(st.next)}.ics`,
    text: calendarEvent({ uid: s.id, date: st.next, title, description, url: safeUrl(s.url), daysBefore: 3 }),
  };
}
