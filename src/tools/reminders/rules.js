// Email reminder rules: what's coming up across the tools, and how far ahead to
// warn. Pure functions with no React or browser APIs, so the server's daily job
// (api/notify.js) and the Email Reminders screen use exactly the same rules.
import carLoan from "../car-loan/config.js";
import homeLoan from "../home-loan/config.js";
import { buildSchedule, summarise } from "../_shared/loan/loan.js";
import { makeLoanShape } from "../_shared/loan/fixed.js";
import * as utilities from "../utilities/deals.js";
import * as subscriptions from "../subscriptions/subs.js";
import * as bigBuys from "../big-buys/purchases.js";
import * as rentPayday from "../rent-payday/schedule.js";

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
  // Rent & Payday: these start on (or after) the due date, not before it
  cotenant: {
    label: "Co-tenant's rent not received",
    hint: "Their rent day has come and you haven't ticked it off as received",
    on: true,
    days: 0,
    after: true,
    daily: true,
    dailyLabel: "Email every day until I tick it off as received",
  },
  rent: {
    label: "Your rent not paid",
    hint: "Your rent day has come and you haven't ticked it off as paid",
    on: true,
    days: 0,
    after: true,
    daily: true,
    dailyLabel: "Email every day until I tick it off as paid",
  },
  renewals: { label: "Big subscription renewals", hint: "A 3-monthly, 6-monthly or yearly payment is coming up", on: false, days: 7 },
  warranties: { label: "Warranties", hint: "A warranty on something you own is about to end", on: false, days: 30 },
};
export const DAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60];
export const AFTER_OPTIONS = [0, 1, 2, 3, 5, 7]; // for kinds that start on/after the due date

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
export const SOURCE_IDS = ["car-loan", "home-loan", "subscriptions", "utilities", "big-buys", "rent-payday"];

function makeMoney({ symbol, locale }) {
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => symbol + nf.format(n);
}
const aud = makeMoney({ symbol: "$", locale: "en-AU" });
const fmtD = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Where a loan stands: what's been paid (ticked off) and what's left, as fact sections.
 * "Left" figures follow the repayment schedule (interest still to come assumes it runs to term).
 */
function loanSummary(cfg, principal, rows, paid, today) {
  const money = makeMoney(cfg.currency);
  const t = summarise(rows, paid);
  const paidRows = rows.filter((r) => paid[r.n]);
  const left = rows.filter((r) => !paid[r.n]);
  const balance = left.reduce((a, r) => a + r.principal, 0);
  const totalPaid = t.principalPaid + t.interestPaid + t.feesPaid;
  const leftTotal = left.reduce((a, r) => a + r.payment + (Number(r.fee) || 0), 0);
  const leftInterest = left.reduce((a, r) => a + r.interest, 0);
  const leftFees = left.reduce((a, r) => a + (Number(r.fee) || 0), 0);
  const current = rows.find((r) => r.due >= today) ?? rows[rows.length - 1];
  const pct = principal ? (t.principalPaid / principal) * 100 : 0;
  return [
    {
      heading: "Paid so far",
      rows: [
        ["Repayments", `${paidRows.length} of ${rows.length}`],
        ["Principal", `${money(t.principalPaid)} (${pct.toFixed(1)}% of ${money(principal)})`],
        ["Interest", money(t.interestPaid)],
        ...(t.feesPaid ? [["Fees", money(t.feesPaid)]] : []),
        ["Total paid", money(totalPaid)],
      ],
    },
    {
      heading: "Left to pay",
      rows: [
        ["Balance owing", money(balance)],
        ["Repayments left", String(left.length)],
        ["Interest still to come", money(leftInterest)],
        ...(leftFees ? [["Fees still to come", money(leftFees)]] : []),
        ["Total still to pay", money(leftTotal)],
        ...(current ? [["Interest rate now", `${Number(current.rate).toFixed(2)}% p.a.`]] : []),
        ...(rows.length ? [["Last repayment", fmtD(rows[rows.length - 1].due)]] : []),
      ],
    },
  ];
}

