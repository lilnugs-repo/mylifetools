// POST /api/unlock  { pin: "1234" }  → sets the session cookie
import { json, readBody } from "./_lib/http.js";
import { lockedFor, normalisePin, pinMatches, recentFails, saveFails, sessionCookie, MAX_FAILS, WINDOW_MS } from "./_lib/auth.js";

export async function POST(request) {
  try {
    const { pin } = await readBody(request, 1000);
    const fails = await recentFails();

    const wait = lockedFor(fails);
    if (wait) return json(429, { error: "too_many", retryAfter: wait });

    if (!normalisePin(pin)) return json(400, { error: "bad_format" });

    if (pinMatches(pin)) {
      if (fails.length) await saveFails([]);
      return json(200, { ok: true }, { "Set-Cookie": sessionCookie(request) });
    }

    fails.push(Date.now());
    await saveFails(fails);
    const after = lockedFor(fails);
    if (after) return json(429, { error: "too_many", retryAfter: after });
    const triesLeft = MAX_FAILS - fails.filter((t) => t > Date.now() - WINDOW_MS).length;
    return json(401, { error: "wrong", triesLeft });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "server_error", detail: e.status ? undefined : e.message });
  }
}
