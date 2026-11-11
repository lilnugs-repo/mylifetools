// POST /api/logout → clears the session cookie
import { json } from "./_lib/http.js";
import { clearedCookie } from "./_lib/auth.js";

export async function POST(request) {
  return json(200, { ok: true }, { "Set-Cookie": clearedCookie(request) });
}
