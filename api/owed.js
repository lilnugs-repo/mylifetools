// Money Owed to Me: emails to the borrower, sent from the logged-in app.
// POST /api/owed { action: "status" }                    can emails reach other people? + reminders sent by the daily job
// POST /api/owed { action: "send", kind, entry, me }      email the borrower now (kind "new" or "reminder")
// The daily overdue reminders run with the other reminders (api/notify.js).
import { json, readBody } from "./_lib/http.js";
import { isAuthed } from "./_lib/auth.js";
import { readJSON, writeJSON } from "./_lib/store.js";
import { todayIn } from "./_lib/reminders.js";
import { OWED_SENT, friendEmail, friendEmailProblem, sendToBorrower } from "./_lib/owed.js";
import { canEmail, toISO } from "../src/tools/money-owed/owed.js";

export async function POST(request) {
  try {
    if (!isAuthed(request)) return json(401, { error: "unauthorised" });
    const { action, kind, entry, me } = await readBody(request, 20_000);

    if (action === "status") {
      return json(200, { problem: friendEmailProblem(), log: (await readJSON(OWED_SENT)) || {} });
    }

    if (action === "send") {
      if (kind !== "new" && kind !== "reminder") return json(400, { error: "bad_kind" });
      if (!entry || typeof entry !== "object" || !canEmail(entry)) return json(400, { error: "bad_email" });
      const problem = friendEmailProblem();
      if (problem) return json(400, { error: "not_configured", detail: problem });
      const today = todayIn();
      await sendToBorrower(String(entry.email).trim(), friendEmail(kind, entry, typeof me === "string" ? me : "", today));
      const at = toISO(today); // the day it went, in your time zone
      if (kind === "reminder" && entry.id) {
        // Count it towards the daily job's "every N days", so they don't get two close together
        const log = (await readJSON(OWED_SENT)) || {};
        log[entry.id] = { last: at, count: (log[entry.id]?.count || 0) + 1 };
        await writeJSON(OWED_SENT, log);
      }
      return json(200, { at });
    }

    return json(400, { error: "bad_action" });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: "server_error", detail: e.message });
  }
}
