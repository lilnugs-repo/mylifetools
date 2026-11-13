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

/**
 * Amortisation schedule: one row per monthly repayment.
 * Variable rate: a rate change applies to every repayment due after its date, and the
 * repayment is recalculated so the remaining balance still clears by the end of the term.
 */
export function buildSchedule(s) {
  const n = s.term;
  const P = s.principal;
  const changes = rateChanges(s);
  const start = parseISO(s.start);
  let rate = Number(s.rate);
  let pmt = instalment(P, rate / 100 / 12, n);
  let ci = 0;
  let bal = P;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const due = addMonths(start, i);
    let changed = false;
    while (ci < changes.length && changes[ci].from < due) {
      changed = changed || changes[ci].rate !== rate;
      rate = changes[ci++].rate;
    }
    const r = rate / 100 / 12;
    if (changed) pmt = instalment(bal, r, n - i + 1);
    const interest = round2(bal * r);
    let principal = round2(pmt - interest);
    if (i === n) principal = round2(bal); // final payment clears rounding
    bal = round2(bal - principal);
    rows.push({ n: i, due, rate, rateChanged: changed, interest, principal, payment: round2(principal + interest), fee: s.fee, balance: bal });
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

  const etfWaived = months < w || months >= s.term - w;
  const etf = !open || etfWaived ? 0 : Math.max(0, rules.etfMax - rules.etfMonthlyReduction * months);
  const admin = open ? rules.adminFee : 0;

  const warlt = balance > 0 ? future.reduce((a, r, i) => a + (i + 1) * r.principal, 0) / balance / 12 : 0;
  const fall = Number(s.swapFall) || 0;
  const now = Number(s.swapNow) || 0;
  const breakWaived = months >= s.term - w;
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
