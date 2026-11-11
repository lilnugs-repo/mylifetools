import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, buildSchedule, summarise, payout, toISO } from "./loan.js";
import "./car-loan.css";

const STORAGE_KEY = "tools:car-loan:v1";
const LEGACY_KEY = "loan-tracker-v1"; // earlier standalone version

const money = (n) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

function loadState() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY));
    if (v && v.settings) return { settings: { ...DEFAULTS, ...v.settings }, paid: v.paid || {} };
  } catch {}
  return { settings: { ...DEFAULTS }, paid: {} };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function CarLoanTracker() {
  const [state, setState] = useState(loadState);
  const [showSettings, setShowSettings] = useState(false);
  const [saved, setSaved] = useState(true);
  const today = useMemo(startOfToday, []);
  const { settings: s, paid } = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [state]);

  const rows = useMemo(() => buildSchedule(s), [s]);
  const totals = useMemo(() => summarise(rows, paid), [rows, paid]);
  const po = useMemo(() => payout(s, rows, paid, today), [s, rows, paid, today]);
  const next = rows.find((r) => !paid[r.n]);
  const paidCount = rows.length - rows.filter((r) => !paid[r.n]).length;
  const overdue = rows.filter((r) => !paid[r.n] && r.due < today);

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
          <h1>My Car Loan Tracker</h1>
          <div className="sub num">
            {money(s.principal)} · {s.rate}% p.a. · {s.term / 12} years · {money(s.fee)}/mo fee
          </div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={saved ? "saved" : "local"}>
            {saved ? "Saved on this device" : "Can't save in this browser"}
          </span>
          <button className="btn" type="button" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            Loan details
          </button>
        </div>
      </header>

      {showSettings && <Settings settings={s} onChange={updateSetting} state={state} setState={setState} />}

      <NowCard s={s} next={next} overdue={overdue} today={today} onPay={() => next && togglePaid(next.n, true)} />

      <div className="card-progress">
        <div className="bar" role="progressbar" aria-label="Principal repaid" aria-valuenow={Math.round((totals.principalPaid / s.principal) * 100)}>
          <i style={{ width: `${(totals.principalPaid / s.principal) * 100}%` }} />
        </div>
        <div className="bar-legend num">
          <span>
            {paidCount} of {s.term} paid · {((totals.principalPaid / s.principal) * 100).toFixed(1)}% of principal
          </span>
          <span>Balance {money(po.balance)}</span>
        </div>
      </div>

      <section className="tiles" aria-label="Paid so far">
        <Tile label="Principal paid" color="var(--accent)" value={totals.principalPaid} of={`of ${money(s.principal)}`} />
        <Tile label="Interest paid" color="var(--interest)" value={totals.interestPaid} of={`of ${money(totals.interestTotal)} over full term`} />
        <Tile label="Account fees paid" color="var(--muted)" value={totals.feesPaid} of={`of ${money(s.fee * s.term)} over full term`} />
      </section>

      <Payout po={po} s={s} />

      <section className="stack">
        <h2>Repayment schedule</h2>
        <Schedule rows={rows} paid={paid} next={next} today={today} onToggle={togglePaid} />
      </section>
    </div>
  );
}

