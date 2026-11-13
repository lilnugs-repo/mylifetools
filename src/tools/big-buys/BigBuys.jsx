import { useMemo, useState } from "react";
import { icons } from "../../components/icons.jsx";
import { useCloudState } from "../../lib/useCloudState.js";
import { downloadFile, hostOf, safeUrl } from "../../lib/files.js";
import {
  CATEGORIES,
  GONE_HOW,
  SOON_DAYS,
  STORAGE_KEY,
  STORED,
  calendarFile,
  emptyState,
  endingSoon,
  newItem,
  parseISO,
  price,
  shapeState,
  span,
  startOfToday,
  summary,
  toISO,
  warrantyStatus,
} from "./purchases.js";
import "../_shared/loan/loan-tracker.css"; // tiles, forms, chips and progress bars
import "../utilities/utilities.css"; // card header (ut-top), form and meta styles
import "./big-buys.css";

/**
 * Big Buys & Warranties: a record of big purchases (laptops, phones, cars,
 * appliances…) with when and where each was bought, how long the warranty
 * runs, and where the warranty and receipt are kept. Saved to the private Blob
 * store as tools/big-buys.json.
 */
const money = (() => {
  const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => (n < 0 ? "−" : "") + "$" + nf.format(Math.abs(n));
})();
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const WARRANTY_MONTHS = [0, 3, 6, 12, 24, 36, 48, 60, 84, 120];
const STATE_ORDER = { soon: 0, active: 1, expired: 2, none: 3 };
const SORTS = {
  newest: { label: "Newest first", fn: (a, b) => b.i.bought.localeCompare(a.i.bought) },
  ending: {
    label: "Warranty ending first",
    fn: (a, b) => STATE_ORDER[a.st.state] - STATE_ORDER[b.st.state] || (a.st.daysLeft ?? 1e9) - (b.st.daysLeft ?? 1e9),
  },
  price: { label: "Most expensive first", fn: (a, b) => price(b.i) - price(a.i) },
};
const STORED_HINT = {
  email: "e.g. Gmail, search “JB Hi-Fi order 12345”",
  cloud: "e.g. Google Drive › Receipts › 2026",
  photo: "e.g. Photos album “Receipts”",
  paper: "e.g. Blue folder in the study drawer",
  store: "e.g. JB Hi-Fi account › Orders",
  brand: "e.g. Registered on samsung.com with my email",
  box: "e.g. Box is in the garage",
  other: "Where exactly?",
};

