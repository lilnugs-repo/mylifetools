import { useMemo, useState } from "react";
import { icons } from "../../components/icons.jsx";
import { useCloudState } from "../../lib/useCloudState.js";
import { downloadFile, hostOf, safeUrl } from "../../lib/files.js";
import FixedToggle from "../../components/FixedToggle.jsx";
import {
  BILLING,
  STORAGE_KEY,
  TYPES,
  alerts,
  calendarFile,
  dealStatus,
  emptyState,
  hasDeal,
  monthlyCost,
  newService,
  parseISO,
  savedSoFar,
  shapeState,
  startOfToday,
  toISO,
  totals,
  isCancelled,
} from "./deals.js";
import "../_shared/loan/loan-tracker.css"; // cards, tiles, forms and tables shared with the loan trackers
import "./utilities.css";

/**
 * Household Utilities: current providers for electricity, gas, internet,
 * mobile and anything else on an intro deal, when each deal ends, and a record
 * of past providers. Saved to the private Blob store as tools/utilities.json.
 */
const money = (() => {
  const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => (n < 0 ? "−" : "") + "$" + nf.format(Math.abs(n));
})();
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const DEAL_LENGTHS = [0, 1, 2, 3, 4, 6, 9, 12, 18, 24];
const ORDER = { ended: 0, soon: 1, active: 2, upcoming: 3, none: 4, cancelled: 5 };

// "internet", "gas"… or, for Other, the plan name ("car insurance").
const kindOf = (s) => (s.type === "other" ? (s.plan || "").toLowerCase() : TYPES[s.type]?.label.toLowerCase() ?? "");

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function inWords(days) {
  if (days < 45) return plural(days, "day");
  return plural(Math.round(days / (365.25 / 12)), "month");
}

