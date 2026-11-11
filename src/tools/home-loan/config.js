// My Home Loan Tracker — everything specific to this loan lives here.
//
// CURRENCY RULE: this tool always shows Nepalese rupees as "Nrs." — never "$".
// See ./NOTES.md before changing anything below.
//
// PLACEHOLDERS: every figure below was copied from the car loan as a starting
// point. Replace them with the real home loan terms.
export default {
  id: "home-loan", // also the file name in Blob: my-tools/tools/home-loan.json
  title: "My Home Loan Tracker",
  storageKey: "tools:home-loan:v1", // offline cache in the browser
  currency: { symbol: "Nrs. ", locale: "en-IN" }, // en-IN gives lakh grouping, e.g. Nrs. 1,00,000.00
  defaults: {
    principal: 20908, // PLACEHOLDER
    rate: 10.41, // PLACEHOLDER % p.a.
    term: 60, // PLACEHOLDER months
    fee: 15, // PLACEHOLDER monthly account fee
    start: "2026-12-01", // PLACEHOLDER loan start date
    swapFall: 2, // PLACEHOLDER
    swapNow: 3.5, // PLACEHOLDER
  },
  rules: {
    adminFee: 100, // PLACEHOLDER
    etfMax: 750, // PLACEHOLDER
    etfMonthlyReduction: 15, // PLACEHOLDER
    waiverMonths: 3, // PLACEHOLDER
    breakCost: true, // PLACEHOLDER: set false if the home loan has no break cost
  },
  termOptions: [36, 48, 60, 120, 180, 240, 300, 360],
};
