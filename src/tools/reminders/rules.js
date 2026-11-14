// Email reminder rules: what's coming up across the tools, and how far ahead to
// warn. Pure functions with no React or browser APIs, so the server's daily job
// (api/notify.js) and the Email Reminders screen use exactly the same rules.
import carLoan from "../car-loan/config.js";
import homeLoan from "../home-loan/config.js";
import { buildSchedule } from "../_shared/loan/loan.js";
import { makeLoanShape } from "../_shared/loan/fixed.js";
import * as utilities from "../utilities/deals.js";
import * as subscriptions from "../subscriptions/subs.js";
import * as bigBuys from "../big-buys/purchases.js";

const DAY = 864e5;
const daysUntil = (d, today) => Math.round((d - today) / DAY);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Each kind of reminder, with its default switch and notice period. */
export const KINDS = {
  loans: {
    label: "Loan repayments",
    hint: "A repayment you haven't ticked off is coming up",
    on: true,
    days: 3,
    // Repeat every morning (also once it's past due) until the repayment is ticked off as paid.
    daily: true,
    dailyLabel: "Email every day until I tick it off as paid",
  },
  trials: { label: "Subscription free trials", hint: "A free trial is about to turn into a paid plan", on: true, days: 3 },
  utilities: {
    label: "Utility intro deals",
    hint: "An electricity, gas, internet or mobile deal is about to end",
    on: true,
    days: 7,
    // Repeat every morning (also after the deal ends) until the service is marked cancelled,
    // switched, given a new deal, or its "deal ended" banner is dismissed.
    daily: true,
    dailyLabel: "Email every day until I mark it cancelled or update it",
  },
  renewals: { label: "Big subscription renewals", hint: "A 3-monthly, 6-monthly or yearly payment is coming up", on: false, days: 7 },
  warranties: { label: "Warranties", hint: "A warranty on something you own is about to end", on: false, days: 30 },
};
export const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60];

export const defaultSettings = () => ({
  enabled: true,
  kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { on: v.on, days: v.days, ...("daily" in v && { daily: v.daily }) }])),
});

export function shapeSettings(v) {
  if (!v || typeof v !== "object" || !v.kinds) return null;
  const d = defaultSettings();
  for (const k of Object.keys(KINDS)) d.kinds[k] = { ...d.kinds[k], ...(v.kinds[k] || {}) };
  return { enabled: v.enabled !== false, kinds: d.kinds };
}

const LOANS = [carLoan, homeLoan];

/** Where each tool's saved data comes from: the tool ids passed to `load`. */
export const SOURCE_IDS = ["car-loan", "home-loan", "subscriptions", "utilities", "big-buys"];

function makeMoney({ symbol, locale }) {
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => symbol + nf.format(n);
}
const aud = makeMoney({ symbol: "$", locale: "en-AU" });

/**
 * Everything due within each kind's notice period, soonest first.
 * `data` maps tool id → that tool's saved data (or null), as stored by /api/state.
 * Each reminder: { key, kind, tool, title, detail, date (YYYY-MM-DD), days }.
 * `key` is stable for one event, so the daily job sends each reminder once.
 */
