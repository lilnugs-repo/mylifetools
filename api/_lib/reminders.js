// The daily reminder run: read each tool's saved data, work out what's due
// (src/tools/reminders/rules.js), and email anything not already sent.
// Storage and email are passed in, so the run can be tested without Blob or Resend.
import { SOURCE_IDS, collect, shapeSettings, defaultSettings, whenText } from "../../src/tools/reminders/rules.js";

export const SENT = "_system/reminders-sent.json";
const KEEP_DAYS = 180; // forget sent reminders after this long

/** Today's date (midnight) in the user's time zone; the server itself runs on UTC. */
export function todayIn(timeZone = process.env.NOTIFY_TZ || "Australia/Sydney", now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

/** Names of the env vars that email needs and aren't set. */
export function missingConfig() {
  return ["RESEND_API_KEY", "NOTIFY_EMAIL"].filter((k) => !process.env[k]);
}

/** Every tool's saved data and the reminder settings, from storage. */
export async function loadAll(readJSON) {
  const data = {};
  await Promise.all(SOURCE_IDS.map(async (id) => (data[id] = (await readJSON(`tools/${id}.json`))?.data ?? null)));
  const settings = shapeSettings((await readJSON("tools/reminders.json"))?.data) ?? defaultSettings();
  return { data, settings };
}

/**
 * One daily run. Returns { sent, items, skipped }.
 * `force` sends whatever is due now even if it was sent before (the Send test email button).
 */
export async function runReminders({ readJSON, writeJSON, sendEmail, today, appUrl, force = false }) {
  const { data, settings } = await loadAll(readJSON);
  const log = (await readJSON(SENT)) || { sent: {} };
  const items = settings.enabled || force ? collect(data, settings, today) : [];
  const fresh = force ? items : items.filter((i) => !log.sent[i.key]);

  let sent = 0;
  if (fresh.length || force) {
    await sendEmail(buildEmail(fresh, appUrl, { test: force }));
    sent = fresh.length;
  }

  // Remember what went out (not for tests), and forget old entries
  const stamp = new Date().toISOString();
  if (!force) for (const i of fresh) log.sent[i.key] = stamp;
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const [k, at] of Object.entries(log.sent)) if (Date.parse(at) < cutoff) delete log.sent[k];
  log[force ? "lastTest" : "lastRun"] = { at: stamp, due: items.length, sent };
  await writeJSON(SENT, log);

  return { sent, items, skipped: items.length - fresh.length };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

/** Subject, plain text and HTML for one reminder email. */
export function buildEmail(items, appUrl, { test = false } = {}) {
  const subject = test
    ? "Test email from My Life Tools"
    : items.length === 1
      ? `${items[0].title} ${whenText(items[0].days)}`
      : `${items.length} things coming up soon`;
  const intro = test
    ? items.length
      ? "Email reminders are working. Here's what's coming up right now:"
      : "Email reminders are working. Nothing is due soon, so this is all for now."
    : "Heads up, these are coming up soon:";
  const link = (i) => (appUrl ? `${appUrl}/#/${i.tool}` : "");

  const text = [
    intro,
    "",
    ...items.flatMap((i) => [`• ${i.title}, ${whenText(i.days)} (${fmtDate(i.date)})`, `  ${i.detail}`, link(i) && `  ${link(i)}`, ""]).filter((l) => l !== ""),
    "",
    "You get these because email reminders are on in My Life Tools. Change them under Email Reminders.",
  ].join("\n");

  const rows = items
    .map(
      (i) => `<tr><td style="padding:12px 0;border-top:1px solid #e3d9ca">
  <div style="font-size:12px;color:#a5532d;font-weight:700">${escapeHtml(whenText(i.days)[0].toUpperCase() + whenText(i.days).slice(1))} · ${escapeHtml(fmtDate(i.date))}</div>
  <div style="font-size:16px;font-weight:700;color:#2f2a24;margin:2px 0">${escapeHtml(i.title)}</div>
  <div style="font-size:14px;color:#75695c">${escapeHtml(i.detail)}</div>
  ${link(i) ? `<a href="${escapeHtml(link(i))}" style="font-size:14px;color:#4d6b51;font-weight:700;text-decoration:none">Open in My Life Tools →</a>` : ""}
</td></tr>`
    )
    .join("");
  const html = `<div style="background:#f6f1e9;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fffcf7;border:1px solid #e3d9ca;border-radius:12px;padding:20px 24px;width:100%">
<tr><td style="font-size:20px;font-weight:700;color:#2f2a24;padding-bottom:8px">My Life Tools</td></tr>
<tr><td style="font-size:15px;color:#2f2a24;padding-bottom:8px">${escapeHtml(intro)}</td></tr>
${rows}
<tr><td style="font-size:12px;color:#75695c;padding-top:16px;border-top:1px solid #e3d9ca">You get these because email reminders are on in My Life Tools. Change them under Email Reminders.</td></tr>
</table></div>`;

  return { subject, text, html };
}

/** Sends through Resend's HTTP API (https://resend.com). */
export async function sendWithResend({ subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || "My Life Tools <onboarding@resend.dev>",
      to: process.env.NOTIFY_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`Resend refused the email (${res.status}): ${body.slice(0, 300)}`), { status: 502 });
  }
}
