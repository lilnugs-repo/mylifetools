// My Home Loan Tracker — everything specific to this loan lives here.
//
// CURRENCY RULE: this tool always shows Nepalese rupees as "Nrs." — never "$".
// See ./NOTES.md before changing anything below.
//
// Loan figures come from the bank's payment statement (EMIs to 20 Dec 2025).
// Early-payout rules are still PLACEHOLDERS copied from the car loan.

// Repayments already made when these figures were entered (EMIs 1–32, May 2023 – Dec 2025).
const PAID_THROUGH = 32;
const paidFromStatement = Object.fromEntries(
  Array.from({ length: PAID_THROUGH }, (_, i) => {
    const d = new Date(2023, 4 + i, 20); // EMI i+1 fell on the 20th of each month from May 2023
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-20`;
    return [i + 1, iso];
  })
);

export default {
  id: "home-loan", // also the file name in Blob: my-tools/tools/home-loan.json
  title: "My Home Loan Tracker",
  storageKey: "tools:home-loan:v1", // offline cache in the browser
  currency: { symbol: "Nrs. ", locale: "en-IN" }, // en-IN gives lakh grouping, e.g. Nrs. 1,00,000.00
  defaults: {
    principal: 14300000, // Nrs. 1,43,00,000 disbursed
    rate: 13.6, // contracted rate; with the 192-month term it gives the EMI of Nrs. 1,83,103.86
    term: 192, // contracted term: 16 years
    fee: 0, // no monthly account fee on the statement
    start: "2023-04-20", // first EMI 20 May 2023, then the 20th of each month
    // Rates actually charged, worked back from each EMI's interest on the statement
    // (daily interest, actual days / 365). Each applies from its date.
    rateChanges: [
      { from: "2023-04-20", rate: 13.4633 },
      { from: "2023-05-20", rate: 13.33 },
      { from: "2023-06-20", rate: 13.126 },
      { from: "2023-07-20", rate: 12.4589 },
      { from: "2023-08-20", rate: 12.6536 },
      { from: "2023-09-20", rate: 12.6133 },
      { from: "2023-10-20", rate: 12.7087 },
      { from: "2023-11-20", rate: 12.5349 },
      { from: "2023-12-20", rate: 12.4822 },
      { from: "2024-01-20", rate: 12.2183 },
      { from: "2024-02-20", rate: 11.4356 },
      { from: "2024-03-20", rate: 11.3502 },
      { from: "2024-04-20", rate: 11.0391 },
      { from: "2024-05-20", rate: 10.803 },
      { from: "2024-06-20", rate: 10.4398 },
      { from: "2024-07-20", rate: 10.195 },
      { from: "2024-08-20", rate: 10.4385 },
      { from: "2024-09-20", rate: 10.2219 },
      { from: "2024-10-20", rate: 9.9651 },
      { from: "2024-11-20", rate: 9.7267 },
      { from: "2024-12-20", rate: 9.4713 },
      { from: "2025-01-20", rate: 9.2784 },
      { from: "2025-02-20", rate: 9.1443 },
      { from: "2025-03-20", rate: 9.0345 },
      { from: "2025-04-20", rate: 8.9633 },
      { from: "2025-05-20", rate: 8.9252 },
      { from: "2025-06-20", rate: 8.9 },
      { from: "2025-07-20", rate: 8.8145 },
      { from: "2025-08-20", rate: 8.7332 },
      { from: "2025-09-20", rate: 8.664 },
      { from: "2025-10-20", rate: 8.5635 },
      { from: "2025-11-20", rate: 8.386 },
      { from: "2025-12-20", rate: 8.23 },
    ],
    swapFall: 2, // PLACEHOLDER
    swapNow: 3.5, // PLACEHOLDER
  },
  defaultPaid: paidFromStatement,
  // Saved data that still holds the old car-loan placeholder figures is replaced with the above.
  isPlaceholder: (s) => s.principal === 20908 && s.start === "2026-12-01",
  rules: {
    adminFee: 100, // PLACEHOLDER
    etfMax: 750, // PLACEHOLDER
    etfMonthlyReduction: 15, // PLACEHOLDER
    waiverMonths: 3, // PLACEHOLDER
    breakCost: true, // PLACEHOLDER: set false if the home loan has no break cost
  },
  variableRate: true, // the rate can change over time (rateChanges above)
  onRateChange: "keep-payment", // the bank keeps the EMI the same; a rate change moves the end date instead
  dayCount: "actual/365", // interest accrues daily on actual days / 365
  termOptions: [120, 144, 180, 192, 240, 300, 360],
};
