// Email reminders.
// GET  /api/notify                       daily run from Vercel Cron (Authorization: Bearer CRON_SECRET)
// POST /api/notify { action: "preview" }  what's due now + setup status (logged-in app)
// POST /api/notify { action: "test" }     send a test email with what's due now (logged-in app)
// The schedule is in vercel.json. Rules are in src/tools/reminders/rules.js.
import crypto from "node:crypto";
import { json, readBody } from "./_lib/http.js";
import { isAuthed } from "./_lib/auth.js";
import { readJSON, writeJSON } from "./_lib/store.js";
import { SENT, loadAll, missingConfig, runReminders, sendWithResend, todayIn } from "./_lib/reminders.js";
import { collect } from "../src/tools/reminders/rules.js";

const appUrl = (request) => process.env.APP_URL || new URL(request.url).origin;

function fromCron(request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") || "";
  if (!secret) return false;
  const h = (v) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(h(given), h(`Bearer ${secret}`));
}

export async function GET(request) {
  try {
    if (!fromCron(request)) return json(401, { error: "unauthorised" });
    const missing = missingConfig();
    if (missing.length) return json(500, { error: "not_configured", missing });
    const r = await runReminders({ readJSON, writeJSON, sendEmail: sendWithResend, today: todayIn(), appUrl: appUrl(request) });
    return json(200, { sent: r.sent, due: r.items.length, skipped: r.skipped });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: "server_error", detail: e.message });
  }
}

export async function POST(request) {
  try {
    if (!isAuthed(request)) return json(401, { error: "unauthorised" });
    const { action } = await readBody(request);
    const missing = missingConfig();
    const today = todayIn();

    if (action === "preview") {
      const { data, settings } = await loadAll(readJSON);
      const log = (await readJSON(SENT)) || { sent: {} };
      const items = collect(data, settings, today).map((i) => ({ ...i, sent: !!log.sent[i.key] }));
      return json(200, {
        configured: !missing.length,
        missing,
        cron: !!process.env.CRON_SECRET,
        lastRun: log.lastRun ?? null,
        lastTest: log.lastTest ?? null,
        items,
      });
    }

    if (action === "test") {
      if (missing.length) return json(400, { error: "not_configured", missing });
      const r = await runReminders({ readJSON, writeJSON, sendEmail: sendWithResend, today, appUrl: appUrl(request), force: true });
      return json(200, { sent: r.items.length, to: maskEmail(process.env.NOTIFY_EMAIL) });
    }

    return json(400, { error: "bad_action" });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: "server_error", detail: e.message });
  }
}

/** "s•••@gmail.com", so the address itself never reaches the browser. */
function maskEmail(list) {
  return list
    .split(",")
    .map((a) => a.trim().replace(/^(.)[^@]*(@.*)$/, "$1•••$2"))
    .join(", ");
}