export default function UtilityTracker() {
  const { state, setState, status, statusText } = useCloudState({
    id: "utilities",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(null); // service id being edited, or "new"
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(null); // deal to move into "Past providers" once the edit is saved

  const sum = useMemo(() => totals(state, today), [state, today]);
  const live = state.services.filter((s) => !isCancelled(s)).length;
  const cancelledCount = state.services.length - live;
  const { ended } = useMemo(() => alerts(state, today), [state, today]);
  const sorted = useMemo(
    () =>
      [...state.services]
        .map((s) => ({ s, st: dealStatus(s, today) }))
        .sort((a, b) => ORDER[a.st.state] - ORDER[b.st.state] || (a.st.daysLeft ?? 1e9) - (b.st.daysLeft ?? 1e9)),
    [state.services, today]
  );

  const startEdit = (s) => {
    setDraft({ ...s });
    setEditing(s.id);
  };
  const startNew = (type, from) => {
    const s = { ...newService(type, today), ...from };
    setDraft(s);
    setEditing("new");
  };
  const cancel = () => {
    setDraft(null);
    setEditing(null);
    setPending(null);
  };
  const save = (s) => {
    setState((st) => {
      let services = pending?.replaces ? st.services.filter((x) => x.id !== pending.replaces) : st.services;
      services = services.some((x) => x.id === s.id) ? services.map((x) => (x.id === s.id ? s : x)) : [...services, s];
      const history = pending ? [{ ...pending.old, ended: toISO(today), reason: pending.reason }, ...st.history] : st.history;
      return { ...st, services, history };
    });
    cancel();
  };

  // The current deal moves into "Past providers" when the next one is saved.
  const newDeal = (s) => {
    startEdit({ ...s, start: toISO(today), promoPrice: 0, acknowledged: false });
    setPending({ old: s, reason: "New deal" });
  };
  const switchProvider = (s) => {
    startNew(s.type);
    setPending({ old: s, reason: "Switched provider", replaces: s.id });
  };
  const patch = (s, p) => setState((st) => ({ ...st, services: st.services.map((x) => (x.id === s.id ? { ...x, ...p } : x)) }));
  const acknowledge = (s) => patch(s, { acknowledged: true });
  // Cancelled services stay on the list (moved to the end) but stop counting, alerting and emailing
  const markCancelled = (s) => patch(s, { cancelledOn: toISO(today) });
  const undoCancel = (s) => patch(s, { cancelledOn: "" });
  const remove = (s) => setState((st) => ({ ...st, services: st.services.filter((x) => x.id !== s.id) }));
  const removePast = (i) => setState((st) => ({ ...st, history: st.history.filter((_, j) => j !== i) }));

  const editorFor = (id) =>
    editing === id && draft ? (
      <ServiceForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} isNew={id === "new"} pending={pending} />
    ) : null;

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Household Utilities</h1>
          <div className="sub">
            {state.services.length
              ? `${plural(live, "service")}${cancelledCount ? ` (+ ${cancelledCount} cancelled)` : ""} · intro deals and when they end`
              : "Your providers and when their intro deals end"}
          </div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn primary" type="button" onClick={() => startNew("electricity")} disabled={!!editing}>
            {icons.plus} Add service
          </button>
        </div>
      </header>

      <FixedToggle
        on={state.sendToFixed}
        onChange={(v) => setState((st) => ({ ...st, sendToFixed: v }))}
        summary={state.services.length ? `${money(totals(state, today).now)} a month` : ""}
      />

      {ended.map(({ s, st }) => (
        <section className="ut-alert" key={s.id} role="alert">
          <div>
            <strong>
              Your {kindOf(s)} deal with {s.provider || "this provider"} has ended
            </strong>
            <span>
              It ended {st.daysLeft === 0 ? "today" : `${inWords(-st.daysLeft)} ago`} ({fmtDate(st.end)}). You're now paying{" "}
              <b className="num">
                {money(Number(s.regularPrice) || 0)}
                {BILLING[s.billing].short}
              </b>
              {Number(s.promoPrice) < Number(s.regularPrice) && (
                <>
                  {" "}
                  instead of <span className="num">{money(Number(s.promoPrice) || 0)}</span>
                </>
              )}
              . Time to shop around?
            </span>
          </div>
          <div className="head-actions">
            <button className="btn" type="button" onClick={() => markCancelled(s)}>
              Cancelled it
            </button>
            <button className="btn" type="button" onClick={() => switchProvider(s)} disabled={!!editing}>
              Switched provider
            </button>
            <button className="btn" type="button" onClick={() => newDeal(s)} disabled={!!editing}>
              Got a new deal
            </button>
            <button className="btn" type="button" onClick={() => acknowledge(s)}>
              Dismiss
            </button>
          </div>
        </section>
      ))}

      {state.services.length > 0 && (
        <section className="tiles" aria-label="Monthly totals">
          <div className="tile" style={{ "--c": "var(--accent)" }}>
            <span className="k">Paying now</span>
            <span className="v num">{money(sum.now)}/mo</span>
            <span className="of">across {plural(live, "service")}</span>
          </div>
          <div className="tile" style={{ "--c": "var(--soon)" }}>
            <span className="k">Once deals end</span>
            <span className="v num">{money(sum.after)}/mo</span>
            <span className="of num">{sum.after > sum.now ? `${money(sum.after - sum.now)}/mo more` : "No change"}</span>
          </div>
          <div className="tile" style={{ "--c": "var(--ok)" }}>
            <span className="k">Saved by intro deals</span>
            <span className="v num">{money(sum.saved)}</span>
            <span className="of">so far, including past providers</span>
          </div>
        </section>
      )}

      {editorFor("new")}

      {!state.services.length && editing !== "new" && (
        <section className="ut-empty">
          <p>Add your electricity, gas, internet and mobile providers to see when each intro deal runs out.</p>
          <div className="head-actions">
            {Object.entries(TYPES).map(([k, t]) => (
              <button key={k} className="btn" type="button" onClick={() => startNew(k)}>
                {icons[t.icon]} {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="stack">
        {sorted.map(({ s, st }) =>
          editing === s.id ? (
            <div key={s.id}>{editorFor(s.id)}</div>
          ) : (
            <ServiceCard
              key={s.id}
              s={s}
              st={st}
              today={today}
              busy={!!editing}
              onEdit={() => startEdit(s)}
              onNewDeal={() => newDeal(s)}
              onSwitch={() => switchProvider(s)}
              onCancelled={() => markCancelled(s)}
              onUndoCancel={() => undoCancel(s)}
              onRemove={() => remove(s)}
            />
          )
        )}
      </div>

      {state.history.length > 0 && <History history={state.history} today={today} onRemove={removePast} />}
    </div>
  );
}

/* ---------- sections ---------- */

function StatusChip({ st }) {
  const text = {
    none: "Standard price",
    upcoming: `Starts in ${inWords(st.startsIn ?? 0)}`,
    active: `${inWords(st.daysLeft ?? 0)} left`,
    soon: st.daysLeft === 1 ? "Ends tomorrow" : `Ends in ${plural(st.daysLeft ?? 0, "day")}`,
    ended: "Deal ended",
    cancelled: "Cancelled",
  }[st.state];
  return <span className={`chip ut-chip-${st.state}`}>{text}</span>;
}

function ServiceCard({ s, st, today, busy, onEdit, onNewDeal, onSwitch, onCancelled, onUndoCancel, onRemove }) {
  const cancelled = st.state === "cancelled";
  const [more, setMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const type = TYPES[s.type] ?? TYPES.other;
  const bill = BILLING[s.billing] ?? BILLING.month;
  const url = safeUrl(s.url);
  const cost = monthlyCost(s, today);

  const downloadCalendar = () => {
    const { name, text } = calendarFile(s);
    downloadFile(name, text, "text/calendar");
  };

  const del = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    onRemove();
  };

  return (
    <article className="ut-card" data-state={st.state}>
      <div className="ut-top">
        <span className="ico">{icons[type.icon]}</span>
        <div className="ut-who">
          <span className="ut-type">{type.label}</span>
          <b>{s.provider || "Unnamed provider"}</b>
          {s.plan && <span className="ut-plan">{s.plan}</span>}
        </div>
        <StatusChip st={st} />
      </div>

      <div className="ut-price num">
        {hasDeal(s) ? (
          <>
            <span className={st.state === "ended" ? "ut-was" : "ut-now"}>
              {money(Number(s.promoPrice) || 0)}
              {bill.short}
            </span>{" "}
            for {plural(s.promoMonths, "month")}, then{" "}
            <span className={st.state === "ended" ? "ut-now" : ""}>
              {money(Number(s.regularPrice) || 0)}
              {bill.short}
            </span>
          </>
        ) : (
          <span className="ut-now">
            {money(Number(s.regularPrice) || 0)}
            {bill.short}
          </span>
        )}
        {s.billing !== "month" && !cancelled && <span className="ut-mo"> · about {money(cost.now)}/mo now</span>}
      </div>

      {hasDeal(s) && st.state !== "upcoming" && !cancelled && (
        <div className="card-progress">
          <div className="bar ut-bar" role="progressbar" aria-label="Intro deal used" aria-valuenow={Math.round(st.pct)}>
            <i style={{ width: `${st.pct}%` }} />
          </div>
        </div>
      )}

      <div className="ut-meta">
        <span>Started {fmtDate(st.start)}</span>
        {cancelled && (
          <span>
            Cancelled <b>{fmtDate(st.cancelledOn)}</b>
          </span>
        )}
        {hasDeal(s) && !cancelled && (
          <span>
            Deal {st.state === "ended" ? "ended" : "ends"} <b>{fmtDate(st.end)}</b>
          </span>
        )}
        {s.account && <span className="num">Account {s.account}</span>}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {hostOf(url)} ↗
          </a>
        )}
      </div>

      {s.notes && <p className="ut-notes">{s.notes}</p>}

      <div className="head-actions">
        <button className="btn small" type="button" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        {cancelled ? (
          <button className="btn small" type="button" onClick={onUndoCancel}>
            Undo cancel
          </button>
        ) : (
          <button className="btn small" type="button" onClick={onCancelled}>
            Mark as cancelled
          </button>
        )}
        {hasDeal(s) && st.state !== "ended" && !cancelled && (
          <button className="btn small" type="button" onClick={downloadCalendar}>
            {icons.calendar} Add to calendar
          </button>
        )}
        <button className="btn small" type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          {more ? "Less" : "More"}
        </button>
        {more && (
          <>
            {!cancelled && (
              <>
                <button className="btn small" type="button" onClick={onNewDeal} disabled={busy}>
                  Got a new deal
                </button>
                <button className="btn small" type="button" onClick={onSwitch} disabled={busy}>
                  Switched provider
                </button>
              </>
            )}
            <button className="btn small danger" type="button" onClick={del}>
              {armed ? "Tap again to delete" : "Delete"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function ServiceForm({ draft: d, setDraft, onSave, onCancel, isNew, pending }) {
  const [err, setErr] = useState("");
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const bill = BILLING[d.billing] ?? BILLING.month;
  const lengths = DEAL_LENGTHS.includes(Number(d.promoMonths)) ? DEAL_LENGTHS : [...DEAL_LENGTHS, Number(d.promoMonths)].sort((a, b) => a - b);

  const submit = (e) => {
    e.preventDefault();
    if (!d.provider.trim()) return setErr("Add the provider's name.");
    if (!d.start) return setErr("Add the date the plan started.");
    onSave({
      ...d,
      provider: d.provider.trim(),
      plan: d.plan.trim(),
      url: d.url.trim(),
      account: d.account.trim(),
      promoMonths: Number(d.promoMonths) || 0,
      promoPrice: Number(d.promoPrice) || 0,
      regularPrice: Number(d.regularPrice) || 0,
    });
  };

  return (
    <form className="settings ut-form" onSubmit={submit} noValidate aria-label={isNew ? "Add a service" : "Edit service"}>
      <h2 className="full-row">
        {pending?.replaces
          ? `Your new ${kindOf(d)} provider`.replace("  ", " ")
          : pending
            ? `New deal with ${d.provider}`
            : isNew
              ? "Add a service"
              : `Edit ${d.provider || kindOf(d)}`}
      </h2>
      {pending && <p className="note full-row">{pending.old.provider}'s old deal moves to Past providers when you save.</p>}
      <label>
        Type
        <select value={d.type} onChange={(e) => set("type", e.target.value)}>
          {Object.entries(TYPES).map(([k, t]) => (
            <option key={k} value={k}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Provider
        <input value={d.provider} onChange={(e) => set("provider", e.target.value)} placeholder="e.g. Aussie Broadband" autoFocus />
      </label>
      <label>
        <span>Plan name <span className="opt">(optional)</span></span>
        <input value={d.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. NBN 100" />
      </label>
      <label>
        <span>Website <span className="opt">(optional)</span></span>
        <input type="url" inputMode="url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="provider.com.au" />
      </label>
      <label>
        <span>Account number <span className="opt">(optional)</span></span>
        <input value={d.account} onChange={(e) => set("account", e.target.value)} />
      </label>
      <label>
        Plan started
        <input type="date" value={d.start} onChange={(e) => set("start", e.target.value)} />
      </label>
      <label>
        Billed
        <select value={d.billing} onChange={(e) => set("billing", e.target.value)}>
          {Object.entries(BILLING).map(([k, b]) => (
            <option key={k} value={k}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Intro deal
        <select value={d.promoMonths} onChange={(e) => set("promoMonths", Number(e.target.value))}>
          {lengths.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "No intro deal" : `First ${plural(m, "month")}`}
            </option>
          ))}
        </select>
      </label>
      {Number(d.promoMonths) > 0 && (
        <label>
          Intro price ($ {bill.short})
          <input type="number" inputMode="decimal" step="0.01" min="0" value={d.promoPrice} onChange={(e) => set("promoPrice", e.target.value)} />
        </label>
      )}
      <label>
        {Number(d.promoMonths) > 0 ? "Then" : "Price"} ($ {bill.short})
        <input type="number" inputMode="decimal" step="0.01" min="0" value={d.regularPrice} onChange={(e) => set("regularPrice", e.target.value)} />
      </label>
      <label className="full-row">
        <span>Notes <span className="opt">(optional)</span></span>
        <textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. 20% off usage, no lock-in contract" />
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
            {isNew ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

function History({ history, today, onRemove }) {
  return (
    <details className="year">
      <summary>
        <span className="yl">Past providers</span>
        <span className="ys">{plural(history.length, "record")}</span>
      </summary>
      <div className="tbl-wrap">
        <table className="num">
          <thead>
            <tr>
              <th>Type</th>
              <th>Provider</th>
              <th>Dates</th>
              <th>Price</th>
              <th>Saved</th>
              <th aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => {
              const bill = BILLING[h.billing] ?? BILLING.month;
              const url = safeUrl(h.url);
              return (
                <tr key={`${h.id}-${h.ended}-${i}`}>
                  <td>{TYPES[h.type]?.label ?? "Other"}</td>
                  <td>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {h.provider}
                      </a>
                    ) : (
                      h.provider
                    )}
                    <div className="ut-sub">{h.reason}</div>
                  </td>
                  <td>
                    {fmtDate(parseISO(h.start))} – {fmtDate(parseISO(h.ended))}
                  </td>
                  <td>
                    {hasDeal(h) ? `${money(Number(h.promoPrice) || 0)} → ` : ""}
                    {money(Number(h.regularPrice) || 0)}
                    {bill.short}
                  </td>
                  <td>{money(savedSoFar(h, today, h.ended))}</td>
                  <td>
                    <button className="btn small danger" type="button" onClick={() => onRemove(i)} aria-label={`Delete ${h.provider} record`}>
                      ×
                    </button>
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
