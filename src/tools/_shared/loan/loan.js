// Pure loan maths shared by every loan tracker. No React here.
// Fee rules come from each tool's config (see src/tools/<tool>/config.js).

const round2 = (n) => Math.round(n * 100) / 100;

export function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

export function fullMonthsBetween(a, b) {
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m--;
  return Math.max(0, m);
}

const instalment = (P, r, n) => round2(r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)));

/**
 * Variable-rate changes, valid and sorted by date: [{ from: Date, rate: % p.a. }].
 * Stored in settings as s.rateChanges = [{ from: "YYYY-MM-DD", rate }].
 */
export function rateChanges(s) {
  return (s.rateChanges || [])
    .filter((c) => c && c.from && c.rate !== "" && Number.isFinite(Number(c.rate)) && Number(c.rate) >= 0)
    .map((c) => ({ from: parseISO(c.from), rate: Number(c.rate) }))
    .sort((a, b) => a.from - b.from);
}

const DAY = 864e5;
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const MAX_ROWS = 1200; // 100 years: stops a schedule that would never clear

/**
 * Amortisation schedule: one row per monthly repayment.
 *
 * opts.dayCount
 *   "monthly" (default): each period's interest is balance × rate / 12. A rate change
 *     applies to every repayment due after its date.
 *   "actual/365": interest accrues daily, balance × rate × days / 365, as most Nepali
 *     banks charge. A rate change applies from its date, so a period that spans a change
 *     is charged each rate for its own days.
 * opts.onRateChange
 *   "keep-term" (default): the repayment is recalculated so the loan still ends on time.
 *   "keep-payment": the repayment stays the same and the loan ends sooner or later instead.
 *
 * The first repayment (from `rate` and `term`) is the contracted one either way.
 */
export function buildSchedule(s, opts = {}) {
  const daily = opts.dayCount === "actual/365";
  const keepPayment = opts.onRateChange === "keep-payment";
  const n = s.term;
  const P = s.principal;
  const changes = rateChanges(s);
  const start = parseISO(s.start);
  let rate = Number(s.rate);
  let pmt = instalment(P, rate / 100 / 12, n);
  let ci = 0;
  let bal = P;
  let prevDue = start;
  const rows = [];
  for (let i = 1; bal > 0.005 && i <= (keepPayment ? MAX_ROWS : n); i++) {
    const due = addMonths(start, i);
    const before = rate;
    let changed = false;
    let interest;
    if (daily) {
      // Charge each rate for the days it was in force between the last repayment and this one.
      let acc = 0;
      let from = prevDue;
      while (ci < changes.length && changes[ci].from < due) {
        const at = changes[ci].from > from ? changes[ci].from : from;
        acc += rate * daysBetween(from, at);
        from = at;
        rate = changes[ci++].rate;
      }
      acc += rate * daysBetween(from, due);
      interest = round2((bal * acc) / 100 / 365);
    } else {
      while (ci < changes.length && changes[ci].from < due) rate = changes[ci++].rate;
      interest = round2((bal * rate) / 100 / 12);
    }
    changed = rate !== before;
    if (changed && !keepPayment) pmt = instalment(bal, rate / 100 / 12, n - i + 1);
    let principal = round2(pmt - interest);
    const last = keepPayment ? principal >= bal || i === MAX_ROWS : i === n;
    if (last) principal = round2(bal); // final payment clears what's left
    bal = round2(bal - principal);
    rows.push({ n: i, due, rate, rateChanged: changed, interest, principal, payment: round2(principal + interest), fee: s.fee, balance: bal });
    prevDue = due;
  }
  return rows;
}

/** Totals for the ticked repayments. */
export function summarise(rows, paid) {
  let principalPaid = 0, interestPaid = 0, feesPaid = 0, interestTotal = 0;
  for (const r of rows) {
    interestTotal += r.interest;
    if (paid[r.n]) {
      principalPaid += r.principal;
      interestPaid += r.interest;
      feesPaid += r.fee;
    }
  }
  return { principalPaid, interestPaid, feesPaid, interestTotal };
}

/**
 * Estimated payout if the loan were closed on `date`, given which repayments are paid.
 * rules: { adminFee, etfMax, etfMonthlyReduction, waiverMonths, breakCost }
 * Break cost (lender formula): contracted balance × swap rate fall × WARLT,
 * discounted by (1 + swap rate at payout)^WARLT.
 */
export function payout(s, rows, paid, date, rules) {
  const paidCount = rows.filter((r) => paid[r.n]).length;
  const future = rows.slice(paidCount);
  const balance = future.reduce((a, r) => a + r.principal, 0);
  const months = fullMonthsBetween(parseISO(s.start), date);
  const open = balance > 0.005;
  const w = rules.waiverMonths ?? 0;

  const etfWaived = months < w || months >= rows.length - w;
  const etf = !open || etfWaived ? 0 : Math.max(0, rules.etfMax - rules.etfMonthlyReduction * months);
  const admin = open ? rules.adminFee : 0;

  const warlt = balance > 0 ? future.reduce((a, r, i) => a + (i + 1) * r.principal, 0) / balance / 12 : 0;
  const fall = Number(s.swapFall) || 0;
  const now = Number(s.swapNow) || 0;
  const breakWaived = months >= rows.length - w;
  const breakCost =
    !rules.breakCost || !open || breakWaived || fall <= 0 ? 0 : (balance * (fall / 100) * warlt) / Math.pow(1 + now / 100, warlt);

  return { balance, months, etf, etfWaived, admin, warlt, breakCost, total: balance + etf + admin + breakCost };
}

/**
 * Where the loan stands on a future (or past) date, assuming every repayment
 * due on or before that date is paid on time.
 */
export function projectToDate(s, rows, date, rules) {
  const paid = {};
  let principalPaid = 0, interestPaid = 0, feesPaid = 0;
  for (const r of rows) {
    if (r.due <= date) {
      paid[r.n] = true;
      principalPaid += r.principal;
      interestPaid += r.interest;
      feesPaid += r.fee;
    }
  }
  const paidCount = Object.keys(paid).length;
  const lastPaid = paidCount ? rows[paidCount - 1] : null;
  const nextDue = rows[paidCount] ?? null;
  return { paidCount, lastPaid, nextDue, principalPaid, interestPaid, feesPaid, payout: payout(s, rows, paid, date, rules) };
}
