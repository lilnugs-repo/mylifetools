// Pure loan maths — no React here, so it's easy to test or reuse.

export const DEFAULTS = {
  principal: 20908,
  rate: 10.41, // % p.a.
  term: 60, // months
  fee: 15, // monthly account fee
  start: "2026-12-01", // loan start (settlement) date
  swapFall: 2, // assumed fall in wholesale swap rate, % (break cost)
  swapNow: 3.5, // assumed swap rate at payout, % (break cost discount)
};

export const ADMIN_FEE = 100;
export const ETF_MAX = 750;
export const ETF_MONTHLY_REDUCTION = 15;
export const WAIVER_MONTHS = 3;

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

/** Amortisation schedule: one row per monthly repayment. */
export function buildSchedule(s) {
  const r = s.rate / 100 / 12;
  const n = s.term;
  const P = s.principal;
  const pmt = round2(r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)));
  const start = parseISO(s.start);
  let bal = P;
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const interest = round2(bal * r);
    let principal = round2(pmt - interest);
    if (i === n) principal = round2(bal); // final payment clears rounding
    bal = round2(bal - principal);
    rows.push({ n: i, due: addMonths(start, i), interest, principal, payment: round2(principal + interest), fee: s.fee, balance: bal });
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
 * Estimated payout if the loan were closed on `today`.
 * Fees per the contract: $100 admin fee, early termination fee of
 * $750 − $15 per full month (waived in the first/last 3 months),
 * plus the lender's break cost formula:
 *   contracted balance × swap rate fall × WARLT, discounted by (1 + swap rate)^WARLT.
 */
export function payout(s, rows, paid, today) {
  const paidCount = rows.filter((r) => paid[r.n]).length;
  const future = rows.slice(paidCount);
  const balance = future.reduce((a, r) => a + r.principal, 0);
  const months = fullMonthsBetween(parseISO(s.start), today);
  const open = balance > 0.005;

  const etfWaived = months < WAIVER_MONTHS || months >= s.term - WAIVER_MONTHS;
  const etf = !open || etfWaived ? 0 : Math.max(0, ETF_MAX - ETF_MONTHLY_REDUCTION * months);
  const admin = open ? ADMIN_FEE : 0;

  const warlt = balance > 0 ? future.reduce((a, r, i) => a + (i + 1) * r.principal, 0) / balance / 12 : 0;
  const fall = Number(s.swapFall) || 0;
  const now = Number(s.swapNow) || 0;
  const breakWaived = months >= s.term - WAIVER_MONTHS;
  const breakCost = !open || breakWaived || fall <= 0 ? 0 : (balance * (fall / 100) * warlt) / Math.pow(1 + now / 100, warlt);

  return { balance, months, etf, etfWaived, admin, warlt, breakCost, total: balance + etf + admin + breakCost };
}
