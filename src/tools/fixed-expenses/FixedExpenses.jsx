import { useEffect, useMemo, useState } from "react";
import { icons } from "../../components/icons.jsx";
import { api } from "../../lib/api.js";
import { useCloudState } from "../../lib/useCloudState.js";
import {
  CATEGORIES,
  CYCLES,
  SOURCES,
  STORAGE_KEY,
  VIEWS,
  buildGroups,
  cachedSourceStates,
  emptyState,
  newExpense,
  saveSnapshot,
  shapeState,
  startOfToday,
  totalMonthly,
} from "./fixed.js";
import "../_shared/loan/loan-tracker.css"; // tiles, forms, chips
import "../utilities/utilities.css"; // form styles
import "./fixed-expenses.css";

/**
 * All My Fixed Expenses: one total for everything you pay regularly. Costs come from
 * the tools whose "Send to Fixed Expenses" switch is on (read from their saved data),
 * plus expenses you add here. Rupees are converted to AUD at the rate set below.
 * Saved to the private Blob store as tools/fixed-expenses.json.
 */
const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => (n < 0 ? "−" : "") + "$" + nf.format(Math.abs(n));
const nprFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const npr = (n) => "Nrs. " + nprFmt.format(n);

/** Loads each source tool's saved data: this device's copy first, then the server's. */
function useSourceStates() {
  const [states, setStates] = useState(cachedSourceStates);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(
      SOURCES.map((src) =>
        api
          .getState(src.id)
          .then((r) => [src.id, r.data ? src.shape(r.data) : null])
          .catch(() => [src.id, undefined]) // keep this device's copy
      )
    ).then((pairs) => {
      if (!alive) return;
      setStates((prev) => {
        const next = { ...prev };
        for (const [id, st] of pairs) if (st !== undefined) next[id] = st ?? prev[id];
        return next;
      });
      setSynced(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { states, synced };
}

export default function FixedExpenses() {
  const { state, setState, status, statusText } = useCloudState({
    id: "fixed-expenses",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const { states, synced } = useSourceStates();
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(null); // expense id, or "new"
  const [draft, setDraft] = useState(null);

  const view = VIEWS[state.view] ?? VIEWS.month;
  const groups = useMemo(() => buildGroups(state, states, today), [state, states, today]);
  const total = totalMonthly(groups);
  useEffect(() => {
    if (synced) saveSnapshot(groups);
  }, [synced, groups]);
  const inView = (monthly) => monthly * view.months;
  const linked = groups.filter((g) => g.linked);
  const off = linked.filter((g) => !g.on);
  const own = groups.find((g) => g.id === "custom");
  const counted = groups.filter((g) => g.monthly > 0).sort((a, b) => b.monthly - a.monthly);
  const hasNpr = groups.some((g) => g.items.some((i) => i.original?.currency === "NPR"));

  const setView = (v) => setState((st) => ({ ...st, view: v }));
  const startNew = () => {
    setDraft(newExpense());
    setEditing("new");
  };
  const startEdit = (e) => {
    setDraft({ ...e });
    setEditing(e.id);
  };
  const cancel = () => {
    setDraft(null);
    setEditing(null);
  };
  const save = (e) => {
    setState((st) => ({
      ...st,
      custom: st.custom.some((x) => x.id === e.id) ? st.custom.map((x) => (x.id === e.id ? e : x)) : [...st.custom, e],
    }));
    cancel();
  };
  const remove = (id) => setState((st) => ({ ...st, custom: st.custom.filter((x) => x.id !== id) }));

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>All My Fixed Expenses</h1>
          <div className="sub">Everything you pay on repeat, from your other tools and your own list, in one total</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn primary" type="button" onClick={startNew} disabled={!!editing}>
            {icons.plus} Add expense
          </button>
        </div>
      </header>

      <div className="fx-views" role="radiogroup" aria-label="Show amounts">
        {Object.entries(VIEWS).map(([k, v]) => (
          <button key={k} type="button" role="radio" aria-checked={state.view === k} className={state.view === k ? "on" : ""} onClick={() => setView(k)}>
            {v.label}
          </button>
        ))}
      </div>

      <section className="fx-total" aria-label="Total">
        <span className="k">Total fixed expenses</span>
        <span className="v num">
          {money(inView(total))}
          <small> {view.per}</small>
        </span>
        <span className="fx-others num">
          {Object.entries(VIEWS)
            .filter(([k]) => k !== state.view)
            .map(([k, v]) => `${money(total * v.months)} ${v.per}`)
            .join(" · ")}
        </span>
        {counted.length > 0 && (
          <ul className="fx-split" aria-label="Where it goes">
            {counted.map((g) => (
              <li key={g.id}>
                <span className="fx-dot" data-g={g.id} />
                <span>{g.name}</span>
                <b className="num">{Math.round((g.monthly / total) * 100)}%</b>
              </li>
            ))}
          </ul>
        )}
        {!synced && <span className="fx-sync">Checking your other tools for the latest figures…</span>}
      </section>

      {editing === "new" && draft && <ExpenseForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} isNew />}

      {linked
        .filter((g) => g.on)
        .map((g) => (
          <Group key={g.id} g={g} inView={inView} view={view}>
            {g.items.length === 0 && <p className="note">Switched on, but nothing to add right now.</p>}
            {g.items.map((i) => (
              <Row key={i.key} i={i} inView={inView} state={state} />
            ))}
          </Group>
        ))}

      <Group g={own} inView={inView} view={view}>
        {own.items.length === 0 && editing !== "new" && (
          <p className="note">Rent, insurance, school fees, the gym your work doesn't pay for… add anything that isn't in another tool.</p>
        )}
        {own.items.map((i) =>
          editing === i.key ? (
            <li key={i.key} className="fx-editing">
              <ExpenseForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} />
            </li>
          ) : (
            <Row key={i.key} i={i} inView={inView} state={state}>
              <button className="btn small" type="button" onClick={() => startEdit(i.expense)} disabled={!!editing}>
                Edit
              </button>
              <DeleteButton onDelete={() => remove(i.key)} />
            </Row>
          )
        )}
        {editing !== "new" && (
          <button className="btn small fx-add" type="button" onClick={startNew} disabled={!!editing}>
            {icons.plus} Add your own expense
          </button>
        )}
      </Group>

      {off.length > 0 && (
        <section className="fx-off" aria-label="Not included">
          <h2>Not included</h2>
          <p className="note">Turn on “Send to Fixed Expenses” at the top of a tool to add its costs here.</p>
          <ul>
            {off.map((g) => (
              <li key={g.id}>
                <span className="fx-ico">{icons[g.icon]}</span>
                <span className="fx-name">{g.name}</span>
                <a className="btn small" href={`#/${g.id}`}>
                  {g.loaded ? "Turn on" : "Set up"}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="fx-settings">
        <label>
          Exchange rate
          <span className="fx-rate">
            $1 AUD =
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              defaultValue={state.nprPerAud}
              key={state.nprPerAud}
              onBlur={(e) => Number(e.target.value) > 0 && setState((st) => ({ ...st, nprPerAud: Number(e.target.value) }))}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label="Nepalese rupees per Australian dollar"
            />
            Nrs.
          </span>
        </label>
        <span className="note">
          {hasNpr ? "Used to convert My Home Loan's rupees into dollars." : "Used for anything sent here in Nepalese rupees."}
        </span>
      </section>
    </div>
  );
}

function Group({ g, inView, view, children }) {
  return (
    <section className="fx-group" data-g={g.id} aria-label={g.name}>
      <div className="fx-group-head">
        <span className="fx-ico">{icons[g.icon]}</span>
        <div className="fx-who">
          <b>{g.name}</b>
          {g.linked ? (
            <a className="fx-linked" href={`#/${g.id}`} title={`Open ${g.name}`}>
              {icons.link} Linked · updates automatically
            </a>
          ) : (
            <span className="fx-linked fx-own">Added here</span>
          )}
        </div>
        <span className="fx-amt num">
          {money(inView(g.monthly))}
          <small> {view.per}</small>
        </span>
      </div>
      <ul className="fx-items">{children}</ul>
    </section>
  );
}

function Row({ i, inView, state, children }) {
  return (
    <li>
      <span className="fx-name">
        {i.name || "Unnamed"}
        {(i.detail || i.original) && (
          <small>
            {i.detail}
            {i.original && (
              <>
                {i.detail ? " · " : ""}
                {npr(i.original.monthly)} a month at {state.nprPerAud} Nrs. per $1
              </>
            )}
          </small>
        )}
        {i.expense && (
          <small>
            {money(Number(i.expense.amount) || 0)} {CYCLES[i.expense.cycle]?.label.toLowerCase()}
            {i.expense.notes ? ` · ${i.expense.notes}` : ""}
          </small>
        )}
      </span>
      <b className="num">{money(inView(i.monthly))}</b>
      {children && <span className="head-actions">{children}</span>}
    </li>
  );
}

function DeleteButton({ onDelete }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className="btn small danger"
      type="button"
      onClick={() => {
        if (armed) return onDelete();
        setArmed(true);
        setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? "Tap again" : "Delete"}
    </button>
  );
}

function ExpenseForm({ draft: d, setDraft, onSave, onCancel, isNew }) {
  const [err, setErr] = useState("");
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    if (!d.name.trim()) return setErr("Add what the expense is.");
    if (d.amount === "" || !(Number(d.amount) >= 0)) return setErr("Add how much it is.");
    onSave({ ...d, name: d.name.trim(), notes: (d.notes || "").trim(), amount: Number(d.amount) || 0 });
  };
  return (
    <form className="settings ut-form" onSubmit={submit} noValidate aria-label={isNew ? "Add an expense" : "Edit expense"}>
      <h2 className="full-row">{isNew ? "Add a fixed expense" : `Edit ${d.name || "expense"}`}</h2>
      <label>
        What is it
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rent, car insurance, school fees" autoFocus />
      </label>
      <label>
        Category
        <select value={d.category} onChange={(e) => set("category", e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Amount ($)
        <input type="number" inputMode="decimal" min="0" step="0.01" value={d.amount} onChange={(e) => set("amount", e.target.value)} />
      </label>
      <label>
        Paid
        <select value={d.cycle} onChange={(e) => set("cycle", e.target.value)}>
          {Object.entries(CYCLES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="full-row">
        <span>Notes <span className="opt">(optional)</span></span>
        <input value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Comes out on the 1st, paid by direct debit" />
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
