// GET /api/session → { authed: boolean }
import { json } from "./_lib/http.js";
import { isAuthed } from "./_lib/auth.js";

export async function GET(request) {
  try {
    return json(200, { authed: isAuthed(request) });
  } catch (e) {
    console.error(e);
    return json(500, { error: "server_error", detail: e.message });
  }
}
