import { useMemo, useState } from "react";
import { useCloudState } from "../../lib/useCloudState.js";
import {
  EVERY,
  STORAGE_KEY,
  countdowns,
  dates,
  daysUntil,
  emptyState,
  inDays,
  next,
  parseISO,
  shapeState,
  startOfToday,
  toISO,
  totalPaid,
  unpaid,
} from "./schedule.js";
import "../_shared/loan/loan-tracker.css"; // header, tiles, chips, settings form
import "./rent-payday.css";

/**
 * Rent & Payday: countdowns to the next payday, the next rent payment, and the
 * co-tenant's next rent, plus tick-offs for each rent payment (yours and theirs).
 * Saved to the private Blob store as tools/rent-payday.json.
 */
const money = (() => {
  const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => "$" + nf.format(n);
})();
const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const AHEAD = 10; // upcoming dates listed (counting the next one due)
const RECENT = 12; // past dates shown before "Show older"

export default function RentPayday() {
  const { state, setState, status, statusText } = useCloudState({
    id: "rent-payday",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(false);
  const { payday, rent, cotenant } = state;
  const who = cotenant.name || "Co-tenant";

  const [cPay, cRent, cCo] = countdowns(state, today);
  const coOwing = unpaid(cotenant, today);
  const rentOwing = unpaid(rent, today);

  const tick = (part, iso, on) =>
    setState((st) => {
      const paid = { ...st[part].paid };
      if (on) paid[iso] = { on: toISO(new Date()), amount: Number(st[part].amount) || 0 };
      else delete paid[iso];
      return { ...st, [part]: { ...st[part], paid } };
    });
  const set = (part, patch) => setState((st) => ({ ...st, [part]: { ...st[part], ...patch } }));

  const gap = daysUntil(cPay.date, today) - daysUntil(cRent.date, today);

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Rent &amp; Payday</h1>
          <div className="sub">When you get paid, when rent's due, and whether {who} has paid</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn" type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit dates & amounts"}
          </button>
        </div>
      </header>

      {editing && <Settings state={state} set={set} />}

      <section className="rp-cards" aria-label="Countdowns">
        <Countdown c={cPay} tone="pay" sub={[payday.label, EVERY[payday.every]?.label.toLowerCase()].filter(Boolean).join(" · ")} amount={payday.amount ? money(Number(payday.amount)) : ""} />
        <Countdown
          c={cRent}
          tone="rent"
          sub={EVERY[rent.every]?.label}
          amount={money(Number(rent.amount) || 0)}
          note={rentOwing.length ? `${rentOwing.length} earlier rent payment${rentOwing.length > 1 ? "s" : ""} not ticked off` : ""}
          action={
            !rent.paid[toISO(cRent.date)] && (
              <button className="btn small" type="button" onClick={() => tick("rent", toISO(cRent.date), true)}>
                Mark paid
              </button>
            )
          }
          done={!!rent.paid[toISO(cRent.date)]}
        />
        <Countdown
          c={cCo}
          tone="co"
          sub={EVERY[cotenant.every]?.label}
          amount={money(Number(cotenant.amount) || 0)}
          note={coOwing.length ? `${who} owes ${money(coOwing.reduce((a, x) => a + x.amount, 0))} (${coOwing.length} payment${coOwing.length > 1 ? "s" : ""})` : `${who} is all paid up`}
          warn={coOwing.length > 0}
          action={
            !cotenant.paid[toISO(cCo.date)] && (
              <button className="btn small" type="button" onClick={() => tick("cotenant", toISO(cCo.date), true)}>
                Mark received
              </button>
            )
          }
          done={!!cotenant.paid[toISO(cCo.date)]}
          doneText="Received"
        />
      </section>

      {gap !== 0 && (
        <p className="note rp-gap">
          {gap > 0
            ? `Rent comes out ${gap} day${gap > 1 ? "s" : ""} before payday (${fmtDay(cRent.date)} vs ${fmtDay(cPay.date)}).`
            : `Payday lands ${-gap} day${gap < -1 ? "s" : ""} before rent is due.`}
        </p>
      )}

      <Ledger
        title={`${who}'s rent`}
        sched={cotenant}
        today={today}
        verb="Received"
        onTick={(iso, on) => tick("cotenant", iso, on)}
        tiles={[
          { k: "Received so far", v: money(totalPaid(cotenant)), c: "var(--ok)" },
          { k: "Owing now", v: money(coOwing.reduce((a, x) => a + x.amount, 0)), c: coOwing.length ? "var(--warn)" : "var(--muted)", of: coOwing.length ? `${coOwing.length} payment${coOwing.length > 1 ? "s" : ""} not ticked` : "All paid up" },
          { k: "Next due", v: fmtDay(cCo.date), c: "var(--accent)", of: `${money(Number(cotenant.amount) || 0)} · ${inDays(cCo.days)}` },
        ]}
      />

      <Ledger
        title="Your rent"
        sched={rent}
        today={today}
        verb="Paid"
        onTick={(iso, on) => tick("rent", iso, on)}
        tiles={[
          { k: "Paid so far", v: money(totalPaid(rent)), c: "var(--accent)" },
          { k: "Not ticked off", v: money(rentOwing.reduce((a, x) => a + x.amount, 0)), c: rentOwing.length ? "var(--warn)" : "var(--muted)", of: rentOwing.length ? `${rentOwing.length} payment${rentOwing.length > 1 ? "s" : ""}` : "All ticked off" },
          { k: "Next due", v: fmtDay(cRent.date), c: "var(--interest)", of: `${money(Number(rent.amount) || 0)} · ${inDays(cRent.days)}` },
        ]}
      />
    </div>
  );
}

/* ---------- sections ---------- */

function Countdown({ c, tone, sub, amount, note, warn, action, done, doneText = "Paid" }) {
  return (
    <div className={`rp-card rp-${tone}`} data-soon={c.days <= 2 && !done ? "1" : undefined} data-done={done ? "1" : undefined}>
      <span className="rp-label">{c.label}</span>
      <b className="rp-big">{done ? `${doneText} ✓` : c.days === 0 ? "Today" : c.days === 1 ? "Tomorrow" : `${c.days} days`}</b>
      <span className="rp-date">
        {fmtDay(c.date)}
        {amount && <span className="num"> · {amount}</span>}
      </span>
      {sub && <span className="rp-sub">{sub}</span>}
      {(note || action || done) && (
        <span className="rp-foot">
          {done && <span className="rp-sub">Due {c.days === 0 ? "today" : inDays(c.days)}</span>}
          {note && <span className={warn ? "rp-warn" : "rp-sub"}>{note}</span>}
          {action}
        </span>
      )}
    </div>
  );
}

function Ledger({ title, sched, today, verb, onTick, tiles }) {
  const [all, setAll] = useState(false);
  const rows = dates(sched, today, AHEAD); // newest first: upcoming, then past
  const limit = rows.filter((d) => d >= today).length + RECENT;
  const shown = all ? rows : rows.slice(0, limit);
  const nextDue = next(sched, today);
  return (
    <section className="stack" aria-label={title}>
      <h2>{title}</h2>
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.k} className="tile" style={{ "--c": t.c }}>
            <span className="k">{t.k}</span>
            <span className="v num">{t.v}</span>
            {t.of && <span className="of">{t.of}</span>}
          </div>
        ))}
      </div>
      <ul className="rp-ledger">
        {shown.map((d) => {
          const iso = toISO(d);
          const p = sched.paid[iso];
          const future = d > today;
          const late = !p && !future;
          const state = p ? "paid" : late ? "late" : +d === +nextDue ? "next" : "future";
          return (
            <li key={iso} data-s={state}>
              <label>
                <input type="checkbox" checked={!!p} onChange={(e) => onTick(iso, e.target.checked)} />
                <span className="rp-when">
                  <b>{fmtDay(d)}</b>
                  <small>{d.getFullYear()}</small>
                </span>
              </label>
              <span className="num rp-amt">{money(p ? Number(p.amount) || 0 : Number(sched.amount) || 0)}</span>
              <span className="rp-state">
                {p ? `${verb} ${fmtDate(parseISO(p.on))}` : late ? "Not ticked off" : state === "next" ? `Due ${inDays(daysUntil(d, today))}` : "Upcoming"}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button className="btn small rp-more" type="button" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show older (${rows.length - limit})`}
        </button>
      )}
    </section>
  );
}

function Settings({ state, set }) {
  const { payday, rent, cotenant } = state;
  const every = (part, v) => (
    <select value={v} onChange={(e) => set(part, { every: e.target.value })}>
      {Object.entries(EVERY).map(([k, e]) => (
        <option key={k} value={k}>
          {e.label}
        </option>
      ))}
    </select>
  );
  const num = (part, v) => (
    <input type="number" inputMode="decimal" min="0" step="0.01" value={v} onChange={(e) => set(part, { amount: e.target.value === "" ? "" : Number(e.target.value) })} />
  );
  const date = (part, v) => <input type="date" value={v} onChange={(e) => e.target.value && set(part, { from: e.target.value })} />;

  return (
    <form className="settings rp-settings" onSubmit={(e) => e.preventDefault()}>
      <h2 className="full-row">Payday</h2>
      <label>
        Paid by
        <input value={payday.label} onChange={(e) => set("payday", { label: e.target.value })} placeholder="e.g. Sonder" />
      </label>
      <label>
        A payday (any past or future one)
        {date("payday", payday.from)}
      </label>
      <label>How often{every("payday", payday.every)}</label>
      <label>
        <span>Pay amount ($) <span className="opt">(optional)</span></span>
        {num("payday", payday.amount)}
      </label>

      <h2 className="full-row">Your rent</h2>
      <label>
        First rent date to track
        {date("rent", rent.from)}
      </label>
      <label>How often{every("rent", rent.every)}</label>
      <label>Amount ($){num("rent", rent.amount)}</label>

      <h2 className="full-row">Co-tenant's rent</h2>
      <label>
        Name
        <input value={cotenant.name} onChange={(e) => set("cotenant", { name: e.target.value })} />
      </label>
      <label>
        First rent date to track
        {date("cotenant", cotenant.from)}
      </label>
      <label>How often{every("cotenant", cotenant.every)}</label>
      <label>Amount ($){num("cotenant", cotenant.amount)}</label>
      <p className="note full-row">
        Changing an amount only affects payments you tick from now on; ones already ticked keep the amount they were ticked at.
      </p>
    </form>
  );
}
