import { useMemo, useState } from "react";
import { icons } from "../../components/icons.jsx";
import { useCloudState } from "../../lib/useCloudState.js";
import { downloadFile, hostOf, safeUrl } from "../../lib/files.js";
import FixedToggle from "../../components/FixedToggle.jsx";
import {
  BILLING,
  CATEGORIES,
  STORAGE_KEY,
  UPCOMING_DAYS,
  WORTH,
  attention,
  byCategory,
  calendarFile,
  emptyState,
  newSub,
  parseISO,
  perMonth,
  perYear,
  price,
  shapeState,
  startOfToday,
  subStatus,
  summary,
  toISO,
  upcoming,
} from "./subs.js";
import "../_shared/loan/loan-tracker.css"; // tiles, forms, chips
import "../utilities/utilities.css"; // card header (ut-top), form and meta styles
import "../big-buys/big-buys.css"; // banner, empty-state guide, search bar
import "./subscriptions.css";

/**
 * My Subscriptions: every subscription you pay for, what each costs, when it next
 * charges, and what it all adds up to. Saved to the private Blob store as
 * tools/subscriptions.json.
 */
const money = (() => {
  const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n) => (n < 0 ? "−" : "") + "$" + nf.format(Math.abs(n));
})();
const fmtDate = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const when = (days) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const STATE_ORDER = { trial: 0, active: 1, paused: 2, cancelled: 3 };
const SORTS = {
  next: {
    label: "Next payment first",
    fn: (a, b) => STATE_ORDER[a.st.state] - STATE_ORDER[b.st.state] || (a.st.next ?? 9e15) - (b.st.next ?? 9e15),
  },
  cost: { label: "Most expensive first", fn: (a, b) => perMonth(b.s) - perMonth(a.s) },
  name: { label: "Name (A–Z)", fn: (a, b) => a.s.name.localeCompare(b.s.name) },
};

