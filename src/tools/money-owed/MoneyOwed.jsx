import { useEffect, useMemo, useState } from "react";
import { icons } from "../../components/icons.jsx";
import { api } from "../../lib/api.js";
import { useCloudState } from "../../lib/useCloudState.js";
import {
  REMIND_EVERY,
  STORAGE_KEY,
  amountOf,
  canEmail,
  emptyState,
  lastReminder,
  newEntry,
  nextReminder,
  outstandingOf,
  parseISO,
  repaidOf,
  shapeState,
  startOfToday,
  status,
  summary,
  toISO,
} from "./owed.js";
import "../_shared/loan/loan-tracker.css"; // header, tiles, chips, forms
import "../utilities/utilities.css"; // card header and form rows
import "../big-buys/big-buys.css"; // facts row, inline forms, empty-state guide
import "./money-owed.css";

/**
 * Money Owed to Me: money you've lent, who has it, when it's due back, and what's
 * been repaid. Optionally emails the borrower when an entry is added, and reminds them
 * once the return date has passed (daily job in api/notify.js). Saved to the private
 * Blob store as tools/money-owed.json.
 */
const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => "$" + nf.format(n);
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fmtWhen = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function MoneyOwed() {
  const { state, setState, status: saveStatus, statusText } = useCloudState({
    id: "money-owed",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(null); // entry id, or "new"
  const [draft, setDraft] = useState(null);
  const [showSettled, setShowSettled] = useState(false);
  const [mail, setMail] = useState({ problem: null, log: {}, loaded: false });
  const [flash, setFlash] = useState(null); // { tone, text } after an email

  // Can emails reach other people, and what has the daily job already sent?
  useEffect(() => {
    let alive = true;
    api
      .owed({ action: "status" })
      .then((r) => alive && setMail({ problem: r.problem, log: r.log || {}, loaded: true }))
      .catch(() => alive && setMail((m) => ({ ...m, loaded: true })));
    return () => {
      alive = false;
    };
  }, []);

  const entries = state.entries;
  const sum = useMemo(() => summary(entries, today), [entries, today]);
  const withStatus = entries.map((e) => ({ e, st: status(e, today) }));
  const open = withStatus.filter((x) => x.st.state !== "settled").sort((a, b) => a.st.days - b.st.days); // most overdue first
  const settled = withStatus.filter((x) => x.st.state === "settled");

  const update = (id, patch) => setState((st) => ({ ...st, entries: st.entries.map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)) }));
  const remove = (id) => setState((st) => ({ ...st, entries: st.entries.filter((x) => x.id !== id) }));

  /** Email the borrower; records it on the entry. */
  const send = async (kind, e, me = state.me) => {
    setFlash({ tone: "busy", text: `Emailing ${e.name || "them"}…` });
    try {
      const r = await api.owed({ action: "send", kind, entry: e, me });
      update(e.id, (x) => ({ sent: [...(x.sent || []), { at: r.at, kind }] }));
      if (kind === "reminder") setMail((m) => ({ ...m, log: { ...m.log, [e.id]: { last: r.at, count: (m.log[e.id]?.count || 0) + 1 } } }));
      setFlash({ tone: "ok", text: `${kind === "new" ? "Note" : "Reminder"} sent to ${e.email}.` });
    } catch (err) {
      setFlash({
        tone: "err",
        text:
          err.error === "not_configured"
            ? err.detail
            : err.code === "offline" || err.code === "no_api"
              ? "Couldn't reach the server, so nothing was sent."
              : err.detail || "Couldn't send the email.",
      });
    }
  };

  const startNew = () => {
    setDraft({ ...newEntry(today), notifyNow: true });
    setEditing("new");
  };
  const startEdit = (e) => {
    setDraft({ ...e, notifyNow: false });
    setEditing(e.id);
  };
  const cancel = () => {
    setDraft(null);
    setEditing(null);
  };
  const save = ({ notifyNow, me, ...e }, isNew) => {
    setState((st) => ({
      ...st,
      ...(me !== undefined && { me }),
      entries: st.entries.some((x) => x.id === e.id) ? st.entries.map((x) => (x.id === e.id ? e : x)) : [e, ...st.entries],
    }));
    cancel();
    if (isNew && notifyNow && canEmail(e)) send("new", e, me ?? state.me);
  };

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Money Owed to Me</h1>
          <div className="sub">Who you've lent money to, when it's due back, and what's been repaid</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={saveStatus} role="status">
            {statusText}
          </span>
          <button className="btn primary" type="button" onClick={startNew} disabled={!!editing}>
            {icons.plus} Lend money
          </button>
        </div>
      </header>

      {flash && (
        <div className={`mo-flash mo-flash-${flash.tone}`} role="status">
          <span>{flash.text}</span>
          {flash.tone !== "busy" && (
            <button className="btn small" type="button" onClick={() => setFlash(null)}>
              OK
            </button>
          )}
        </div>
      )}

      {sum.open > 0 && (
        <section className="tiles" aria-label="Summary">
          <div className="tile" style={{ "--c": "var(--accent)" }}>
            <span className="k">Owed to you</span>
            <span className="v num">{money(sum.owed)}</span>
            <span className="of">
              {plural(sum.open, "loan")} · {sum.people === 1 ? "1 person" : `${sum.people} people`}
            </span>
          </div>
          <div className="tile" style={{ "--c": "var(--warn)" }}>
            <span className="k">Overdue</span>
            <span className="v num">{money(sum.overdue)}</span>
            <span className="of">{sum.overdueCount ? `${plural(sum.overdueCount, "loan")} past the return date` : "Nothing overdue"}</span>
          </div>
          <div className="tile" style={{ "--c": "var(--ok)" }}>
            <span className="k">Paid back</span>
            <span className="v num">{money(entries.reduce((a, e) => a + repaidOf(e) + (e.settledOn && !e.forgiven ? outstandingAfterPayments(e) : 0), 0))}</span>
            <span className="of">{plural(settled.length, "loan")} settled</span>
          </div>
        </section>
      )}

      {editing === "new" && draft && (
        <EntryForm draft={draft} setDraft={setDraft} me={state.me} onSave={(d) => save(d, true)} onCancel={cancel} isNew mailProblem={mail.problem} />
      )}

      {entries.length === 0 && editing !== "new" && (
        <section className="bb-guide mo-empty">
          <h2>Lent someone money?</h2>
          <p>
            Add who it was, how much and when it's due back. You can email them a note about it, and have reminders sent to them if the
            date passes.
          </p>
          <button className="btn primary" type="button" onClick={startNew}>
            {icons.plus} Lend money
          </button>
        </section>
      )}

      <div className="stack">
        {open.map(({ e, st }) =>
          editing === e.id ? (
            <EntryForm key={e.id} draft={draft} setDraft={setDraft} me={state.me} onSave={(d) => save(d, false)} onCancel={cancel} mailProblem={mail.problem} />
          ) : (
            <EntryCard
              key={e.id}
              e={e}
              st={st}
              today={today}
              busy={!!editing || flash?.tone === "busy"}
              serverLog={mail.log}
              mailProblem={mail.problem}
              me={state.me}
              onEdit={() => startEdit(e)}
              onUpdate={(patch) => update(e.id, patch)}
              onRemove={() => remove(e.id)}
              onSend={(kind) => send(kind, e)}
            />
          )
        )}
      </div>

      {settled.length > 0 && (
        <section className="mo-settled">
          <button className="btn small" type="button" aria-expanded={showSettled} onClick={() => setShowSettled((v) => !v)}>
            {showSettled ? "Hide" : "Show"} {plural(settled.length, "settled loan")}
          </button>
          {showSettled && (
            <div className="stack">
              {settled.map(({ e, st }) => (
                <EntryCard
                  key={e.id}
                  e={e}
                  st={st}
                  today={today}
                  busy={!!editing}
                  serverLog={mail.log}
                  mailProblem={mail.problem}
                  me={state.me}
                  onEdit={() => startEdit(e)}
                  onUpdate={(patch) => update(e.id, patch)}
                  onRemove={() => remove(e.id)}
                  onSend={() => {}}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** What was still owed when an entry was marked repaid (it's not in `payments`). */
const outstandingAfterPayments = (e) => Math.max(0, amountOf(e) - repaidOf(e));

function StatusChip({ st }) {
  if (st.state === "settled") return <span className="chip mo-chip-done">Settled</span>;
  if (st.state === "overdue") return <span className="chip mo-chip-late">Overdue {st.days === -1 ? "1 day" : `${-st.days} days`}</span>;
  if (st.state === "soon") return <span className="chip mo-chip-soon">{st.days === 0 ? "Due today" : st.days === 1 ? "Due tomorrow" : `Due in ${st.days} days`}</span>;
  return <span className="chip">Due in {st.days} days</span>;
}

function EntryCard({ e, st, today, busy, serverLog, mailProblem, me, onEdit, onUpdate, onRemove, onSend }) {
  const [more, setMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pay, setPay] = useState(null); // { amount, date } while recording a repayment
  const left = outstandingOf(e);
  const repaid = repaidOf(e);
  const last = lastReminder(e, serverLog);
  const next = nextReminder(e, last, today);
  const settled = st.state === "settled";
  const pct = amountOf(e) ? Math.min(100, (repaid / amountOf(e)) * 100) : 0;
  const emailable = canEmail(e);
  const mailOk = emailable && !mailProblem && (me || "").trim();

  const del = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    onRemove();
  };
  const recordPayment = (ev) => {
    ev.preventDefault();
    const amount = Math.round((Number(pay.amount) || 0) * 100) / 100;
    if (amount <= 0) return;
    onUpdate((x) => {
      const payments = [...(x.payments || []), { date: pay.date, amount }];
      const paidAll = payments.reduce((a, p) => a + p.amount, 0) >= amountOf(x) - 0.005;
      return { payments, ...(paidAll && { settledOn: pay.date }) };
    });
    setPay(null);
  };

  return (
    <article className="mo-card" data-state={st.state}>
      <div className="ut-top">
        <span className="ico mo-initial" aria-hidden="true">
          {(e.name || "?").trim()[0]?.toUpperCase() || "?"}
        </span>
        <div className="ut-who">
          <span className="ut-type">{e.what || "Money lent"}</span>
          <b>{e.name || "Someone"}</b>
          {e.email && <span className="ut-plan">{e.email}</span>}
        </div>
        <StatusChip st={st} />
      </div>

      <div className="mo-money">
        <span className="mo-left num">
          {settled ? money(amountOf(e)) : money(left)}
          <small>{settled ? (e.forgiven ? " forgiven" : " repaid") : repaid > 0 ? ` still owed of ${money(amountOf(e))}` : " owed"}</small>
        </span>
        {repaid > 0 && !settled && (
          <div className="bar ut-bar" role="progressbar" aria-label="Paid back" aria-valuenow={Math.round(pct)}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="bb-facts">
        <span>
          Lent <b>{fmtDate(parseISO(e.lent))}</b>
        </span>
        <span>
          {settled ? "Was due" : "Due back"} <b>{fmtDate(st.due)}</b>
        </span>
        {settled && e.settledOn && (
          <span>
            {e.forgiven ? "Forgiven" : "Settled"} <b>{fmtDate(parseISO(e.settledOn))}</b>
          </span>
        )}
      </div>

      {!settled && (
        <div className="mo-remind">
          {!emailable ? (
            <span>No email address, so no reminders go to them.</span>
          ) : e.remind ? (
            <span>
              {icons.bell ?? icons.calendar} Reminders on: {REMIND_EVERY[e.remindEvery]?.toLowerCase() ?? "once"}.{" "}
              {next ? (
                <>
                  Next <b>{next <= today ? "tomorrow morning" : fmtDate(next)}</b>.
                </>
              ) : (
                "No more scheduled."
              )}
              {last && <> Last sent {fmtWhen(last)}.</>}
            </span>
          ) : (
            <span>Reminders off.</span>
          )}
          {emailable && (
            <label className="mo-switch">
              <input type="checkbox" checked={!!e.remind} onChange={(ev) => onUpdate({ remind: ev.target.checked })} />
              Remind them
            </label>
          )}
        </div>
      )}

      {(e.payments?.length > 0 || e.notes) && (
        <div className="ut-meta">
          {e.payments?.map((p, i) => (
            <span key={i} className="num">
              Paid back {money(p.amount)} on {fmtDate(parseISO(p.date))}
            </span>
          ))}
          {e.notes && <span className="bb-notes">{e.notes}</span>}
        </div>
      )}

      {pay && (
        <form className="bb-gone" onSubmit={recordPayment}>
          <label>
            Amount paid back ($)
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={pay.amount} onChange={(ev) => setPay((p) => ({ ...p, amount: ev.target.value }))} autoFocus />
          </label>
          <label>
            On
            <input type="date" value={pay.date} onChange={(ev) => setPay((p) => ({ ...p, date: ev.target.value || p.date }))} />
          </label>
          <div className="head-actions">
            <button className="btn small" type="button" onClick={() => setPay(null)}>
              Cancel
            </button>
            <button className="btn small primary" type="submit">
              Save
            </button>
          </div>
        </form>
      )}

      {!pay && (
        <div className="head-actions">
          {!settled && (
            <>
              <button className="btn small primary" type="button" onClick={() => setPay({ amount: String(left), date: toISO(today) })} disabled={busy}>
                Record a repayment
              </button>
              {emailable && (
                <button
                  className="btn small"
                  type="button"
                  onClick={() => onSend(st.state === "overdue" ? "reminder" : "new")}
                  disabled={busy || !mailOk}
                  title={!mailOk ? (mailProblem || "Add your name first (Edit)") : undefined}
                >
                  {icons.mail ?? null} {st.state === "overdue" ? "Send a reminder now" : "Email them the details"}
                </button>
              )}
            </>
          )}
          <button className="btn small" type="button" onClick={onEdit} disabled={busy}>
            Edit
          </button>
          <button className="btn small" type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? "Less" : "More"}
          </button>
          {more && (
            <>
              {settled ? (
                <button className="btn small" type="button" onClick={() => onUpdate({ settledOn: "", forgiven: false })}>
                  Not settled after all
                </button>
              ) : (
                <>
                  <button className="btn small" type="button" onClick={() => onUpdate({ settledOn: toISO(today), forgiven: false })}>
                    Mark fully repaid
                  </button>
                  <button className="btn small" type="button" onClick={() => onUpdate({ settledOn: toISO(today), forgiven: true })}>
                    Forgive it
                  </button>
                </>
              )}
              <button className="btn small danger" type="button" onClick={del}>
                {armed ? "Tap again to delete" : "Delete"}
              </button>
            </>
          )}
        </div>
      )}
      {!settled && emailable && !mailOk && (
        <p className="note mo-why">{mailProblem ? mailProblem : "Add your name (Edit) so they know who the emails are from."}</p>
      )}
    </article>
  );
}

function EntryForm({ draft: d, setDraft, me, onSave, onCancel, isNew, mailProblem }) {
  const [err, setErr] = useState("");
  const [myName, setMyName] = useState(me || "");
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const emailOk = canEmail(d);
  const wantsMail = emailOk && (d.remind || (isNew && d.notifyNow));

  const submit = (e) => {
    e.preventDefault();
    if (!d.name.trim()) return setErr("Add who you lent it to.");
    if (!(Number(d.amount) > 0)) return setErr("Add how much you lent.");
    if (!d.lent || !d.due) return setErr("Add when you lent it and when it's due back.");
    if (d.due < d.lent) return setErr("The return date is before the date you lent it.");
    if ((d.email || "").trim() && !emailOk) return setErr("That email address doesn't look right.");
    if (wantsMail && !myName.trim()) return setErr("Add your name, so they know who the emails are from.");
    const clean = (k) => (d[k] || "").trim();
    onSave({
      ...d,
      name: clean("name"),
      email: clean("email"),
      what: clean("what"),
      notes: clean("notes"),
      amount: Math.round(Number(d.amount) * 100) / 100,
      remindEvery: Number(d.remindEvery) || 0,
      me: myName.trim(),
    });
  };

  return (
    <form className="settings ut-form" onSubmit={submit} noValidate aria-label={isNew ? "Lend money" : "Edit loan"}>
      <h2 className="full-row">{isNew ? "Lend money" : `Edit ${d.name || "loan"}`}</h2>
      <label>
        Who
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sam" autoFocus />
      </label>
      <label>
        <span>Their email <span className="opt">(for notes and reminders)</span></span>
        <input type="email" inputMode="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="sam@example.com" />
      </label>
      <label>
        Amount ($)
        <input type="number" inputMode="decimal" min="0" step="0.01" value={d.amount} onChange={(e) => set("amount", e.target.value)} />
      </label>
      <label>
        <span>What for <span className="opt">(optional)</span></span>
        <input value={d.what} onChange={(e) => set("what", e.target.value)} placeholder="e.g. Concert tickets, rent top-up" />
      </label>
      <label>
        Lent on
        <input type="date" value={d.lent} onChange={(e) => set("lent", e.target.value)} />
      </label>
      <label>
        Due back by
        <input type="date" value={d.due} min={d.lent} onChange={(e) => set("due", e.target.value)} />
      </label>

      <h2 className="full-row bb-sub">Emails to them</h2>
      {!emailOk && <p className="note full-row">Add their email address to send them a note or reminders.</p>}
      {emailOk && (
        <>
          {isNew && (
            <label className="su-inline full-row">
              <input type="checkbox" checked={!!d.notifyNow} onChange={(e) => set("notifyNow", e.target.checked)} /> Email them a note about this now
            </label>
          )}
          <label className="su-inline full-row">
            <input type="checkbox" checked={!!d.remind} onChange={(e) => set("remind", e.target.checked)} /> Remind them by email if it's not repaid by the due date
          </label>
          {d.remind && (
            <label>
              How often
              <select value={d.remindEvery} onChange={(e) => set("remindEvery", Number(e.target.value))}>
                {Object.entries(REMIND_EVERY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          {wantsMail && (
            <label>
              Your name <span className="opt">(shown in the emails)</span>
              <input value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="e.g. Alex" />
            </label>
          )}
          {wantsMail && mailProblem && <p className="note full-row mo-why">Emails can't go out yet: {mailProblem}</p>}
        </>
      )}
      <label className="full-row">
        <span>Notes <span className="opt">(optional, just for you)</span></span>
        <input value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Sent by bank transfer" />
      </label>

      <div className="full">
        <span className="ut-err" role="alert">
          {err}
        </span>
        <div className="head-actions">
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" type="submit">
            {isNew ? (d.notifyNow && emailOk ? "Save and email them" : "Save") : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
