// How a loan's saved data is read, and what it sends to All My Fixed Expenses.
// Shared by the loan screen and the Fixed Expenses tool. No React here.
import { buildSchedule } from "./loan.js";

/** Turns saved data into loan state ({ settings, paid }), or null if it isn't valid. */
export function makeLoanShape(config) {
  const { defaults, defaultPaid = {}, isPlaceholder } = config;
  return (v) => {
    if (!v || !v.settings) return null;
    if (isPlaceholder?.(v.settings)) return { settings: { ...defaults }, paid: { ...defaultPaid } };
    return { settings: { ...defaults, ...v.settings }, paid: v.paid || {} };
  };
}

/**
 * The loan's regular monthly cost: the repayment due now plus any monthly account fee,
 * in the loan's own currency. Empty when it isn't sent to Fixed Expenses or is repaid.
 */
export function loanFixedItems(config, state, today) {
  const s = state.settings;
  if (!s.sendToFixed) return [];
  const rows = buildSchedule(s, { onRateChange: config.onRateChange, dayCount: config.dayCount });
  const cur = rows.find((r) => r.due >= today);
  if (!cur) return [];
  const fee = Number(s.fee) || 0;
  return [
    {
      key: config.id,
      name: "Loan repayment",
      detail: fee ? "Monthly repayment + account fee" : "Monthly repayment",
      monthly: cur.payment + fee,
      currency: config.currencyCode,
    },
  ];
}
