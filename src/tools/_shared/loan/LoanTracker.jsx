import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  buildSchedule,
  fullMonthsBetween,
  paymentToClear,
  rateChanges,
  rateToClear,
  runDown,
  summarise,
  payout,
  projectToDate,
  parseISO,
  toISO,
} from "./loan.js";
import { useCloudState } from "../../../lib/useCloudState.js";
import "./loan-tracker.css";

/**
 * Generic loan tracker. Each tool passes a config (see src/tools/<tool>/config.js):
 *   id, title, storageKey, legacyKeys?, currency: { symbol, locale }, defaults, rules, termOptions, variableRate?
 * variableRate: true lets the rate change over time (settings.rateChanges = [{ from, rate }]).
 * onRateChange: "keep-term" (default) | "keep-payment"; dayCount: "monthly" (default) | "actual/365". See loan.js.
 * goalPlanner?: true shows "Pay-off goal" in place of "Check a date".
 * defaultPaid?: repayments already ticked for a new tracker; isPlaceholder?(settings): saved settings to replace with defaults.
 * State is saved to the private Blob store via /api/state, cached locally for offline use.
 */
export default function LoanTracker({ config }) {
  const { id, title, storageKey, legacyKeys = [], currency, defaults, rules, termOptions, variableRate = false } = config;
  const { onRateChange = "keep-term", dayCount = "monthly", defaultPaid = {}, isPlaceholder, goalPlanner = false } = config;
  const keepPayment = onRateChange === "keep-payment";

  const money = useMemo(() => makeMoney(currency), [currency]);
  const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const shape = useMemo(
    () => (v) => {
      if (!v.settings) return null;
      if (isPlaceholder?.(v.settings)) return { settings: { ...defaults }, paid: { ...defaultPaid } };
      return { settings: { ...defaults, ...v.settings }, paid: v.paid || {} };
    },
    [defaults, defaultPaid, isPlaceholder]
  );
  const { state, setState, status, statusText } = useCloudState({
    id,
    storageKey,
    legacyKeys,
    shape,
    empty: { settings: { ...defaults }, paid: { ...defaultPaid } },
  });
  const [showSettings, setShowSettings] = useState(false);
  const today = useMemo(startOfToday, []);
  const { settings: s, paid } = state;

  const rows = useMemo(() => buildSchedule(s, { onRateChange, dayCount }), [s, onRateChange, dayCount]);
  const count = rows.length; // can differ from s.term when the repayment stays fixed
  const totals = useMemo(() => summarise(rows, paid), [rows, paid]);
  const po = useMemo(() => payout(s, rows, paid, today, rules), [s, rows, paid, today, rules]);
  const next = rows.find((r) => !paid[r.n]);
  const paidCount = rows.filter((r) => paid[r.n]).length;
  const overdue = rows.filter((r) => !paid[r.n] && r.due < today);
  const pct = (totals.principalPaid / s.principal) * 100;
  // Rate charged for the period we're in today (not the oldest unticked payment)
  const currentRow = rows.find((r) => r.due >= today) ?? rows[rows.length - 1];
  const currentRate = currentRow?.rate ?? s.rate;

  const togglePaid = (n, on) =>
    setState((st) => {
      const p = { ...st.paid };
      if (on) p[n] = toISO(new Date());
      else delete p[n];
      return { ...st, paid: p };
    });

  const updateSetting = (k, v) =>
    setState((st) => {
      const settings = { ...st.settings, [k]: v };
      const p = { ...st.paid };
      if (k === "term") for (const n in p) if (Number(n) > v) delete p[n];
      return { settings, paid: p };
    });

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>{title}</h1>
          <div className="sub num">
            {money(s.principal)} · {fmtRate(currentRate)} p.a.{variableRate ? " variable" : ""} · {fmtYears(count)}{keepPayment && count !== s.term ? ` (was ${fmtYears(s.term)})` : ""} ·{" "}
            {money(rows[0]?.payment ?? 0)}/mo{s.fee ? ` + ${money(s.fee)} fee` : ""}
          </div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn" type="button" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            Loan details
          </button>
        </div>
      </header>

      {showSettings && (
        <Settings
          settings={s}
          onChange={updateSetting}
          state={state}
          setState={setState}
          defaults={defaults}
          currency={currency}
          termOptions={termOptions}
          rules={rules}
          storageKey={storageKey}
          variableRate={variableRate}
          keepPayment={keepPayment}
          daily={dayCount === "actual/365"}
          firstPayment={rows[0]?.payment ?? 0}
          money={money}
        />
      )}

      {variableRate && <Outlook s={s} rows={rows} current={currentRow} next={next} paidCount={paidCount} today={today} keepPayment={keepPayment} />}

      <NowCard s={s} count={count} variableRate={variableRate} next={next} overdue={overdue} today={today} money={money} fmtDate={fmtDate} onPay={() => next && togglePaid(next.n, true)} />

      <div className="card-progress">
        <div className="bar" role="progressbar" aria-label="Principal repaid" aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="bar-legend num">
          <span>
            {paidCount} of {count} paid · {pct.toFixed(1)}% of principal
          </span>
          <span>Balance {money(po.balance)}</span>
        </div>
      </div>

      <section className="tiles" aria-label="Paid so far">
        <Tile label="Principal paid" color="var(--accent)" value={money(totals.principalPaid)} of={`of ${money(s.principal)}`} />
        <Tile label="Interest paid" color="var(--interest)" value={money(totals.interestPaid)} of={`of ${money(totals.interestTotal)} over full term`} />
        <Tile label="Account fees paid" color="var(--muted)" value={money(totals.feesPaid)} of={`of ${money(s.fee * count)} over full term`} />
      </section>

      <Payout heading="If you paid it out today" po={po} s={s} rules={rules} money={money} />

{goalPlanner ? (
        <GoalPlanner
          s={s}
          rows={rows}
          current={currentRow}
          keepPayment={keepPayment}
          opts={{ onRateChange, dayCount }}
          money={money}
          fmtDate={fmtDate}
          onGoal={(v) => updateSetting("goal", v)}
        />
      ) : (
        <DateCheck s={s} rows={rows} rules={rules} money={money} fmtDate={fmtDate} storageKey={storageKey} />
      )}

      <section className="stack">
        <h2>Repayment schedule</h2>
        <Schedule rows={rows} variableRate={variableRate} paid={paid} next={next} today={today} money={money} fmtDate={fmtDate} onToggle={togglePaid} />
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

function makeMoney({ symbol, locale }) {
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => (n < 0 ? "−" : "") + symbol + nf.format(Math.abs(n));
}

const fmtRate = (r) => `${Number(Number(r).toFixed(2))}%`;

function fmtYears(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y ? `${y} year${y === 1 ? "" : "s"}` : "";
  const ms = m ? `${m} month${m === 1 ? "" : "s"}` : "";
  return [ys, ms].filter(Boolean).join(" ");
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ---------- sections ---------- */

function NowCard({ s, count, variableRate, next, overdue, today, money, fmtDate, onPay }) {
  if (!next) {
    return (
      <section className="now">
        <div className="cycle">
          <b className="num">Loan repaid</b>
          <span className="chip">All {count} payments made</span>
        </div>
      </section>
    );
  }
  const late = next.due < today;
  const daysAway = (next.due - today) / 864e5;
  return (
    <section className="now" aria-label="This payment cycle">
      <div className="now-top">
        <div className="cycle">
          <span>Current payment</span>
          <b className="num">
            Payment {next.n} of {count}
          </b>
          <span className={`chip${late ? " late" : ""}`}>
            {late ? `Overdue · ${overdue.length} unpaid` : daysAway <= 7 ? "Due this week" : "On track"}
          </span>
        </div>
        <div className="due">
          <div className="cycle">Due {fmtDate(next.due)}</div>
          <div className="amt num">{money(next.payment + next.fee)}</div>
          <div className="split num">
            {money(next.principal)} principal · {money(next.interest)} interest{variableRate ? ` at ${fmtRate(next.rate)}` : ""} ·{" "}
            {money(next.fee)} fee
          </div>
        </div>
      </div>
      <button className="pay-btn" type="button" onClick={onPay}>
        Mark payment {next.n} as paid
      </button>
    </section>
  );
}

/** Headline for variable-rate loans: the rate now, and when the loan ends if it stays there. */
function Outlook({ s, rows, current, next, paidCount, today, keepPayment }) {
  const last = rows[rows.length - 1];
  const rate = current.rate;

  // When the current rate took effect, and how far it has moved since the first repayment
  const changes = rateChanges(s);
  const since = changes.filter((c) => c.from < current.due).pop()?.from ?? parseISO(s.start);
  const futureChanges = changes.some((c) => c.from >= current.due);
  const firstRate = rows[0].rate;
  const moved = Math.round((rate - firstRate) * 100) / 100;

  const contractEnd = addMonths(parseISO(s.start), s.term);
  const diff = s.term - rows.length; // > 0: ends early
  const left = rows.length - paidCount;
  const untilEnd = fullMonthsBetween(today, last.due);

  return (
    <section className="outlook" aria-label="Interest rate and pay-off outlook">
      <div className="outlook-cell">
        <span className="k">Current interest rate</span>
        <span className="v num">{fmtRate(rate)} p.a.</span>
        <span className="of num">
          Since {fmtMonth(since)}
          {moved !== 0 && (
            <>
              {" · "}
              <b className={moved < 0 ? "good" : "bad"}>
                {moved < 0 ? "▼" : "▲"} {Math.abs(moved).toFixed(2)} points
              </b>{" "}
              from {fmtRate(firstRate)} at the start
            </>
          )}
        </span>
      </div>
      <div className="outlook-cell">
        <span className="k">{next ? "Paid off by" : "Paid off"}</span>
        <span className="v num">{fmtMonth(last.due)}</span>
        <span className="of num">
          {next ? (
            <>
              {untilEnd > 0 ? `In ${fmtYears(untilEnd)}` : "This month"} · {left} payment{left === 1 ? "" : "s"} left
            </>
          ) : (
            "All payments made"
          )}
        </span>
        {keepPayment && (
          <span className={`chip${diff < 0 ? " late" : ""}`}>
            {diff > 0 ? `${fmtYears(diff)} earlier than the full term` : diff < 0 ? `${fmtYears(-diff)} later than the full term` : "Right on the full term"}
          </span>
        )}
        <span className="of">
          {keepPayment ? `Full term: ${fmtYears(s.term)}, ending ${fmtMonth(contractEnd)}. ` : ""}
          {next
            ? futureChanges
              ? "Includes the future rate changes you've entered, with every repayment made on time."
              : `Assumes the rate stays at ${fmtRate(rate)} and every repayment is made on time.`
            : ""}
        </span>
      </div>
    </section>
  );
}

function Tile({ label, color, value, of }) {
  return (
    <div className="tile" style={{ "--c": color }}>
      <span className="k">{label}</span>
      <span className="v num">{value}</span>
      <span className="of num">{of}</span>
    </div>
  );
}

function payoutLines(po, s, rules, money) {
  const lines = [
    ["Remaining balance", po.balance],
    [`Early termination fee (${po.months} full month${po.months === 1 ? "" : "s"}${po.etfWaived && po.balance > 0 ? ", waived" : ""})`, po.etf],
    ["Loan administration fee", po.admin],
  ];
  if (rules.breakCost) lines.push([`Break cost (est., ${s.swapFall}% swap rate fall, WARLT ${po.warlt.toFixed(2)} yrs)`, po.breakCost]);
  return lines.map(([k, v]) => (
    <div className="line" key={k}>
      <span>{k}</span>
      <span>{money(v)}</span>
    </div>
  ));
}

function Payout({ heading, po, s, rules, money }) {
  return (
    <section className="payout" aria-label={heading}>
      <div className="payout-head">
        <h2>{heading}</h2>
        <span className="payout-total num">{money(po.total)}</span>
      </div>
      <div className="lines num">{payoutLines(po, s, rules, money)}</div>
      {rules.breakCost && (
        <p className="note">
          Break cost is an estimate using the swap rate fall set in Loan details, assuming payments were made on time. The
          lender's real figure depends on actual wholesale swap rates and is zero if they haven't fallen since the loan started.
        </p>
      )}
    </section>
  );
}

const fmtMonth = (d) => d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
const toMonthISO = (d) => toISO(d).slice(0, 7);

/**
 * "Pay-off goal": pick the month to be done by, and see the extra repayment needed at
 * today's rate, or how far the rate would have to fall with the repayment unchanged.
 * Works from the repayment due now, assuming every earlier one is made on time.
 */
function GoalPlanner({ s, rows, current, keepPayment, opts, money, fmtDate, onGoal }) {
  if (!current || current.n === rows.length) {
    return (
      <section className="check" aria-label="Pay-off goal">
        <h2>Pay-off goal</h2>
        <p className="note">{current ? "Only the final repayment is left." : "The loan is repaid."}</p>
      </section>
    );
  }

  const after = current.n - 1; // repayments already due before this one
  const bal = after ? rows[after - 1].balance : s.principal;
  const rate = current.rate;
  const emi = keepPayment ? rows[0].payment : current.payment;

  // Plan if nothing changes: today's rate and repayment from here on
  const plan = runDown(s, opts, bal, after, rate, emi);
  const planEnd = addMonths(parseISO(s.start), after + plan.months);

  const fallback = toMonthISO(addMonths(planEnd, -24));
  const goalISO = /^\d{4}-\d{2}$/.test(s.goal || "") ? s.goal : fallback;
  const goal = parseISO(`${goalISO}-01`);
  const n = monthIndex(goal) - monthIndex(current.due) + 1; // repayments up to and including the goal month
  const sooner = plan.months - n;

  const quick = [1, 2, 3, 5].filter((y) => plan.months - y * 12 >= 1);

  let body;
  if (n < 1) {
    body = <p className="note">Pick a month from {fmtMonth(current.due)} onwards: that repayment is the next one due.</p>;
  } else if (sooner <= 0) {
    body = (
      <p className="goal-ok">
        You're already on track. At {fmtRate(rate)} with the current repayment the loan is paid off in{" "}
        <b>{fmtMonth(planEnd)}</b>
        {sooner < 0 ? `, ${fmtYears(-sooner)} before your goal` : ", right on your goal"}.
      </p>
    );
  } else {
    const pmt = paymentToClear(s, opts, bal, after, rate, n);
    const extra = Math.max(0, pmt - emi);
    const saved = plan.interest - runDown(s, opts, bal, after, rate, pmt, n).interest;
    const need = rateToClear(s, opts, bal, after, emi, n, rate);
    const zeroMonths = runDown(s, opts, bal, after, 0, emi).months;
    body = (
      <div className="check-grid">
        <div className="check-cell">
          <span className="k">Pay extra each month</span>
          <span className="v num">+{money(extra)}</span>
          <span className="of num">
            {money(pmt)} a month instead of {money(emi)}, at today's {fmtRate(rate)}. Saves about {money(saved)} in interest.
          </span>
        </div>
        <div className="check-cell">
          <span className="k">Or the rate would need to fall to</span>
          {need == null ? (
            <>
              <span className="v num">Not possible</span>
              <span className="of num">
                Even at 0% a repayment of {money(emi)} lasts until{" "}
                {fmtMonth(addMonths(parseISO(s.start), after + zeroMonths))}. You'd need to pay more.
              </span>
            </>
          ) : (
            <>
              <span className="v num">{fmtRate(need)} p.a.</span>
              <span className="of num">
                <b className="good">▼ {(Math.round((rate - need) * 100) / 100).toFixed(2)} points</b> from {fmtRate(rate)}, from now
                until then, keeping the repayment at {money(emi)}.
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="check" aria-label="Pay-off goal">
      <div className="payout-head">
        <h2>Pay-off goal</h2>
        <div className="check-controls">
          {quick.map((y) => (
            <button key={y} type="button" className="btn small" onClick={() => onGoal(toMonthISO(addMonths(planEnd, -12 * y)))}>
              {y} yr{y === 1 ? "" : "s"} sooner
            </button>
          ))}
          <input
            id="goal-month"
            type="month"
            min={toMonthISO(current.due)}
            value={goalISO}
            onChange={(e) => e.target.value && onGoal(e.target.value)}
            aria-label="Goal pay-off month"
          />
        </div>
      </div>
      <p className="goal-summary">
        Debt-free by <b>{fmtMonth(goal)}</b>
        {n >= 1 && (
          <>
            {" "}
            · {n} repayment{n === 1 ? "" : "s"} from {fmtMonth(current.due)}
            {sooner > 0 ? ` · ${fmtYears(sooner)} sooner than the current plan (${fmtMonth(planEnd)})` : ""}
          </>
        )}
      </p>
      {body}
      <p className="note">
        Starts from {money(bal)} owing before payment {current.n} (due {fmtDate(current.due)}), assuming every repayment before it
        is made on time. The extra payment uses today's {fmtRate(rate)} for every month to the goal. Extra payments assume the bank puts them
        straight onto the principal: check whether it charges a prepayment fee.
      </p>
    </section>
  );
}

/** "Check a date": repayment due and payout figure on any chosen date. */
function DateCheck({ s, rows, rules, money, fmtDate, storageKey }) {
  const dateKey = `${storageKey}:check-date`;
  const [iso, setIso] = useState(() => {
    try {
      const v = localStorage.getItem(dateKey);
      if (v) return v;
    } catch {}
    return toISO(addMonths(parseISO(s.start), 24));
  });
  useEffect(() => {
    try { localStorage.setItem(dateKey, iso); } catch {}
  }, [iso, dateKey]);

  const date = iso ? parseISO(iso) : null;
  const start = parseISO(s.start);
  const valid = date && !Number.isNaN(date.getTime());
  const p = valid && date >= start ? projectToDate(s, rows, date, rules) : null;

  const quick = [12, 24, 36].filter((m) => m < rows.length);

  return (
    <section className="check" aria-label="Check a date">
      <div className="payout-head">
        <h2>Check a date</h2>
        <div className="check-controls">
          {quick.map((m) => (
            <button key={m} type="button" className="btn small" onClick={() => setIso(toISO(addMonths(start, m)))}>
              {m} mo
            </button>
          ))}
          <input id="check-date" type="date" value={iso} onChange={(e) => setIso(e.target.value)} aria-label="Date to check" />
        </div>
      </div>

      {!p && <p className="note">Pick a date on or after the loan start ({fmtDate(start)}).</p>}

      {p && (
        <>
          <div className="check-grid">
            <div className="check-cell">
              <span className="k">Repayment due</span>
              {p.nextDue ? (
                <>
                  <span className="v num">{money(p.nextDue.payment + p.nextDue.fee)}</span>
                  <span className="of num">
                    Payment {p.nextDue.n} on {fmtDate(p.nextDue.due)}: {money(p.nextDue.principal)} principal ·{" "}
                    {money(p.nextDue.interest)} interest · {money(p.nextDue.fee)} fee
                  </span>
                </>
              ) : (
                <>
                  <span className="v num">{money(0)}</span>
                  <span className="of">Loan fully repaid by then</span>
                </>
              )}
            </div>
            <div className="check-cell">
              <span className="k">Paid by then</span>
              <span className="v num">{p.paidCount} of {rows.length}</span>
              <span className="of num">
                {money(p.principalPaid)} principal · {money(p.interestPaid)} interest · {money(p.feesPaid)} fees
              </span>
            </div>
          </div>
          <div className="payout-head">
            <span className="k-strong">Payout on {fmtDate(date)}</span>
            <span className="payout-total num">{money(p.payout.total)}</span>
          </div>
          <div className="lines num">{payoutLines(p.payout, s, rules, money)}</div>
          <p className="note">Assumes every repayment due up to this date is paid on time at the scheduled amount.</p>
        </>
      )}
    </section>
  );
}

function Schedule({ rows, variableRate, paid, next, today, money, fmtDate, onToggle }) {
  const years = [];
  for (let i = 0; i < rows.length; i += 12) years.push(rows.slice(i, i + 12));
  return (
    <div className="stack">
      {years.map((yr, idx) => (
        <YearGroup key={idx} year={idx + 1} rows={yr} variableRate={variableRate} paid={paid} next={next} today={today} money={money} fmtDate={fmtDate} onToggle={onToggle} />
      ))}
    </div>
  );
}

function YearGroup({ year, rows, variableRate, paid, next, today, money, fmtDate, onToggle }) {
  const hasCurrent = !!next && rows.includes(next);
  const [open, setOpen] = useState(hasCurrent);
  const yPaid = rows.filter((r) => paid[r.n]).length;
  return (
    <details className="year" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="yl">Year {year}</span>
        <span className="ys num">
          {yPaid}/{rows.length} paid · {fmtDate(rows[0].due)} – {fmtDate(rows[rows.length - 1].due)}
        </span>
      </summary>
      <div className="tbl-wrap">
        <table className="num">
          <thead>
            <tr>
              <th>#</th>
              <th>Due</th>
              {variableRate && <th>Rate</th>}
              <th>Principal</th>
              <th>Interest</th>
              <th>Fee</th>
              <th>Balance</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isPaid = !!paid[r.n];
              const cls = [isPaid ? "paid" : next && r.n === next.n ? "cur" : "", !isPaid && r.due < today ? "late" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <tr key={r.n} className={cls}>
                  <td>{r.n}</td>
                  <td>{fmtDate(r.due)}</td>
                  {variableRate && <td className={r.rateChanged ? "rate-changed" : undefined}>{fmtRate(r.rate)}</td>}
                  <td>{money(r.principal)}</td>
                  <td className="int">{money(r.interest)}</td>
                  <td>{money(r.fee)}</td>
                  <td>{money(r.balance)}</td>
                  <td>
                    <input
                      id={`cb-${r.n}`}
                      type="checkbox"
                      className="cb"
                      checked={isPaid}
                      aria-label={`Payment ${r.n} paid`}
                      onChange={(e) => onToggle(r.n, e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Settings({ settings, onChange, state, setState, defaults, currency, termOptions, rules, storageKey, variableRate, keepPayment, daily, firstPayment, money }) {
  const [armed, setArmed] = useState(false);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");
  const cur = currency.symbol.trim();

  const fields = [
    { k: "principal", label: `Loan amount (${cur})`, type: "number", step: "0.01", min: 1 },
    {
      k: "rate",
      label: keepPayment ? "Contracted interest rate (% p.a.)" : variableRate ? "Starting interest rate (% p.a.)" : "Interest rate (% p.a.)",
      type: "number",
      step: "any",
      min: 0,
    },
    { k: "term", label: keepPayment ? "Contracted term (months)" : "Term (months)", type: "number", step: "1", min: 1, max: 600, integer: true, list: "term-options" },
    { k: "fee", label: `Monthly account fee (${cur})`, type: "number", step: "0.01", min: 0 },
    { k: "start", label: "Loan start date", type: "date" },
    ...(rules.breakCost
      ? [
          { k: "swapFall", label: "Swap rate fall for break cost (%)", type: "number", step: "0.1", min: 0 },
          { k: "swapNow", label: "Swap rate at payout (%)", type: "number", step: "0.1", min: 0 },
        ]
      : []),
  ];

  const commit = (f, raw) => {
    if (f.type === "date") {
      if (raw) onChange(f.k, raw);
      return;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < f.min || (f.min === 1 && v <= 0)) return;
    if (f.integer && !Number.isInteger(v)) return;
    if (f.max != null && v > f.max) return;
    onChange(f.k, v);
  };

  const clearTicks = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    setState((st) => ({ ...st, paid: {} }));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${storageKey.replace(/[^a-z0-9-]+/gi, "-")}-${toISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const v = JSON.parse(await file.text());
      if (!v.settings) throw new Error();
      setState({ settings: { ...defaults, ...v.settings }, paid: v.paid || {} });
      setMsg("Backup restored.");
    } catch {
      setMsg("That file isn't a loan backup.");
    }
  };

  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      {fields.map((f) => (
        <label key={f.k}>
          {f.label}
          <input
            id={`f-${f.k}`}
            type={f.type}
            step={f.step}
            min={f.min}
            max={f.max}
            list={f.list}
            defaultValue={settings[f.k]}
            key={`${f.k}-${settings[f.k]}`}
            onBlur={(e) => commit(f, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(f, e.currentTarget.value)}
          />
          {f.k === "term" && (
            <span className="hint">
              {fmtYears(settings.term)}
              {keepPayment ? ` · EMI ${money(firstPayment)}` : ""}
            </span>
          )}
        </label>
      ))}
      <datalist id="term-options">
        {termOptions.map((m) => (
          <option key={m} value={m}>
            {fmtYears(m)}
          </option>
        ))}
      </datalist>
      {variableRate && <RateChanges changes={settings.rateChanges || []} start={settings.start} keepPayment={keepPayment} daily={daily} onChange={(v) => onChange("rateChanges", v)} />}
      <div className="full">
        <span>First repayment falls one month after the start date. {msg}</span>
        <div className="head-actions">
          <button className="btn" type="button" onClick={exportData}>
            Export backup
          </button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
          <button className="btn danger" type="button" onClick={clearTicks}>
            {armed ? "Tap again to clear" : "Clear all ticks"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Variable-rate history: list, add and remove rate changes. */
function RateChanges({ changes, start, keepPayment, daily, onChange }) {
  const [from, setFrom] = useState("");
  const [rate, setRate] = useState("");
  const sorted = [...changes].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const rateOk = rate !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0;
  const canAdd = !!from && from >= start && rateOk;

  const add = () => {
    if (!canAdd) return;
    onChange([...changes.filter((c) => c.from !== from), { from, rate: Number(rate) }]);
    setFrom("");
    setRate("");
  };
  const remove = (c) => onChange(changes.filter((x) => x !== c));

  return (
    <div className="rate-changes">
      <span className="k-strong">Interest rate changes</span>
      {sorted.length === 0 && <p className="note">No changes yet: the starting rate applies for the whole term.</p>}
      {sorted.length > 0 && (
        <ul className="num">
          {sorted.map((c) => (
            <li key={c.from}>
              <span>From {parseISO(c.from).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
              <b>{c.rate}% p.a.</b>
              <button className="btn small" type="button" onClick={() => remove(c)} aria-label={`Remove rate change from ${c.from}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rate-add">
        <label>
          Changes on
          <input id="rc-from" type="date" min={start} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          New rate (% p.a.)
          <input
            id="rc-rate"
            type="number"
            step="any"
            min={0}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </label>
        <button className="btn" type="button" onClick={add} disabled={!canAdd}>
          Add change
        </button>
      </div>
      <p className="note">
        {daily
          ? "Interest is charged daily, so a new rate applies from its date."
          : "A new rate applies to repayments due after its date."}{" "}
        {keepPayment
          ? "The repayment stays the same, so a lower rate brings the end date forward and a higher one pushes it back."
          : "The repayment is recalculated so the loan still finishes on time."}
      </p>
    </div>
  );
}
