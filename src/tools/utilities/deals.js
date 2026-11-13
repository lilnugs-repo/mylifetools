// Pure maths for the utility tracker: deal status, monthly costs, savings and
// calendar export. No React here, so the home screen badge can use it cheaply.
import { addMonths, parseISO, toISO } from "../_shared/loan/loan.js";

export { parseISO, toISO };

export const STORAGE_KEY = "tools:utilities:v1";
export const REMIND_DAYS = 14; // "Ending soon" this many days before a deal ends

const DAY = 864e5;
const MONTH_DAYS = 365.25 / 12;

export const TYPES = {
  electricity: { label: "Electricity", icon: "bolt" },
  gas: { label: "Gas", icon: "flame" },
  internet: { label: "Internet", icon: "wifi" },
  mobile: { label: "Mobile", icon: "phone" },
  other: { label: "Other", icon: "tag" },
};

// Prices are entered as they appear on the bill; this turns them into a monthly figure.
export const BILLING = {
  month: { label: "Monthly", short: "/mo", perMonth: 1 },
  quarter: { label: "Quarterly", short: "/qtr", perMonth: 1 / 3 },
  year: { label: "Yearly", short: "/yr", perMonth: 1 / 12 },
};

export const emptyState = { services: [], history: [] };

export function shapeState(v) {
  if (!v || !Array.isArray(v.services)) return null;
  return { services: v.services, history: Array.isArray(v.history) ? v.history : [] };
}

export function newService(type = "electricity", today = new Date()) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type,
    provider: "",
    plan: "",
    url: "",
    account: "",
    start: toISO(today),
    promoMonths: 6,
    promoPrice: 0,
    regularPrice: 0,
    billing: "month",
    notes: "",
    acknowledged: false, // "Deal ended" banner dismissed
  };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const hasDeal = (s) => s.promoMonths > 0;
export const dealEnd = (s) => addMonths(parseISO(s.start), s.promoMonths);
const monthly = (price, s) => (Number(price) || 0) * BILLING[s.billing || "month"].perMonth;

/**
 * Where a service's intro deal is at, on `today`:
 *   none     no intro deal, standard price only
 *   upcoming plan hasn't started yet
 *   active   deal running, more than REMIND_DAYS left
 *   soon     deal ends within REMIND_DAYS
 *   ended    deal is over, paying the standard price
 */
export function dealStatus(s, today) {
  const start = parseISO(s.start);
  if (!hasDeal(s)) return { state: "none", start };
  const end = dealEnd(s);
  const daysLeft = Math.round((end - today) / DAY);
  const total = Math.max(1, (end - start) / DAY);
  const pct = Math.min(100, Math.max(0, ((today - start) / DAY / total) * 100));
  if (start > today) return { state: "upcoming", start, end, daysLeft, pct: 0, startsIn: Math.round((start - today) / DAY) };
  if (daysLeft <= 0) return { state: "ended", start, end, daysLeft, pct: 100 };
  return { state: daysLeft <= REMIND_DAYS ? "soon" : "active", start, end, daysLeft, pct };
}

/** Monthly cost now (deal price while it runs) and once the deal is over. */
export function monthlyCost(s, today) {
  const st = dealStatus(s, today).state;
  const onDeal = st === "active" || st === "soon" || st === "upcoming";
  return { now: monthly(onDeal ? s.promoPrice : s.regularPrice, s), after: monthly(s.regularPrice, s) };
}

/** What the intro deal has saved so far (or saved in total, for a past deal ended on `until`). */
export function savedSoFar(s, today, until) {
  if (!hasDeal(s)) return 0;
  const start = parseISO(s.start);
  const stop = Math.min(dealEnd(s), until ? parseISO(until) : today, today);
  const months = Math.max(0, (stop - start) / DAY / MONTH_DAYS);
  return Math.max(0, months * (monthly(s.regularPrice, s) - monthly(s.promoPrice, s)));
}

export function totals(state, today) {
  let now = 0, after = 0, saved = 0;
  for (const s of state.services) {
    const c = monthlyCost(s, today);
    now += c.now;
    after += c.after;
    saved += savedSoFar(s, today);
  }
  for (const h of state.history) saved += savedSoFar(h, today, h.ended);
  return { now, after, saved };
}

/** Deals that need attention, for the banner and the home screen badge. */
export function alerts(state, today) {
  const ended = [], soon = [];
  for (const s of state.services) {
    const st = dealStatus(s, today);
    if (st.state === "ended" && !s.acknowledged) ended.push({ s, st });
    if (st.state === "soon") soon.push({ s, st });
  }
  return { ended, soon };
}

/** Badge for the home screen tile, read from this device's saved copy (no login needed). */
export function homeBadge() {
  try {
    const state = shapeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (!state) return null;
    const { ended, soon } = alerts(state, startOfToday());
    if (ended.length) return { tone: "warn", text: `${ended.length} deal${ended.length > 1 ? "s" : ""} ended` };
    if (soon.length) return { tone: "soon", text: `${soon.length} ending soon` };
  } catch {}
  return null;
}

/** An .ics calendar file with the deal's end date and two reminders. */
export function calendarFile(s) {
  const label = TYPES[s.type]?.label ?? "Utility";
  const end = dealEnd(s);
  const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const ymd = (d) => toISO(d).replaceAll("-", "");
  const esc = (t) => String(t).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const title = `${label} deal with ${s.provider || "provider"} ends`;
  const url = s.url && (/^https?:\/\//i.test(s.url) ? s.url : `https://${s.url}`);
  const desc = [
    `Intro price ends; standard price applies from here.`,
    s.plan && `Plan: ${s.plan}`,
    url && `Website: ${url}`,
    s.account && `Account: ${s.account}`,
  ]
    .filter(Boolean)
    .join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Tools//Utility Tracker//EN",
    "BEGIN:VEVENT",
    `UID:${s.id}-${ymd(end)}@my-tools`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART;VALUE=DATE:${ymd(end)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(desc)}`,
    ...(url ? [`URL:${url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)} in a week`,
    "TRIGGER:-P7D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)} today`,
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return { name: `${label}-${s.provider || "deal"}-ends-${toISO(end)}.ics`.replace(/[^a-z0-9.-]+/gi, "-"), text: lines.join("\r\n") };
}