export function collect(data, settings, today) {
  const s = shapeSettings(settings) ?? defaultSettings();
  const out = [];
  const within = (kind, date) => {
    const k = s.kinds[kind];
    if (!k?.on || !date) return null;
    const days = daysUntil(date, today);
    return days >= 0 && days <= k.days ? days : null;
  };

  // Loan repayments not yet ticked off. With `daily`, each one repeats every morning until it's
  // ticked off, and past-due ones keep coming as one "not ticked off" line per loan.
  const loanDaily = !!s.kinds.loans?.daily;
  const repeat = loanDaily ? `:${iso(today)}` : "";
  const keepAt = loanDaily ? " You'll get this every day until you tick it off." : "";
  for (const cfg of LOANS) {
    const st = makeLoanShape(cfg)(data[cfg.id]) ?? { settings: { ...cfg.defaults }, paid: { ...(cfg.defaultPaid || {}) } };
    const money = makeMoney(cfg.currency);
    const unpaid = buildSchedule(st.settings, { onRateChange: cfg.onRateChange, dayCount: cfg.dayCount }).filter((r) => !st.paid[r.n]);
    const amount = (r) => money(r.payment + (Number(r.fee) || 0));

    const overdue = unpaid.filter((r) => r.due < today);
    if (loanDaily && s.kinds.loans.on && overdue.length) {
      const first = overdue[0];
      const n = overdue.length;
      out.push({
        key: `${cfg.id}:overdue${repeat}`,
        kind: "loans",
        tool: cfg.id,
        title: n === 1 ? `${cfg.title} repayment of ${amount(first)} not ticked off` : `${cfg.title}: ${n} repayments not ticked off`,
        detail: `${n === 1 ? `Repayment ${first.n} was` : `The oldest, repayment ${first.n}, was`} due ${first.due.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}. Tick ${n === 1 ? "it" : "them"} off in ${cfg.title} once paid.${keepAt.replace("it off", n === 1 ? "it off" : "them off")}`,
        date: iso(first.due),
        days: daysUntil(first.due, today),
        daily: true,
      });
    }

    for (const r of unpaid) {
      const days = within("loans", r.due);
      if (days == null) continue;
      out.push({
        key: `${cfg.id}:payment:${r.n}:${iso(r.due)}${repeat}`,
        kind: "loans",
        tool: cfg.id,
        title: `${cfg.title} repayment of ${amount(r)} due`,
        detail: `Repayment ${r.n}: ${money(r.principal)} principal · ${money(r.interest)} interest${r.fee ? ` · ${money(r.fee)} fee` : ""}. Tick it off once paid.${keepAt}`,
        date: iso(r.due),
        days,
        daily: loanDaily,
      });
    }
  }

  // Subscriptions: free trials ending, and big renewals
  const subs = subscriptions.shapeState(data.subscriptions)?.subs ?? [];
  for (const sub of subs) {
    const st = subscriptions.subStatus(sub, today);
    const big = (subscriptions.BILLING[sub.billing]?.months ?? 0) >= 3;
    const kind = st.state === "trial" ? "trials" : st.state === "active" && big ? "renewals" : null;
    const days = kind && within(kind, st.next);
    if (days == null) continue;
    const per = subscriptions.BILLING[sub.billing]?.short ?? "month";
    out.push({
      key: `subscriptions:${sub.id}:${kind}:${iso(st.next)}`,
      kind,
      tool: "subscriptions",
      title: kind === "trials" ? `${sub.name} free trial ends` : `${sub.name} renews`,
      detail:
        kind === "trials"
          ? `You'll be charged ${aud(subscriptions.price(sub))} a ${per} from then unless you cancel.`
          : `${aud(subscriptions.price(sub))} for the next ${per}.`,
      date: iso(st.next),
      days,
    });
  }

  // Utility intro deals ending. With `daily`, the reminder repeats every morning, and keeps
  // going after the deal ends, until the service is cancelled, switched, re-dealt or dismissed.
  const services = utilities.shapeState(data.utilities)?.services ?? [];
  const util = s.kinds.utilities;
  for (const sv of services) {
    if (!util?.on || !utilities.hasDeal(sv)) continue;
    const st = utilities.dealStatus(sv, today);
    if (st.state === "upcoming" || st.state === "cancelled") continue;
    const days = daysUntil(st.end, today);
    const daily = !!util.daily;
    if (days > util.days || (days < 0 && (!daily || sv.acknowledged))) continue;
    const per = utilities.BILLING[sv.billing]?.short ?? "/mo";
    const type = sv.type === "other" ? sv.plan || "Other" : utilities.TYPES[sv.type]?.label ?? "Utility";
    const prices = `${aud(Number(sv.promoPrice) || 0)}${per} to ${aud(Number(sv.regularPrice) || 0)}${per}`;
    out.push({
      // Daily reminders get a new key each day, so each morning sends again
      key: `utilities:${sv.id}:deal:${iso(st.end)}${daily ? `:${iso(today)}` : ""}`,
      kind: "utilities",
      tool: "utilities",
      title: `${type} deal with ${sv.provider || "your provider"} ${days < 0 ? "ended" : "ends"}`,
      detail:
        (days < 0 ? `You're now paying ${aud(Number(sv.regularPrice) || 0)}${per} instead of ${aud(Number(sv.promoPrice) || 0)}${per}.` : `Goes from ${prices}.`) +
        (daily ? " You'll get this every day until you mark it cancelled or update it in Household Utilities." : " Time to shop around?"),
      date: iso(st.end),
      days,
      daily,
    });
  }

  // Warranties ending
  const items = bigBuys.shapeState(data["big-buys"])?.items ?? [];
  for (const it of items) {
    if (it.gone) continue;
    const st = bigBuys.warrantyStatus(it, today);
    if (st.state !== "active" && st.state !== "soon") continue;
    const days = within("warranties", st.end);
    if (days == null) continue;
    out.push({
      key: `big-buys:${it.id}:warranty:${iso(st.end)}`,
      kind: "warranties",
      tool: "big-buys",
      title: `${it.name || "An item"} warranty ends`,
      detail: `Check it over and claim any faults before then. Warranty kept: ${bigBuys.STORED[it.storedIn] ?? "not recorded"}${it.storedNote ? ` (${it.storedNote})` : ""}.`,
      date: iso(st.end),
      days,
    });
  }

  return out.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}

/** "today", "tomorrow", "in 3 days", "yesterday", "3 days ago" */
export const whenText = (days) =>
  days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday" : days < 0 ? `${-days} days ago` : `in ${days} days`;
