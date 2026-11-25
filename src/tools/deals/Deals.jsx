import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { useCloudState } from "../../lib/useCloudState.js";
import { icons } from "../../components/icons.jsx";
import { CATEGORIES, LIMITS, MARKS, STORAGE_KEY, emptyState, shapeState } from "./feed.js";
import "../_shared/loan/loan-tracker.css"; // header, save status, chips, notes
import "./deals.css";

/**
 * Deals & Sign-up Bonuses: a thread of posts, one per scan (weekly, or on demand), each with
 * Tavily's AI summary per category and the new links it found. The feed is written by the
 * server (api/deals.js); what you mark (interested / signed up / not for me) and which
 * categories to scan are saved here as tools/deals.json.
 */
const fmtWhen = (iso) =>
  new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtWait = (secs) => (secs >= 86400 ? `${Math.ceil(secs / 86400)} days` : secs >= 3600 ? `${Math.ceil(secs / 3600)} h` : `${Math.max(1, Math.ceil(secs / 60))} min`);
const VIEWS = { all: "All", star: "Interested", signed: "Signed up", hidden: "Hidden" };

export default function Deals() {
  const { state, setState, status, statusText } = useCloudState({ id: "deals", storageKey: STORAGE_KEY, shape: shapeState, empty: emptyState });
  const [feed, setFeed] = useState(null); // { posts, configured, limits, allowance }
  const [err, setErr] = useState("");
  const [scan, setScan] = useState({ state: "idle", msg: "" });
  const [view, setView] = useState("all");
  const [cat, setCat] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    api
      .deals("feed")
      .then(setFeed)
      .catch((e) => setErr(e.code === "no_api" || e.code === "offline" ? "Can't reach the server right now." : "Couldn't load the deals feed."));
  }, []);

  const scanNow = async () => {
    setScan({ state: "busy", msg: "" });
    try {
      const r = await api.deals("scan");
      setFeed(r);
      const failed = r.errors?.length ? ` ${r.errors.length} search${r.errors.length > 1 ? "es" : ""} failed.` : "";
      setScan({ state: "ok", msg: (r.new ? `Found ${r.new} new link${r.new > 1 ? "s" : ""}.` : "Nothing new since the last scan.") + failed });
    } catch (e) {
      const msg =
        e.code === "too_many"
          ? `You can scan again in ${fmtWait(e.retryAfter || 60)}.`
          : e.error === "not_configured"
            ? "Add TAVILY_API_KEY in Vercel first (see below)."
            : e.detail || "The scan didn't work. Try again later.";
      setScan({ state: "err", msg });
    }
  };

  const mark = (url, m) =>
    setState((st) => {
      const marks = { ...st.marks };
      if (!m || marks[url] === m) delete marks[url];
      else marks[url] = m;
      return { ...st, marks };
    });

  const allow = feed?.allowance;
  const posts = useMemo(() => {
    const keep = (r) => {
      const m = state.marks[r.url];
      if (view === "hidden") return m === "hide";
      if (m === "hide") return false;
      return view === "all" || m === view;
    };
    return (feed?.posts ?? [])
      .map((p) => ({
        ...p,
        sections: p.sections.filter((s) => cat === "all" || s.cat === cat).map((s) => ({ ...s, results: s.results.filter(keep) })).filter((s) => s.results.length),
      }))
      .filter((p) => p.sections.length || (view === "all" && cat === "all"));
  }, [feed, state.marks, view, cat]);

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Deals &amp; Sign-up Bonuses</h1>
          <div className="sub">Offers for new customers, found on the web every week or when you ask</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
          <button className="btn" type="button" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Done" : "What to search"}
          </button>
        </div>
      </header>

      {feed && !feed.configured && (
        <section className="rm-setup dl-setup">
          <strong>Searching isn't set up yet</strong>
          <ol>
            <li>
              Sign up at{" "}
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
                tavily.com
              </a>{" "}
              (free: 1,000 searches a month, no card) and copy your API key.
            </li>
            <li>
              In Vercel › Settings › Environment Variables, add <code>TAVILY_API_KEY</code>, then redeploy.
            </li>
          </ol>
        </section>
      )}

      {showSettings && (
        <section className="settings dl-settings">
          <h2 className="full-row">Search these</h2>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <label key={k} className="dl-check">
              <input type="checkbox" checked={state.categories[k] !== false} onChange={(e) => setState((st) => ({ ...st, categories: { ...st.categories, [k]: e.target.checked } }))} />
              {c.label}
            </label>
          ))}
          <label className="dl-check full-row">
            <input type="checkbox" checked={state.email} onChange={(e) => setState((st) => ({ ...st, email: e.target.checked }))} />
            Email me the new deals after each weekly scan (needs email reminders set up)
          </label>
          <p className="note full-row">Each category is one search. Fewer categories use fewer of Tavily's free monthly searches.</p>
        </section>
      )}

      <section className="dl-scan">
        <div>
          <b>{allow?.lastScan ? `Last scan ${fmtWhen(allow.lastScan)}` : "No scans yet"}</b>
          <small>
            Scans every Monday morning on its own.{" "}
            {allow &&
              (allow.ok
                ? `${allow.left} on-demand scan${allow.left === 1 ? "" : "s"} left this month.`
                : `Next on-demand scan in ${fmtWait(allow.retryAfter)}.`)}{" "}
            (At most one every {LIMITS.minGapHours} hours and {LIMITS.manualPer30Days} a month.)
          </small>
          {scan.msg && <small className={`dl-msg ${scan.state}`}>{scan.msg}</small>}
        </div>
        <button className="btn primary" type="button" onClick={scanNow} disabled={scan.state === "busy" || (allow && !allow.ok) || (feed && !feed.configured)}>
          {scan.state === "busy" ? "Searching…" : "Find deals now"}
        </button>
      </section>

      {feed?.posts?.length > 0 && (
        <div className="dl-filters">
          <div className="dl-tabs" role="tablist">
            {Object.entries(VIEWS).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} className={`btn small${view === k ? " on" : ""}`} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {err && <p className="note">{err}</p>}
      {feed && !feed.posts.length && feed.configured && <p className="note">No deals yet. Tap “Find deals now”, or wait for Monday's scan.</p>}
      {feed?.posts?.length > 0 && !posts.length && <p className="note">Nothing here with these filters.</p>}

      <div className="dl-thread">
        {posts.map((p) => (
          <article key={p.id} className="dl-post">
            <header>
              <span className="dl-dot" aria-hidden="true" />
              <b>{fmtWhen(p.at)}</b>
              <span className="chip">{p.trigger === "weekly" ? "Weekly scan" : "On demand"}</span>
            </header>
            {!p.sections.length && <p className="note">Nothing new this time{p.errors?.length ? ` (${p.errors.length} search${p.errors.length > 1 ? "es" : ""} failed)` : ""}.</p>}
            {p.sections.map((s) => {
              const c = CATEGORIES[s.cat] ?? { label: s.cat, icon: "tag" };
              return (
                <section key={s.cat} className="dl-section">
                  <h3>
                    <span className="ico">{icons[c.icon] ?? icons.tag}</span>
                    {c.label}
                  </h3>
                  {s.answer && <p className="dl-answer">{s.answer}</p>}
                  <ul>
                    {s.results.map((r) => {
                      const m = state.marks[r.url];
                      return (
                        <li key={r.url} data-mark={m}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            {r.title}
                          </a>
                          <small>{r.domain}</small>
                          {r.snippet && <p>{r.snippet}</p>}
                          <div className="dl-marks">
                            {Object.entries(MARKS).map(([k, label]) => (
                              <button key={k} type="button" className={`btn small${m === k ? " on" : ""}`} aria-pressed={m === k} onClick={() => mark(r.url, k)}>
                                {k === "star" ? "★ " : k === "signed" ? "✓ " : "✕ "}
                                {label}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </article>
        ))}
      </div>

      {feed?.posts?.length > 0 && (
        <p className="note">
          Summaries are written by Tavily's AI from the search results and can miss fine print or include ended offers. Check the terms on
          the provider's site before signing up.
        </p>
      )}
    </div>
  );
}
