// GET /api/state?tool=car-loan          → { data, updatedAt } (data is null if nothing saved yet)
// PUT /api/state?tool=car-loan { data } → { updatedAt }
// Each tool's state is one private JSON file in Blob: my-tools/tools/<tool>.json
import { json, readBody } from "./_lib/http.js";
import { isAuthed } from "./_lib/auth.js";
import { readJSON, writeJSON } from "./_lib/store.js";

const TOOL_ID = /^[a-z0-9-]{1,40}$/;

export default async function handler(request) {
  try {
    if (!isAuthed(request)) return json(401, { error: "unauthorised" });

    const tool = new URL(request.url).searchParams.get("tool") || "";
    if (!TOOL_ID.test(tool)) return json(400, { error: "bad_tool" });
    const path = `tools/${tool}.json`;

    if (request.method === "GET") {
      const saved = await readJSON(path);
      return json(200, { data: saved?.data ?? null, updatedAt: saved?.updatedAt ?? null });
    }

    if (request.method === "PUT") {
      const { data } = await readBody(request);
      if (!data || typeof data !== "object" || Array.isArray(data)) return json(400, { error: "bad_data" });
      const updatedAt = new Date().toISOString();
      await writeJSON(path, { data, updatedAt });
      return json(200, { updatedAt });
    }

    return json(405, { error: "method_not_allowed" });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.status ? e.message : "server_error" });
  }
}