export default function Subscriptions() {
  const { state, setState, status, statusText } = useCloudState({
    id: "subscriptions",
    storageKey: STORAGE_KEY,
    shape: shapeState,
    empty: emptyState,
  });
  const today = useMemo(startOfToday, []);
  const [editing, setEditing] = useState(null); // subscription id being edited, or "new"
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("next");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  const subs = state.subs;
  const sum = useMemo(() => summary(subs, today), [subs, today]);
  const soon = useMemo(() => attention(subs, today), [subs, today]);
  const coming = useMemo(() => upcoming(subs, today), [subs, today]);
  const cats = useMemo(() => byCategory(subs, today), [subs, today]);
  const cancelled = subs.filter((s) => s.status === "cancelled");
  const live = subs.length - cancelled.length;
  const comingTotal = coming.reduce((a, c) => a + c.amount, 0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subs
      .filter((s) => (showCancelled || s.status !== "cancelled") && (cat === "all" || s.category === cat))
      .filter((s) => !reviewOnly || (s.status !== "cancelled" && (s.worth === "no" || s.worth === "unsure")))
      .filter((s) => !q || [s.name, s.plan, s.paidWith, s.account, s.notes].some((v) => (v || "").toLowerCase().includes(q)))
      .map((s) => ({ s, st: subStatus(s, today) }))
      .sort((a, b) => (a.st.state === "cancelled") - (b.st.state === "cancelled") || SORTS[sort].fn(a, b));
  }, [subs, query, cat, sort, reviewOnly, showCancelled, today]);

  const usedCats = useMemo(() => {
    const n = {};
    for (const s of subs) if (showCancelled || s.status !== "cancelled") n[s.category] = (n[s.category] || 0) + 1;
    return n;
  }, [subs, showCancelled]);

  const startNew = (category) => {
    setDraft(newSub(category, today));
    setEditing("new");
  };
  const startEdit = (s) => {
    setDraft({ ...s });
    setEditing(s.id);
  };
  const cancelEdit = () => {
    setDraft(null);
    setEditing(null);
  };
  const save = (sub) => {
    setState((st) => ({
      ...st,
      subs: st.subs.some((x) => x.id === sub.id) ? st.subs.map((x) => (x.id === sub.id ? sub : x)) : [sub, ...st.subs],
    }));
    cancelEdit();
  };
  const update = (id, patch) => setState((st) => ({ ...st, subs: st.subs.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const remove = (id) => setState((st) => ({ ...st, subs: st.subs.filter((x) => x.id !== id) }));

  const form = (id) =>
    editing === id && draft ? <SubForm draft={draft} setDraft={setDraft} onSave={save} onCancel={cancelEdit} isNew={id === "new"} /> : null;

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>My Subscriptions</h1>
          <div className="sub">Everything you pay for on repeat, what it costs and when it next charges</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn primary" type="button" onClick={() => startNew(cat === "all" ? "video" : cat)} disabled={!!editing}>
            {icons.plus} Add subscription
          </button>
        </div>
      </header>

      <FixedToggle
        on={state.sendToFixed}
        onChange={(v) => setState((st) => ({ ...st, sendToFixed: v }))}
        summary={sum.paying ? `${money(sum.month)} a month` : ""}
      />

      {(soon.trials.length > 0 || soon.renewals.length > 0) && (
        <section className={`bb-alert${soon.trials.length ? " su-alert-warn" : ""}`} role="alert">
          <strong>
            {soon.trials.length > 0 && `${soon.trials.length} free trial${soon.trials.length > 1 ? "s end" : " ends"} soon`}
            {soon.trials.length > 0 && soon.renewals.length > 0 && " · "}
            {soon.renewals.length > 0 && `${soon.renewals.length} big payment${soon.renewals.length > 1 ? "s" : ""} coming up`}
          </strong>
          <span>Cancel before the date if you don't want to be charged.</span>
          <ul>
            {[...soon.trials, ...soon.renewals].map(({ s, st }) => (
              <li key={s.id}>
                <b>{s.name}</b> · {st.state === "trial" ? "trial ends" : "renews"} {fmtDate(st.next)} ({when(st.days)}) ·{" "}
                <span className="num">{money(price(s))}</span>
                {st.state === "trial" ? ` a ${BILLING[s.billing]?.short} after that` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {live > 0 && (
        <section className="tiles" aria-label="Summary">
          <div className="tile" style={{ "--c": "var(--accent)" }}>
            <span className="k">Per month</span>
            <span className="v num">{money(sum.month)}</span>
            <span className="of">
              {sum.paying} paying
              {sum.trials > 0 && <> · {sum.trials} on free trial</>}
              {sum.paused > 0 && <> · {sum.paused} paused</>}
            </span>
          </div>
          <div className="tile" style={{ "--c": "var(--interest)" }}>
            <span className="k">Per year</span>
            <span className="v num">{money(sum.year)}</span>
            <span className="of num">
              {sum.trials > 0 ? `${money((sum.month + sum.trialsAfter) * 12)} once trials end` : "at today's prices"}
            </span>
          </div>
          <div className="tile" style={{ "--c": "var(--soon)" }}>
            <span className="k">Next {UPCOMING_DAYS} days</span>
            <span className="v num">{money(comingTotal)}</span>
            <span className="of">
              {coming.length} payment{coming.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>
      )}

      {sum.review > 0 && (
        <section className="su-review">
          <span>
            You've marked <b>{sum.review}</b> as not sure or thinking of cancelling. Cancelling {sum.review === 1 ? "it" : "them"} would
            save <b className="num">{money(sum.reviewMonth)}</b> a month (<span className="num">{money(sum.reviewMonth * 12)}</span> a
            year).
          </span>
          <button className="btn small" type="button" aria-pressed={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
            {reviewOnly ? "Show all" : `Show ${sum.review === 1 ? "it" : "them"}`}
          </button>
        </section>
      )}

      {form("new")}

      {live > 0 && (
        <div className="su-panels">
          <section className="su-panel" aria-label="Coming up">
            <h2>Coming up</h2>
            {coming.length === 0 ? (
              <p className="note">Nothing charges in the next {UPCOMING_DAYS} days.</p>
            ) : (
              <ul className="su-list">
                {coming.slice(0, 8).map(({ s, date, amount }) => (
                  <li key={`${s.id}-${toISO(date)}`}>
                    <span className="su-date">{fmtShort(date)}</span>
                    <span className="su-name">
                      {s.name}
                      {s.trial && toISO(date) === s.trialEnds && <span className="su-tag">trial ends</span>}
                    </span>
                    <b className="num">{money(amount)}</b>
                  </li>
                ))}
                {coming.length > 8 && <li className="su-more">and {coming.length - 8} more</li>}
              </ul>
            )}
          </section>
          <section className="su-panel" aria-label="Where it goes">
            <h2>Where it goes</h2>
            {cats.length === 0 ? (
              <p className="note">Nothing being paid for right now.</p>
            ) : (
              <ul className="su-list">
                {cats.map(({ key, month }) => {
                  const c = CATEGORIES[key] ?? CATEGORIES.other;
                  return (
                    <li key={key}>
                      <span className="su-ico">{icons[c.icon]}</span>
                      <span className="su-name">{c.label}</span>
                      <span className="su-dim num">{Math.round((month / sum.month) * 100)}%</span>
                      <b className="num">{money(month)}/mo</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {subs.length === 0 && editing !== "new" && (
        <section className="bb-guide">
          <h2>What are you subscribed to?</h2>
          <p>Add each thing that charges you on repeat. Pick a category to add your first one.</p>
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

      {subs.length > 0 && (
        <div className="bb-tools">
          <input type="search" placeholder="Search name, plan, card, account…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search subscriptions" />
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
          {cancelled.length > 0 && (
            <label className="bb-check">
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show {cancelled.length}{" "}
              cancelled
            </label>
          )}
        </div>
      )}

      <div className="stack">
        {shown.map(({ s, st }) =>
          editing === s.id ? (
            <div key={s.id}>{form(s.id)}</div>
          ) : (
            <SubCard
              key={s.id}
              s={s}
              st={st}
              today={today}
              busy={!!editing}
              onEdit={() => startEdit(s)}
              onUpdate={(patch) => update(s.id, patch)}
              onRemove={() => remove(s.id)}
            />
          )
        )}
        {subs.length > 0 && shown.length === 0 && <p className="note">Nothing matches that search.</p>}
      </div>

      {cancelled.length > 0 && (
        <p className="note su-saved">
          Cancelled {cancelled.length === 1 ? "subscription" : `${cancelled.length} subscriptions`}:{" "}
          <span className="num">{money(cancelled.reduce((a, s) => a + perMonth(s), 0))}</span> a month you're no longer paying.
        </p>
      )}
    </div>
  );
}

/* ---------- card ---------- */

function StatusChip({ s, st }) {
  if (st.state === "cancelled") return <span className="chip su-chip-off">Cancelled</span>;
  if (st.state === "paused") return <span className="chip su-chip-off">Paused</span>;
  if (st.state === "trial") return <span className={`chip ${st.flag ? "su-chip-warn" : "su-chip-trial"}`}>Free trial · ends {when(st.days)}</span>;
  if (st.flag) return <span className="chip su-chip-soon">Renews {when(st.days)}</span>;
  return <span className="chip">{BILLING[s.billing]?.label ?? "Monthly"}</span>;
}

function SubCard({ s, st, today, busy, onEdit, onUpdate, onRemove }) {
  const [more, setMore] = useState(false);
  const [armed, setArmed] = useState(false);
  const c = CATEGORIES[s.category] ?? CATEGORIES.other;
  const b = BILLING[s.billing] ?? BILLING.month;
  const link = safeUrl(s.url);
  const off = st.state === "cancelled" || st.state === "paused";

  const del = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3000);
      return;
    }
    onRemove();
  };
  const remind = () => {
    const { name, text } = calendarFile(s, today, money);
    downloadFile(name, text, "text/calendar");
  };

  return (
    <article className="su-card" data-state={st.state} data-flag={st.flag ? "1" : undefined}>
      <div className="ut-top">
        <span className="ico">{icons[c.icon]}</span>
        <div className="ut-who">
          <span className="ut-type">{c.label}</span>
          <b>{s.name || "Unnamed subscription"}</b>
          {s.plan && <span className="ut-plan">{s.plan}</span>}
        </div>
        <StatusChip s={s} st={st} />
      </div>

      <div className="su-price">
        <span className={`su-now num${off ? " su-was" : ""}`}>
          {money(price(s))}
          <small> / {b.short}</small>
        </span>
        {s.billing !== "month" && <span className="num">≈ {money(perMonth(s))} a month</span>}
        {s.billing !== "year" && <span className="num">≈ {money(perYear(s))} a year</span>}
      </div>

      <div className="bb-facts">
        {st.state === "trial" && (
          <span>
            Free until <b>{fmtDate(st.next)}</b>, then {money(price(s))} a {b.short}
          </span>
        )}
        {st.state === "active" && st.next && (
          <span>
            Next payment <b>{fmtDate(st.next)}</b> ({when(st.days)})
          </span>
        )}
        {st.state === "paused" && <span>On hold: not being charged</span>}
        {st.state === "cancelled" && s.cancelledOn && (
          <span>
            Cancelled <b>{fmtDate(parseISO(s.cancelledOn))}</b>
          </span>
        )}
        {!off && s.worth !== "yes" && <span className={`su-worth su-worth-${s.worth}`}>{WORTH[s.worth]}</span>}
      </div>

      {(s.paidWith || s.account || link || s.notes) && (
        <div className="ut-meta">
          {s.paidWith && (
            <span>
              Paid with <b>{s.paidWith}</b>
            </span>
          )}
          {s.account && <span>Account {s.account}</span>}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer">
              Manage at {hostOf(link)} ↗
            </a>
          )}
          {s.notes && <span className="bb-notes">{s.notes}</span>}
        </div>
      )}

      <div className="head-actions">
        <button className="btn small" type="button" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        {(st.state === "active" || st.state === "trial") && st.next && (
          <button className="btn small" type="button" onClick={remind}>
            {icons.calendar} {st.state === "trial" ? "Remind me before the trial ends" : "Remind me before it renews"}
          </button>
        )}
        <button className="btn small" type="button" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          {more ? "Less" : "More"}
        </button>
        {more && (
          <>
            {st.state === "cancelled" ? (
              <button className="btn small" type="button" onClick={() => onUpdate({ status: "active", cancelledOn: "" })}>
                Subscribed again
              </button>
            ) : (
              <>
                <button className="btn small" type="button" onClick={() => onUpdate({ status: st.state === "paused" ? "active" : "paused" })}>
                  {st.state === "paused" ? "Resume" : "Pause"}
                </button>
                <button className="btn small" type="button" onClick={() => onUpdate({ status: "cancelled", cancelledOn: toISO(today) })}>
                  I've cancelled it
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

/* ---------- add / edit ---------- */

function SubForm({ draft: d, setDraft, onSave, onCancel, isNew }) {
  const [err, setErr] = useState("");
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const cat = CATEGORIES[d.category] ?? CATEGORIES.other;

  const submit = (e) => {
    e.preventDefault();
    if (!d.name.trim()) return setErr("Add what the subscription is.");
    if (d.price === "" || !(Number(d.price) >= 0)) return setErr("Add how much it costs.");
    if (d.trial && !d.trialEnds) return setErr("Add when the free trial ends.");
    if (!d.trial && !d.nextPayment) return setErr("Add when it next charges you.");
    const clean = (k) => (d[k] || "").trim();
    onSave({
      ...d,
      name: clean("name"),
      plan: clean("plan"),
      paidWith: clean("paidWith"),
      account: clean("account"),
      url: clean("url"),
      notes: clean("notes"),
      price: Number(d.price) || 0,
      // After a trial, charges follow on from the day it ends
      nextPayment: d.trial ? d.trialEnds : d.nextPayment,
    });
  };

  return (
    <form className="settings ut-form" onSubmit={submit} noValidate aria-label={isNew ? "Add a subscription" : "Edit subscription"}>
      <h2 className="full-row">{isNew ? "Add a subscription" : `Edit ${d.name || "subscription"}`}</h2>

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
        Name
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={`e.g. ${cat.examples.split(",")[0]}`} autoFocus />
      </label>
      <label>
        <span>Plan <span className="opt">(optional)</span></span>
        <input value={d.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. Family, Premium, Standard with ads" />
      </label>
      <label>
        Price ($)
        <input type="number" inputMode="decimal" min="0" step="0.01" value={d.price} onChange={(e) => set("price", e.target.value)} />
      </label>
      <label>
        Charged
        <select value={d.billing} onChange={(e) => set("billing", e.target.value)}>
          {Object.entries(BILLING).map(([k, b]) => (
            <option key={k} value={k}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      {d.trial ? (
        <label>
          Free trial ends
          <input type="date" value={d.trialEnds} onChange={(e) => set("trialEnds", e.target.value)} />
        </label>
      ) : (
        <label>
          Next payment date
          <input type="date" value={d.nextPayment} onChange={(e) => set("nextPayment", e.target.value)} />
        </label>
      )}
      <label className="su-inline full-row">
        <input type="checkbox" checked={!!d.trial} onChange={(e) => set("trial", e.target.checked)} /> On a free trial
        {d.trial && <span className="opt"> · the price above starts when the trial ends</span>}
      </label>

      <h2 className="full-row bb-sub">Keeping track</h2>
      <label>
        <span>Paid with <span className="opt">(optional)</span></span>
        <input value={d.paidWith} onChange={(e) => set("paidWith", e.target.value)} placeholder="e.g. Visa ending 1234, PayPal, Apple ID" />
      </label>
      <label>
        <span>Account <span className="opt">(optional)</span></span>
        <input value={d.account} onChange={(e) => set("account", e.target.value)} placeholder="e.g. the email you signed up with" />
      </label>
      <label>
        <span>Link to manage or cancel <span className="opt">(optional)</span></span>
        <input type="url" inputMode="url" value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="e.g. netflix.com/account" />
      </label>
      <label>
        Still worth it?
        <select value={d.worth} onChange={(e) => set("worth", e.target.value)}>
          {Object.entries(WORTH).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="full-row">
        <span>Notes <span className="opt">(optional)</span></span>
        <textarea rows={2} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Shared with family, price goes up in March" />
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
