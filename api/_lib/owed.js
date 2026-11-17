// Emails to people who owe you money (Money Owed to Me): a note when an entry is
// created, and reminders once the return date has passed. Storage and sending are
// passed in, so the daily run can be tested without Blob or Resend.
import { amountOf, canEmail, outstandingOf, parseISO, remindersDue, repaidOf, shapeState, toISO } from "../../src/tools/money-owed/owed.js";

export const OWED_SENT = "_system/money-owed-sent.json"; // { [entryId]: { last: "YYYY-MM-DD" (your time zone), count } }

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aud = (n) => "$" + nf.format(n);
const fmtD = (iso) => parseISO(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "there";

/** Sender's address problems that stop emails reaching anyone but the Resend account owner. */
export function friendEmailProblem() {
  if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY isn't set.";
  const from = process.env.NOTIFY_FROM || "";
  if (!from || /@resend\.dev>?\s*$/i.test(from))
    return "Emails to other people need your own sending address: verify a domain in Resend and set NOTIFY_FROM to an address on it.";
  return null;
}

/**
 * Subject, text and HTML for an email to the borrower.
 * kind "new": a note that the loan was recorded. kind "reminder": it's past the return date.
 */
export function friendEmail(kind, e, me, today) {
  const who = (me || "").trim() || "A friend";
  const amount = aud(amountOf(e));
  const left = outstandingOf(e);
  const repaid = repaidOf(e);
  const daysLate = Math.max(0, Math.round((today - parseISO(e.due)) / 864e5));
  const forWhat = e.what ? ` for ${e.what}` : "";

  const subject =
    kind === "new"
      ? `${who} lent you ${amount}: due back ${fmtD(e.due)}`
      : `Friendly reminder: ${aud(left)} owed to ${who} was due ${fmtD(e.due)}`;

  const lines =
    kind === "new"
      ? [
          `Hi ${firstName(e.name)},`,
          `Just a quick note so we're both on the same page: ${who} lent you ${amount}${forWhat} on ${fmtD(e.lent)}.`,
          `It's due back by ${fmtD(e.due)}.`,
          e.remind ? "If it's still outstanding after that, you'll get a friendly reminder by email." : "",
          `If anything here doesn't look right, just reply to this email.`,
          "Thanks!",
        ]
      : [
          `Hi ${firstName(e.name)},`,
          `A friendly reminder that the ${amount} ${who} lent you${forWhat} on ${fmtD(e.lent)} was due back on ${fmtD(e.due)}` +
            (daysLate > 1 ? ` (${daysLate} days ago).` : "."),
          repaid > 0 ? `Thanks for the ${aud(repaid)} paid back so far. ${aud(left)} is still to go.` : `${aud(left)} is still to go.`,
          `If you've already paid, or need a bit more time, just reply to this email.`,
          "Thanks!",
        ];
  const body = lines.filter(Boolean);

  const rows = [
    ["Lent", `${amount} on ${fmtD(e.lent)}`],
    ...(e.what ? [["For", e.what]] : []),
    ["Due back", fmtD(e.due)],
    ...(repaid > 0 ? [["Paid back so far", aud(repaid)]] : []),
    ["Still owed", aud(left)],
  ];
  const footer = `Sent on behalf of ${who} by My Life Tools. Replies go straight to ${who}.`;

  const text = [...body, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", footer].join("\n");
  const html = `<div style="background:#f6f1e9;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" style="max-width:520px;margin:0 auto;background:#fffcf7;border:1px solid #e3d9ca;border-radius:12px;padding:20px 24px;width:100%">
${body.map((l) => `<tr><td style="font-size:15px;color:#2f2a24;padding:0 0 10px;line-height:1.5">${escapeHtml(l)}</td></tr>`).join("")}
<tr><td><table role="presentation" style="width:100%;border-collapse:collapse;margin:6px 0 4px;font-size:14px">
${rows
  .map(
    ([k, v], i) =>
      `<tr><td style="color:#75695c;padding:6px 12px 6px 0;border-top:1px solid #efe7da;white-space:nowrap">${escapeHtml(k)}</td><td style="color:#2f2a24;padding:6px 0;border-top:1px solid #efe7da;text-align:right;${i === rows.length - 1 ? "font-weight:700" : ""}">${escapeHtml(v)}</td></tr>`
  )
  .join("")}
</table></td></tr>
<tr><td style="font-size:12px;color:#75695c;padding-top:12px">${escapeHtml(footer)}</td></tr>
</table></div>`;
  return { subject, text, html };
}

/** Sends one email to the borrower through Resend. Replies go to you (NOTIFY_EMAIL). */
export async function sendToBorrower(to, { subject, text, html }) {
  const replyTo = (process.env.NOTIFY_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || "My Life Tools <onboarding@resend.dev>",
      to: [to],
      ...(replyTo.length && { reply_to: replyTo }),
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

/** The daily run: remind everyone whose return date has passed, per their entry's settings. */
export async function runOwed({ readJSON, writeJSON, send, today }) {
  const state = shapeState((await readJSON("tools/money-owed.json"))?.data);
  if (!state) return { sent: 0, failed: 0 };
  const log = (await readJSON(OWED_SENT)) || {};
  let sent = 0, failed = 0;
  for (const { e } of remindersDue(state.entries, log, today)) {
    if (!canEmail(e)) continue;
    try {
      await send(e.email.trim(), friendEmail("reminder", e, state.me, today));
      log[e.id] = { last: toISO(today), count: (log[e.id]?.count || 0) + 1 };
      sent++;
    } catch (err) {
      console.error("money-owed reminder failed", e.id, err.message);
      failed++;
    }
  }
  if (sent) await writeJSON(OWED_SENT, log);
  return { sent, failed };
}