const monthsLabel = (m) => (m === 0 ? "None" : m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`);

export default function BigBuys() {
  const { state, setState, status, statusText } = useCloudState({
    id: "big-buys",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(null); // item id being edited, or "new"
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showGone, setShowGone] = useState(false);

  const sum = useMemo(() => summary(state.items, today), [state.items, today]);
  const soon = useMemo(() => endingSoon(state.items, today), [state.items, today]);
  const goneCount = state.items.filter((i) => i.gone).length;
  const usedCats = useMemo(() => {
    const n = {};
    for (const i of state.items) if (!i.gone || showGone) n[i.category] = (n[i.category] || 0) + 1;
    return n;
  }, [state.items, showGone]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.items
      .filter((i) => (showGone || !i.gone) && (cat === "all" || i.category === cat))
      .filter((i) => !q || [i.name, i.brand, i.model, i.store, i.serial, i.notes].some((v) => (v || "").toLowerCase().includes(q)))
      .map((i) => ({ i, st: warrantyStatus(i, today) }))
      .sort((a, b) => !!a.i.gone - !!b.i.gone || SORTS[sort].fn(a, b));
  }, [state.items, query, cat, sort, showGone, today]);

  const startNew = (category) => {
    setDraft(newItem(category, today));
    setEditing("new");
  };
  const startEdit = (i) => {
    setDraft({ ...i });
    setEditing(i.id);
  };
  const cancel = () => {
    setDraft(null);
    setEditing(null);
  };
  const save = (item) => {
    setState((st) => ({
      items: st.items.some((x) => x.id === item.id) ? st.items.map((x) => (x.id === item.id ? item : x)) : [item, ...st.items],
    }));
    cancel();
  };
  const update = (id, patch) => setState((st) => ({ items: st.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const remove = (id) => setState((st) => ({ items: st.items.filter((x) => x.id !== id) }));

  const form = (id) =>
    editing === id && draft ? <ItemForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} isNew={id === "new"} /> : null;

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Big Buys &amp; Warranties</h1>
          <div className="sub">When you bought it, how long it's covered, and where the warranty is kept</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn primary" type="button" onClick={() => startNew(cat === "all" ? "phones" : cat)} disabled={!!editing}>
            {icons.plus} Add purchase
          </button>
        </div>
      </header>

      {soon.length > 0 && (
        <section className="bb-alert" role="alert">
          <strong>
            {soon.length === 1 ? "A warranty ends" : `${soon.length} warranties end`} in the next {SOON_DAYS} days
          </strong>
          <span>Check these over and claim any faults while they're still covered.</span>
          <ul>
            {soon.map(({ i, st }) => (
              <li key={i.id}>
                <b>{i.name}</b> · ends {fmtDate(st.end)} ({st.daysLeft === 1 ? "tomorrow" : `in ${st.daysLeft} days`})
              </li>
            ))}
          </ul>
        </section>
      )}

      {sum.owned > 0 && (
        <section className="tiles" aria-label="Summary">
          <div className="tile" style={{ "--c": "var(--accent)" }}>
            <span className="k">Under warranty</span>
            <span className="v num">
              {sum.covered} of {sum.owned}
            </span>
            <span className="of">items you own</span>
          </div>
          <div className="tile" style={{ "--c": "var(--soon)" }}>
            <span className="k">Ending soon</span>
            <span className="v num">{sum.soon}</span>
            <span className="of">in the next {SOON_DAYS} days</span>
          </div>
          <div className="tile" style={{ "--c": "var(--muted)" }}>
            <span className="k">Spent on big buys</span>
            <span className="v num">{money(sum.spent)}</span>
            <span className="of">on items you still own</span>
          </div>
        </section>
      )}

      {form("new")}

      {state.items.length === 0 && editing !== "new" && (
        <section className="bb-guide">
          <h2>What counts as a big buy?</h2>
          <p>Anything you'd want proof of purchase for if it broke. Pick a category to add your first one.</p>
          <div className="bb-cats">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} type="button" className="bb-cat" onClick={() => startNew(k)}>
                <span className="ico">{icons[c.icon]}</span>
                <span>
                  <b>{c.label}</b>
                  <small>{c.examples}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {state.items.length > 0 && (
        <div className="bb-tools">
          <input type="search" placeholder="Search name, brand, store, serial…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search purchases" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES)
              .filter(([k]) => usedCats[k] || k === cat)
              .map(([k, c]) => (
                <option key={k} value={k}>
                  {c.label} ({usedCats[k] || 0})
                </option>
              ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
          {goneCount > 0 && (
            <label className="bb-check">
              <input type="checkbox" checked={showGone} onChange={(e) => setShowGone(e.target.checked)} /> Show {goneCount} I no longer have
            </label>
          )}
        </div>
      )}

      <div className="stack">
        {shown.map(({ i, st }) =>
          editing === i.id ? (
            <div key={i.id}>{form(i.id)}</div>
          ) : (
            <ItemCard
              key={i.id}
              i={i}
              st={st}
              today={today}
              busy={!!editing}
              onEdit={() => startEdit(i)}
              onGone={(gone) => update(i.id, { gone })}
              onRemove={() => remove(i.id)}
            />
          )
        )}
        {state.items.length > 0 && shown.length === 0 && <p className="note">Nothing matches that search.</p>}
      </div>

      {state.items.length > 0 && (
        <p className="note bb-acl">
          Warranty over? Under Australian Consumer Law, products should last a reasonable time for what they cost. A major fault after
          the warranty ends can still be worth raising with the store.
        </p>
      )}
    </div>
  );
}

/* ---------- sections ---------- */

function WarrantyChip({ st }) {
  const text = {
    none: "No warranty",
    active: st.onExtended ? "Extended warranty" : "Under warranty",
    soon: st.daysLeft === 1 ? "Warranty ends tomorrow" : `Warranty ends in ${st.daysLeft} days`,
    expired: "Warranty ended",
  }[st.state];
  return <span className={`chip bb-chip-${st.state}`}>{text}</span>;
}

function ItemCard({ i, st, today, busy, onEdit, onGone, onRemove }) {
  const [more, setMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const [goneDraft, setGoneDraft] = useState(null);
  const c = CATEGORIES[i.category] ?? CATEGORIES.other;
  const link = safeUrl(i.receiptUrl);
  const mfr = Number(i.warrantyMonths) || 0;
  const ext = Number(i.extMonths) || 0;
  const gone = i.gone;

  const del = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    onRemove();
  };
  const remind = () => {
    const { name, text } = calendarFile(i);
    downloadFile(name, text, "text/calendar");
  };

  return (
    <article className="bb-card" data-state={gone ? "gone" : st.state}>
      <div className="ut-top">
        <span className="ico">{icons[c.icon]}</span>
        <div className="ut-who">
          <span className="ut-type">{c.label}</span>
          <b>{i.name || "Unnamed item"}</b>
          {(i.brand || i.model) && <span className="ut-plan">{[i.brand, i.model].filter(Boolean).join(" · ")}</span>}
        </div>
        {gone ? <span className="chip bb-chip-gone">{gone.how}</span> : <WarrantyChip st={st} />}
      </div>

      <div className="bb-facts">
        <span>
          Bought <b>{fmtDate(st.bought)}</b>
          {i.store && <> at {i.store}</>}
        </span>
        {price(i) > 0 && <b className="num">{money(price(i))}</b>}
        {!gone && st.bought < today && <span>Had it {span(st.bought, today)}</span>}
        {gone && (
          <span>
            {gone.how} {fmtDate(parseISO(gone.date))}
            {Number(gone.soldFor) > 0 && <span className="num"> for {money(Number(gone.soldFor))}</span>}
          </span>
        )}
      </div>

      {!gone && st.state !== "none" && (
        <div className="bb-warranty">
          <div className="bar ut-bar" role="progressbar" aria-label="Warranty used" aria-valuenow={Math.round(st.pct)}>
            <i style={{ width: `${st.pct}%` }} />
          </div>
          <span>
            {st.state === "expired" ? "Cover ended" : "Covered until"} <b>{fmtDate(st.end)}</b>
            {st.state !== "expired" && <> · {span(today, st.end)} left</>}
            <span className="bb-dim">
              {" "}
              ({monthsLabel(mfr)} from the maker{ext > 0 && <> + {monthsLabel(ext)} extended{i.extProvider && <> via {i.extProvider}</>}</>})
            </span>
          </span>
        </div>
      )}

      <div className="bb-stored">
        <span className="bb-k">Warranty &amp; receipt</span>
        <span>
          {STORED[i.storedIn] ?? "Not recorded"}
          {i.storedNote && <> · {i.storedNote}</>}
          {link && (
            <>
              {" "}
              ·{" "}
              <a href={link} target="_blank" rel="noopener noreferrer">
                {hostOf(link)} ↗
              </a>
            </>
          )}
        </span>
      </div>

      {(i.serial || i.notes) && (
        <div className="ut-meta">
          {i.serial && <span className="num">Serial {i.serial}</span>}
          {i.notes && <span className="bb-notes">{i.notes}</span>}
        </div>
      )}

      {goneDraft && (
        <form
          className="bb-gone"
          onSubmit={(e) => {
            e.preventDefault();
            onGone({ ...goneDraft, soldFor: Number(goneDraft.soldFor) || 0 });
            setGoneDraft(null);
          }}
        >
          <label>
            What happened
            <select value={goneDraft.how} onChange={(e) => setGoneDraft((g) => ({ ...g, how: e.target.value }))}>
              {GONE_HOW.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
          <label>
            When
            <input type="date" value={goneDraft.date} onChange={(e) => setGoneDraft((g) => ({ ...g, date: e.target.value || g.date }))} />
          </label>
          {goneDraft.how === "Sold" && (
            <label>
              Sold for ($)
              <input type="number" inputMode="decimal" min="0" step="0.01" value={goneDraft.soldFor} onChange={(e) => setGoneDraft((g) => ({ ...g, soldFor: e.target.value }))} />
            </label>
          )}
          <div className="head-actions">
            <button className="btn small" type="button" onClick={() => setGoneDraft(null)}>
              Cancel
            </button>
            <button className="btn small primary" type="submit">
              Save
            </button>
          </div>
        </form>
      )}

      {!goneDraft && (
        <div className="head-actions">
          <button className="btn small" type="button" onClick={onEdit} disabled={busy}>
            Edit
          </button>
          {!gone && (st.state === "active" || st.state === "soon") && (
            <button className="btn small" type="button" onClick={remind}>
              {icons.calendar} Remind me before it ends
            </button>
          )}
          <button className="btn small" type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? "Less" : "More"}
          </button>
          {more && (
            <>
              {gone ? (
                <button className="btn small" type="button" onClick={() => onGone(null)}>
                  I still have it
                </button>
              ) : (
                <button className="btn small" type="button" onClick={() => setGoneDraft({ how: "Sold", date: toISO(today), soldFor: "" })}>
                  No longer have it
                </button>
              )}
              <button className="btn small danger" type="button" onClick={del}>
                {armed ? "Tap again to delete" : "Delete"}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function ItemForm({ draft: d, setDraft, onSave, onCancel, isNew }) {
  const [err, setErr] = useState("");
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const months = (v) => (WARRANTY_MONTHS.includes(Number(v)) ? WARRANTY_MONTHS : [...WARRANTY_MONTHS, Number(v)].sort((a, b) => a - b));
  const cat = CATEGORIES[d.category] ?? CATEGORIES.other;

  const submit = (e) => {
    e.preventDefault();
    if (!d.name.trim()) return setErr("Add what you bought.");
    if (!d.bought) return setErr("Add the date you bought it.");
    const clean = (k) => (d[k] || "").trim();
    onSave({
      ...d,
      name: clean("name"),
      brand: clean("brand"),
      model: clean("model"),
      serial: clean("serial"),
      store: clean("store"),
      extProvider: clean("extProvider"),
      storedNote: clean("storedNote"),
      receiptUrl: clean("receiptUrl"),
      price: d.price === "" ? "" : Number(d.price) || 0,
      warrantyMonths: Number(d.warrantyMonths) || 0,
      extMonths: Number(d.extMonths) || 0,
    });
  };

  return (
    <form className="settings ut-form" onSubmit={submit} noValidate aria-label={isNew ? "Add a purchase" : "Edit purchase"}>
      <h2 className="full-row">{isNew ? "Add a purchase" : `Edit ${d.name || "purchase"}`}</h2>

      <label>
        Category
        <select value={d.category} onChange={(e) => set("category", e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        What is it
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={`e.g. ${cat.examples.split(",")[0]}`} autoFocus />
      </label>
      <label>
        <span>Brand <span className="opt">(optional)</span></span>
        <input value={d.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. Samsung" />
      </label>
      <label>
        <span>Model <span className="opt">(optional)</span></span>
        <input value={d.model} onChange={(e) => set("model", e.target.value)} placeholder="e.g. QA65Q80D" />
      </label>
      <label>
        <span>Serial number <span className="opt">(optional)</span></span>
        <input value={d.serial} onChange={(e) => set("serial", e.target.value)} />
      </label>
      <label>
        <span>Bought from <span className="opt">(optional)</span></span>
        <input value={d.store} onChange={(e) => set("store", e.target.value)} placeholder="e.g. JB Hi-Fi, Harvey Norman" />
      </label>
      <label>
        Date bought
        <input type="date" value={d.bought} onChange={(e) => set("bought", e.target.value)} />
      </label>
      <label>
        <span>Price ($) <span className="opt">(optional)</span></span>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={d.price} onChange={(e) => set("price", e.target.value)} />
      </label>

      <h2 className="full-row bb-sub">Warranty</h2>
      <label>
        From the maker
        <select value={d.warrantyMonths} onChange={(e) => set("warrantyMonths", Number(e.target.value))}>
          {months(d.warrantyMonths).map((m) => (
            <option key={m} value={m}>
              {monthsLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Extended warranty (extra)
        <select value={d.extMonths} onChange={(e) => set("extMonths", Number(e.target.value))}>
          {months(d.extMonths).map((m) => (
            <option key={m} value={m}>
              {m === 0 ? "None" : `+ ${monthsLabel(m)}`}
            </option>
          ))}
        </select>
      </label>
      {Number(d.extMonths) > 0 && (
        <label>
          Extended through
          <input value={d.extProvider} onChange={(e) => set("extProvider", e.target.value)} placeholder="e.g. store's care plan, credit card" />
        </label>
      )}
      <label>
        Warranty &amp; receipt kept in
        <select value={d.storedIn} onChange={(e) => set("storedIn", e.target.value)}>
          {Object.entries(STORED).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Where exactly <span className="opt">(optional)</span></span>
        <input value={d.storedNote} onChange={(e) => set("storedNote", e.target.value)} placeholder={STORED_HINT[d.storedIn]} />
      </label>
      <label>
        <span>Link to receipt or warranty <span className="opt">(optional)</span></span>
        <input type="url" inputMode="url" value={d.receiptUrl} onChange={(e) => set("receiptUrl", e.target.value)} placeholder="Drive or email link" />
      </label>
      <label className="full-row">
        <span>Notes <span className="opt">(optional)</span></span>
        <textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Paid with credit card, includes 3 years free servicing" />
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
