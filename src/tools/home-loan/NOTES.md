# My Home Loan Tracker: notes

## Currency: always Nrs.

- This tool shows every amount in **Nepalese rupees, written `Nrs.`** (e.g. `Nrs. 20,908.00`).
- **Never use `$`** here, including in labels, exports or any new feature added later.
- The currency is set once in `config.js` (`currency: { symbol: "Nrs. ", locale: "en-IN" }`). Every amount on screen goes through that, so don't hard-code a symbol anywhere else.
- `en-IN` number formatting is used for lakh/crore grouping (`Nrs. 1,00,000.00`). Switch to `en-US` if you prefer `Nrs. 100,000.00`.

## Figures are placeholders

Everything in `config.js` was copied from the car loan as a starting point and is marked `PLACEHOLDER`:

| Setting | Placeholder value | Real value |
|---|---|---|
| Loan amount | Nrs. 20,908 | _to fill in_ |
| Interest rate | 10.41% p.a. | _to fill in_ |
| Term | 60 months | _to fill in_ |
| Monthly account fee | Nrs. 15 | _to fill in_ |
| Start date | 1 Dec 2026 | _to fill in_ |
| Admin fee on early payout | Nrs. 100 | _to fill in_ |
| Early termination fee | Nrs. 750 − Nrs. 15/month, waived first/last 3 months | _to fill in_ |
| Break cost | On (2% swap fall, 3.5% swap rate) | _confirm if it applies_ |

When the real loan terms are known:
1. Update `defaults` and `rules` in `config.js`.
2. Remove the `PLACEHOLDER` comments.
3. Once the tool has been opened and saved, its figures live in the Blob store (`my-tools/tools/home-loan.json`), so new defaults in `config.js` won't replace them. Change saved figures under **Loan details** in the app.

## Shared code

The tracker UI and maths are shared with the car loan (`src/tools/_shared/loan/`). Change fee rules per loan in each tool's `config.js`, not in the shared code.

## Variable interest rate

The home loan has `variableRate: true` in `config.js`, so its rate can change over time.

- **Starting interest rate** under **Loan details** is the rate the loan opens on.
- Add each change under **Interest rate changes** (date + new rate). A change applies to every repayment due after its date.
- When the rate changes, the repayment is recalculated over the remaining term, so the loan still ends on time. The schedule shows a **Rate** column and highlights each repayment where the rate changed.
- Changes are saved in the loan's settings as `rateChanges: [{ from: "YYYY-MM-DD", rate }]`, so they're included in the Blob store and in exported backups.
