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
3. If you've already used the tool in a browser, the old figures are saved there. Change them under **Loan details** (or clear the `tools:home-loan:v1` key in the browser's storage) so the new defaults take effect.

## Shared code

The tracker UI and maths are shared with the car loan (`src/tools/_shared/loan/`). Change fee rules per loan in each tool's `config.js`, not in the shared code.
