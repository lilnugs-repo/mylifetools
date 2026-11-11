// POST /api/logout → clears the session cookie
import { json } from "./_lib/http.js";
import { clearedCookie } from "./_lib/auth.js";

export default async function handler(request) {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  return json(200, { ok: true }, { "Set-Cookie": clearedCookie(request) });
}