function NowCard({ s, next, overdue, today, onPay }) {
  if (!next) {
    return (
      <section className="now">
        <div className="cycle">
          <b className="num">Loan repaid</b>
          <span className="chip">All {s.term} payments made</span>
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
            Payment {next.n} of {s.term}
          </b>
          <span className={`chip${late ? " late" : ""}`}>
            {late ? `Overdue · ${overdue.length} unpaid` : daysAway <= 7 ? "Due this week" : "On track"}
          </span>
        </div>
        <div className="due">
          <div className="cycle">Due {fmtDate(next.due)}</div>
          <div className="amt num">{money(next.payment + next.fee)}</div>
          <div className="split num">
            {money(next.principal)} principal · {money(next.interest)} interest · {money(next.fee)} fee
          </div>
        </div>
      </div>
      <button className="pay-btn" type="button" onClick={onPay}>
        Mark payment {next.n} as paid
      </button>
    </section>
  );
}

function Tile({ label, color, value, of }) {
  return (
    <div className="tile" style={{ "--c": color }}>
      <span className="k">{label}</span>
      <span className="v num">{money(value)}</span>
      <span className="of num">{of}</span>
    </div>
  );
}

function Payout({ po, s }) {
  const lines = [
    ["Remaining balance", po.balance],
    [`Early termination fee (${po.months} full month${po.months === 1 ? "" : "s"}${po.etfWaived && po.balance > 0 ? ", waived" : ""})`, po.etf],
    ["Loan administration fee", po.admin],
    [`Break cost (est., ${s.swapFall}% swap rate fall, WARLT ${po.warlt.toFixed(2)} yrs)`, po.breakCost],
  ];
  return (
    <section className="payout" aria-label="Payout if you finished today">
      <div className="payout-head">
        <h2>If you paid it out today</h2>
        <span className="payout-total num">{money(po.total)}</span>
      </div>
      <div className="lines num">
        {lines.map(([k, v]) => (
          <div className="line" key={k}>
            <span>{k}</span>
            <span>{money(v)}</span>
          </div>
        ))}
      </div>
      <p className="note">
        Break cost is an estimate using the swap rate fall set in Loan details, assuming payments were made on time. The
        lender's real figure depends on actual wholesale swap rates and is $0 if they haven't fallen since the loan started.
      </p>
    </section>
  );
}

function Schedule({ rows, paid, next, today, onToggle }) {
  const years = [];
  for (let i = 0; i < rows.length; i += 12) years.push(rows.slice(i, i + 12));
  return (
    <div className="stack">
      {years.map((yr, idx) => (
        <YearGroup key={idx} year={idx + 1} rows={yr} paid={paid} next={next} today={today} onToggle={onToggle} />
      ))}
    </div>
  );
}

function YearGroup({ year, rows, paid, next, today, onToggle }) {
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

const FIELDS = [
  { k: "principal", label: "Loan amount ($)", type: "number", step: "0.01", min: 1 },
  { k: "rate", label: "Interest rate (% p.a.)", type: "number", step: "0.01", min: 0 },
  { k: "term", label: "Term", type: "select" },
  { k: "fee", label: "Monthly account fee ($)", type: "number", step: "0.01", min: 0 },
  { k: "start", label: "Loan start date", type: "date" },
  { k: "swapFall", label: "Swap rate fall for break cost (%)", type: "number", step: "0.1", min: 0 },
  { k: "swapNow", label: "Swap rate at payout (%)", type: "number", step: "0.1", min: 0 },
];

function Settings({ settings, onChange, state, setState }) {
  const [armed, setArmed] = useState(false);
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const commit = (f, raw) => {
    if (f.type === "date") {
      if (raw) onChange(f.k, raw);
      return;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < f.min || (f.min === 1 && v <= 0)) return;
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
    a.download = `loan-tracker-${toISO(new Date())}.json`;
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
      setState({ settings: { ...DEFAULTS, ...v.settings }, paid: v.paid || {} });
      setMsg("Backup restored.");
    } catch {
      setMsg("That file isn't a loan tracker backup.");
    }
  };

  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      {FIELDS.map((f) => (
        <label key={f.k}>
          {f.label}
          {f.type === "select" ? (
            <select id={`f-${f.k}`} value={settings.term} onChange={(e) => commit({ ...f, min: 1 }, e.target.value)}>
              {[36, 48, 60, 72, 84].map((m) => (
                <option key={m} value={m}>
                  {m / 12} years ({m})
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`f-${f.k}`}
              type={f.type}
              step={f.step}
              min={f.min}
              defaultValue={settings[f.k]}
              key={`${f.k}-${settings[f.k]}`}
              onBlur={(e) => commit(f, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commit(f, e.currentTarget.value)}
            />
          )}
        </label>
      ))}
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
