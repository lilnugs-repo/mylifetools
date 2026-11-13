// My Car Loan — everything specific to this loan lives here.
export default {
  id: "car-loan", // also the file name in Blob: my-tools/tools/car-loan.json
  title: "My Car Loan",
  storageKey: "tools:car-loan:v1", // offline cache in the browser
  legacyKeys: ["loan-tracker-v1"], // data saved by the earlier standalone version
  currency: { symbol: "$", locale: "en-AU" },
  currencyCode: "AUD", // for All My Fixed Expenses
  defaults: {
    principal: 20908,
    rate: 10.41, // % p.a.
    term: 60, // months
    fee: 15, // monthly account fee
    start: "2026-12-01", // loan start (settlement) date
    swapFall: 2, // assumed wholesale swap rate fall, % (break cost)
    swapNow: 3.5, // assumed swap rate at payout, % (break cost discount)
  },
  // Early payout rules from the loan contract
  rules: {
    adminFee: 100, // loan administration fee on early payout
    etfMax: 750, // early termination fee starts here…
    etfMonthlyReduction: 15, // …and drops this much per full month
    waiverMonths: 3, // no ETF in the first/last N months (no break cost in the last N)
    breakCost: true, // include the lender's break cost estimate
  },
  termOptions: [36, 48, 60, 72, 84],
};
