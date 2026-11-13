# My Home Loan Tracker: notes

## Currency: always Nrs.

- This tool shows every amount in **Nepalese rupees, written `Nrs.`** (e.g. `Nrs. 20,908.00`).
- **Never use `$`** here, including in labels, exports or any new feature added later.
- The currency is set once in `config.js` (`currency: { symbol: "Nrs. ", locale: "en-IN" }`). Every amount on screen goes through that, so don't hard-code a symbol anywhere else.
- `en-IN` number formatting is used for lakh/crore grouping (`Nrs. 1,00,000.00`). Switch to `en-US` if you prefer `Nrs. 100,000.00`.

## Loan figures (from the bank statement)

The figures in `config.js` were taken from the bank's payment statement covering EMIs up to 20 Dec 2025:

| Setting | Value | How it was found |
|---|---|---|
| Loan amount | Nrs. 1,43,00,000 | Statement balance plus every principal payment adds up to exactly this |
| Contracted rate and term | 13.60% over 192 months (16 years) | The only round combination that gives the EMI of Nrs. 1,83,103.86 to the paisa |
| Start date | 20 Apr 2023 | First EMI 20 May 2023, then the 20th of each month. An interest-only charge of Nrs. 58,351.84 on 20 Apr 2023 (about 11 days from disbursement, around 9 Apr) isn't in the schedule |
| Monthly account fee | Nrs. 0 | None on the statement |
| Rate changes | 33 entries, 13.46% → 8.23% | Worked back from each EMI's interest (see below) |
| Paid | EMIs 1–32 ticked | All collected on their due dates per the statement |

With these, the tracker reproduces the statement's interest to within Nrs. 0.56 a month, and its balance after EMI 32 is Nrs. 1.61 off the bank's Nrs. 1,23,13,478.20.

**Still placeholders** (copied from the car loan): the admin fee and early termination fee in `rules`. Replace them with the bank's real prepayment charge.

**No break cost.** `breakCost` is `false`: the car loan's swap-rate break cost is for fixed-rate loans and doesn't apply to this variable-rate loan, so it's left out of the payout estimate and the swap-rate fields are hidden.

If saved data in the Blob store still holds the old placeholder loan (Nrs. 20,908 starting 1 Dec 2026), the app replaces it with these figures automatically. Otherwise saved figures win over `config.js`; change them under **Loan details**.

## Shared code

The tracker UI and maths are shared with the car loan (`src/tools/_shared/loan/`). Change fee rules per loan in each tool's `config.js`, not in the shared code.

## Variable interest rate

The bank charges a variable rate, and the tracker follows how it handles a change:

- **The EMI stays the same.** A lower rate pays the loan off sooner and a higher one later (`onRateChange: "keep-payment"`). The header shows the expected length, e.g. "10 years 3 months (was 16 years)".
- **Interest accrues daily**, balance × rate × days / 365 (`dayCount: "actual/365"`), so months with 31 days cost more than months with 30. A rate change applies from its date, so a month that spans a change is charged each rate for its own days.
- **Contracted interest rate** and **Contracted term** under **Loan details** set the EMI only. The rates actually charged are the **Interest rate changes** list.
- When the bank changes the rate, add the date and the new rate under **Interest rate changes**. To work out a rate from a statement: interest ÷ (balance before the payment × days in the period ÷ 365).
- Changes are saved in the loan's settings as `rateChanges: [{ from: "YYYY-MM-DD", rate }]`, so they're stored in the Blob store and included in exported backups.
