// POST /api/unlock  { dob: "DD/MM/YYYY" }  → sets the session cookie
import { json, readBody } from "./_lib/http.js";
import { dobMatches, normaliseDob, recentFails, saveFails, sessionCookie, MAX_FAILS, WINDOW_MS } from "./_lib/auth.js";

export async function POST(request) {
  try {
    const { dob } = await readBody(request, 1000);
    const fails = await recentFails();

    if (fails.length >= MAX_FAILS) {
      const retryAfter = Math.ceil((Math.min(...fails.slice(-MAX_FAILS)) + WINDOW_MS - Date.now()) / 1000);
      return json(429, { error: "too_many", retryAfter: Math.max(1, retryAfter) });
    }

    if (!normaliseDob(dob)) return json(400, { error: "bad_format" });

    if (dobMatches(dob)) {
      if (fails.length) await saveFails([]);
      return json(200, { ok: true }, { "Set-Cookie": sessionCookie(request) });
    }

    fails.push(Date.now());
    await saveFails(fails);
    const triesLeft = MAX_FAILS - fails.length;
    if (triesLeft <= 0) return json(429, { error: "too_many", retryAfter: Math.ceil(WINDOW_MS / 1000) });
    return json(401, { error: "wrong", triesLeft });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "server_error", detail: e.status ? undefined : e.message });
  }
}
