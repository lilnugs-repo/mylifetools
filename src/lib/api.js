// Thin client for the /api routes. Errors are thrown as { code, ... }:
//   offline       network failure
//   no_api        /api isn't running (plain `npm run dev`; use `vercel dev`)
//   unauthorised  session missing or expired (also fires the "mt:locked" event)
//   too_many      unlock rate-limited ({ retryAfter } seconds)
//   wrong         wrong DoB ({ triesLeft })
//   server        anything else

async function call(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw { code: "offline" };
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (!isJson) throw { code: "no_api", status: res.status };
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;
  if (res.status === 401 && body.error === "unauthorised") {
    window.dispatchEvent(new Event("mt:locked"));
    throw { code: "unauthorised" };
  }
  if (res.status === 429) throw { code: "too_many", ...body };
  if (res.status === 401 && body.error === "wrong") throw { code: "wrong", ...body };
  throw { code: "server", status: res.status, ...body };
}

export const api = {
  session: () => call("/api/session"),
  unlock: (dob) => call("/api/unlock", { method: "POST", body: JSON.stringify({ dob }) }),
  logout: () => call("/api/logout", { method: "POST" }),
  getState: (tool) => call(`/api/state?tool=${encodeURIComponent(tool)}`),
  putState: (tool, data) => call(`/api/state?tool=${encodeURIComponent(tool)}`, { method: "PUT", body: JSON.stringify({ data }) }),
};