/**
 * Everything due within each kind's notice period, soonest first.
 * `data` maps tool id → that tool's saved data (or null), as stored by /api/state.
 * Each reminder: { key, kind, tool, title, detail, date (YYYY-MM-DD), days, facts }.
 * `facts` are sections of money details for the email: [{ heading, rows: [[label, value]] }].
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
    const rows = buildSchedule(st.settings, { onRateChange: cfg.onRateChange, dayCount: cfg.dayCount });
    const unpaid = rows.filter((r) => !st.paid[r.n]);
    const amount = (r) => money(r.payment + (Number(r.fee) || 0));
    const summary = loanSummary(cfg, Number(st.settings.principal) || 0, rows, st.paid, today);
    const thisOne = (r) => ({
      heading: `This repayment (${r.n} of ${rows.length})`,
      rows: [
        ["Amount", amount(r)],
        ["Principal", money(r.principal)],
        ["Interest", `${money(r.interest)} at ${Number(r.rate).toFixed(2)}% p.a.`],
        ...(r.fee ? [["Account fee", money(r.fee)]] : []),
        ["Due", fmtD(r.due)],
        ["Balance after it", money(r.balance)],
      ],
    });

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
        facts: [
          {
            heading: "Not ticked off",
            rows: [
              ["Repayments", n === 1 ? `Repayment ${first.n}` : `${n} (repayments ${first.n} to ${overdue[n - 1].n})`],
              ["Total of these", money(overdue.reduce((a, r) => a + r.payment + (Number(r.fee) || 0), 0))],
              ["Oldest due", fmtD(first.due)],
            ],
          },
          ...summary,
        ],
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
        facts: [thisOne(r), ...summary],
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
    const bill = subscriptions.BILLING[sub.billing]?.label ?? "Monthly";
    out.push({
      facts: [
        {
          heading: kind === "trials" ? "After the trial" : "This payment",
          rows: [
            [kind === "trials" ? "Price" : "Amount", `${aud(subscriptions.price(sub))} (${bill.toLowerCase()})`],
            ...(sub.billing !== "month" ? [["Per month", aud(subscriptions.perMonth(sub))]] : []),
            ["Per year", aud(subscriptions.perYear(sub))],
            [kind === "trials" ? "First charge" : "Charged on", fmtD(st.next)],
            ...(sub.plan ? [["Plan", sub.plan]] : []),
            ...(sub.paidWith ? [["Paid with", sub.paidWith]] : []),
            ...(sub.account ? [["Account", sub.account]] : []),
          ],
        },
      ],
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
    const perMonth = utilities.BILLING[sv.billing]?.perMonth ?? 1;
    const promoMo = (Number(sv.promoPrice) || 0) * perMonth;
    const regMo = (Number(sv.regularPrice) || 0) * perMonth;
    out.push({
      facts: [
        {
          heading: "Prices",
          rows: [
            ["Intro price", `${aud(Number(sv.promoPrice) || 0)}${per} for ${pl(sv.promoMonths, "month")}`],
            ["Standard price", `${aud(Number(sv.regularPrice) || 0)}${per}`],
            ...(sv.billing !== "month" ? [["Per month", `${aud(promoMo)} → ${aud(regMo)}`]] : []),
            ["Extra per month", aud(regMo - promoMo)],
            ["Extra per year", aud((regMo - promoMo) * 12)],
            ["Saved by the deal", aud(utilities.savedSoFar(sv, today))],
          ],
        },
        {
          heading: "Plan",
          rows: [
            ["Provider", [sv.provider, sv.plan].filter(Boolean).join(" · ") || "—"],
            ["Started", fmtD(st.start)],
            [days < 0 ? "Deal ended" : "Deal ends", fmtD(st.end)],
            ...(sv.account ? [["Account", sv.account]] : []),
          ],
        },
      ],
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

  // Rent & Payday: rent days that have passed without a tick (the co-tenant's rent to you, and
  // your own rent). Starts `days` after the due date. With `daily`, repeats every morning until
  // ticked; otherwise once for each missed date. Skipped until the tool has been set up.
  const rp = rentPayday.shapeState(data["rent-payday"]);
  for (const [kind, part] of [["cotenant", "cotenant"], ["rent", "rent"]]) {
    const k = s.kinds[kind];
    if (!rp || !k?.on) continue;
    const sched = rp[part];
    const late = rentPayday.unpaid(sched, today).filter((x) => daysUntil(x.date, today) <= -k.days); // newest first
    if (!late.length) continue;
    const n = late.length;
    const oldest = late[n - 1].date;
    const total = late.reduce((a, x) => a + x.amount, 0);
    const amount = aud(Number(sched.amount) || 0);
    const who = rp.cotenant.name || "Your co-tenant";
    const co = part === "cotenant";
    const nextDue = rentPayday.next(sched, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const tick = co ? "received" : "paid";
    out.push({
      // Daily: a new key each morning. Once: a new key only when another date is missed.
      key: `rent-payday:${part}:late:${k.daily ? iso(today) : iso(late[0].date)}`,
      kind,
      tool: "rent-payday",
      title: co
        ? n === 1
          ? `${who}'s rent of ${amount} not received`
          : `${who}: ${n} rent payments not received`
        : n === 1
          ? `Rent of ${amount} not paid`
          : `${n} rent payments not paid`,
      detail:
        `${n === 1 ? "It was" : "The oldest was"} due ${fmtD(oldest)}. Tick ${n === 1 ? "it" : "them"} off in Rent & Payday once ${tick}.` +
        (k.daily ? ` You'll get this every day until you do.` : ""),
      date: iso(oldest),
      days: daysUntil(oldest, today),
      daily: !!k.daily,
      facts: [
        {
          heading: co ? `Not received from ${who}` : "Not ticked off as paid",
          rows: [
            ...late
              .slice()
              .reverse()
              .map((x) => [fmtD(x.date), aud(x.amount)]),
            [co ? "Total owed to you" : "Total not paid", aud(total)],
          ],
        },
        {
          heading: co ? `${who}'s rent` : "Your rent",
          rows: [
            ["Amount", `${amount} ${(rentPayday.EVERY[sched.every]?.label ?? "").toLowerCase()}`],
            [co ? "Received so far" : "Paid so far", aud(rentPayday.totalPaid(sched))],
            ["Next due", `${fmtD(nextDue)} (${amount})`],
          ],
        },
      ],
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
      facts: [
        {
          heading: "Purchase",
          rows: [
            ...(it.brand || it.model ? [["Item", [it.brand, it.model].filter(Boolean).join(" ")]] : []),
            ...(bigBuys.price(it) ? [["Price paid", aud(bigBuys.price(it))]] : []),
            ["Bought", `${fmtD(st.bought)}${it.store ? ` at ${it.store}` : ""}`],
            ...(it.serial ? [["Serial", it.serial]] : []),
          ],
        },
        {
          heading: "Warranty",
          rows: [
            ["Cover ends", fmtD(st.end)],
            ["Maker's warranty", pl(Number(it.warrantyMonths) || 0, "month")],
            ...(Number(it.extMonths) ? [["Extended", `+ ${pl(Number(it.extMonths), "month")}${it.extProvider ? ` (${it.extProvider})` : ""}`]] : []),
          ],
        },
      ],
    });
  }

  return out.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}

/** "today", "tomorrow", "in 3 days", "yesterday", "3 days ago" */
export const whenText = (days) =>
  days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday" : days < 0 ? `${-days} days ago` : `in ${days} days`;
