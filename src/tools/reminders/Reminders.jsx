import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useCloudState } from "../../lib/useCloudState.js";
import { DAY_OPTIONS, KINDS, defaultSettings, shapeSettings, whenText } from "./rules.js";
import "../_shared/loan/loan-tracker.css"; // header, save status and notes
import "./reminders.css";

/**
 * Email Reminders: which reminders to send and how far ahead. The emails come from
 * the daily job in api/notify.js, which reads these settings (tools/reminders.json).
 * The address and email service key are server settings (NOTIFY_EMAIL, RESEND_API_KEY).
 */
const fmtDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
};
const fmtWhen = (isoTime) =>
  new Date(isoTime).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const TOOL_NAMES = {
  "car-loan": "My Car Loan",
  "home-loan": "My Home Loan",
  subscriptions: "My Subscriptions",
  utilities: "Household Utilities",
  "big-buys": "Big Buys & Warranties",
};

export default function Reminders() {
  const { state: s, setState, status, statusText } = useCloudState({
    id: "reminders",
    storageKey: "tools:reminders:v1",
    shape: shapeSettings,
    empty: defaultSettings(),
  });
  const [preview, setPreview] = useState(null); // server's view: setup status + what's due
  const [previewErr, setPreviewErr] = useState("");
  const [test, setTest] = useState({ state: "idle", msg: "" });

  // Refresh the preview once settings have reached the server
  const key = JSON.stringify(s);
  useEffect(() => {
    if (status !== "saved") return;
    let alive = true;
    api
      .notify("preview")
      .then((r) => alive && (setPreview(r), setPreviewErr("")))
      .catch((e) => alive && setPreviewErr(e.code === "no_api" || e.code === "offline" ? "Can't reach the server right now." : "Couldn't load what's coming up."));
    return () => {
      alive = false;
    };
  }, [status, key]);

  const setKind = (k, patch) => setState((st) => ({ ...st, kinds: { ...st.kinds, [k]: { ...st.kinds[k], ...patch } } }));

  const sendTest = async () => {
    setTest({ state: "sending", msg: "" });
    try {
      const r = await api.notify("test");
      setTest({ state: "ok", msg: `Sent to ${r.to}${r.sent ? ` with ${r.sent} reminder${r.sent > 1 ? "s" : ""}` : ""}. Check your inbox (and junk folder).` });
    } catch (e) {
      const msg =
        e.code === "server" && e.error === "not_configured"
          ? "Email isn't set up yet. See the steps above."
          : e.code === "no_api" || e.code === "offline"
            ? "Can't reach the server right now."
            : e.detail || "Couldn't send the email.";
      setTest({ state: "err", msg });
    }
  };

  const items = preview?.items ?? [];

  return (
    <div className="wrap">
      <header className="loan-head">
        <div>
          <h1>Email Reminders</h1>
          <div className="sub">Emails only when something's close, nothing otherwise.</div>
        </div>
        <div className="head-actions">
          <span className="save" data-s={status} role="status">
            {statusText}
          </span>
        </div>
      </header>

      {preview && !preview.configured && (
        <section className="rm-setup">
          <strong>Email isn't set up yet</strong>
          <ol>
            <li>
              Sign up at <a href="https://resend.com" target="_blank" rel="noopener noreferrer">resend.com</a> (free) with the email
              address you want reminders sent to, and create an API key.
            </li>
            <li>
              In Vercel › your project › Settings › Environment Variables, add:
              <ul>
                {preview.missing.includes("RESEND_API_KEY") && (
                  <li>
                    <code>RESEND_API_KEY</code>: the key from Resend
                  </li>
                )}
                {preview.missing.includes("NOTIFY_EMAIL") && (
                  <li>
                    <code>NOTIFY_EMAIL</code>: where reminders go (the address you signed up to Resend with)
                  </li>
                )}
                {!preview.cron && (
                  <li>
                    <code>CRON_SECRET</code>: any long random text, so only Vercel's scheduler can trigger the daily check
                  </li>
                )}
              </ul>
            </li>
            <li>Redeploy, then come back here and tap Send a test email.</li>
          </ol>
        </section>
      )}
      {preview?.configured && !preview.cron && (
        <section className="rm-setup">
          <strong>Daily check isn't switched on</strong>
          <span>
            Add <code>CRON_SECRET</code> (any long random text) in Vercel's Environment Variables and redeploy. Test emails work
            without it.
          </span>
        </section>
      )}

      <div className="fx-toggle" data-on={s.enabled ? "1" : undefined}>
        <label>
          <input type="checkbox" role="switch" checked={s.enabled} onChange={(e) => setState((st) => ({ ...st, enabled: e.target.checked }))} />
          <span className="fx-switch" aria-hidden="true" />
          <span>
            <b>Email reminders {s.enabled ? "on" : "off"}</b>
            <small>Checked once a day, early morning (Sydney time)</small>
          </span>
        </label>
      </div>

      <section className="stack" aria-label="What to remind me about">
        <h2>Remind me about</h2>
        {Object.entries(KINDS).map(([k, kind]) => {
          const v = s.kinds[k];
          return (
            <div key={k} className="fx-toggle rm-kind" data-on={v.on && s.enabled ? "1" : undefined} data-off={!s.enabled ? "1" : undefined}>
              <label>
                <input type="checkbox" role="switch" checked={v.on} onChange={(e) => setKind(k, { on: e.target.checked })} disabled={!s.enabled} />
                <span className="fx-switch" aria-hidden="true" />
                <span>
                  <b>{kind.label}</b>
                  <small>{kind.hint}</small>
                </span>
              </label>
              <label className="rm-days">
                <select value={v.days} onChange={(e) => setKind(k, { days: Number(e.target.value) })} disabled={!s.enabled || !v.on} aria-label={`${kind.label}: days before`}>
                  {(DAY_OPTIONS.includes(v.days) ? DAY_OPTIONS : [...DAY_OPTIONS, v.days].sort((a, b) => a - b)).map((d) => (
                    <option key={d} value={d}>
                      {d} day{d > 1 ? "s" : ""} before
                    </option>
                  ))}
                </select>
              </label>
              {kind.dailyLabel && (
                <label className="rm-daily">
                  <input type="checkbox" checked={!!v.daily} onChange={(e) => setKind(k, { daily: e.target.checked })} disabled={!s.enabled || !v.on} />
                  {kind.dailyLabel}
                </label>
              )}
            </div>
          );
        })}
      </section>

      <section className="rm-coming" aria-label="Coming up">
        <div className="payout-head">
          <h2>Coming up</h2>
          <button className="btn" type="button" onClick={sendTest} disabled={test.state === "sending"}>
            {test.state === "sending" ? "Sending…" : "Send a test email"}
          </button>
        </div>
        {test.msg && (
          <p className={`rm-msg ${test.state}`} role="status">
            {test.msg}
          </p>
        )}
        {previewErr && <p className="note">{previewErr}</p>}
        {preview && !items.length && (
          <p className="note">{s.enabled ? "Nothing is close enough to email about right now." : "Reminders are off."}</p>
        )}
        {items.length > 0 && (
          <ul className="rm-list">
            {items.map((i) => (
              <li key={i.key}>
                <span className="rm-when">
                  {cap(whenText(i.days))}
                  <small>{fmtDate(i.date)}</small>
                </span>
                <span className="rm-what">
                  <a href={`#/${i.tool}`}>{i.title}</a>
                  <small>
                    {TOOL_NAMES[i.tool]} · {i.detail}
                  </small>
                </span>
                <span className={`chip ${i.sent ? "rm-sent" : ""}`}>
                  {i.daily ? (i.sent ? "Emailed today" : "Emails daily") : i.sent ? "Emailed" : "Will email"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="note">
          Each reminder is emailed once, on the first morning it's within your notice period, unless it's set to repeat daily. If
          several land on the same day, they come in one email.
          {preview?.lastRun && <> Last daily check: {fmtWhen(preview.lastRun.at)}{preview.lastRun.sent ? `, emailed ${preview.lastRun.sent}` : ", nothing new to send"}.</>}
        </p>
      </section>
    </div>
  );
}
