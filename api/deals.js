// Deals & Sign-up Bonuses. Sources: OzBargain's RSS feeds (no setup) and Tavily web search
// (when TAVILY_API_KEY is set).
// GET /api/deals                    weekly scan from Vercel Cron (Authorization: Bearer CRON_SECRET),
//                                    then a "new deals" email if switched on and Resend is set up
// POST /api/deals { action: "feed" } the feed, scan limits and setup status (logged-in app)
// POST /api/deals { action: "scan" } scan now (logged-in app), within the limits in src/tools/deals/feed.js
import crypto from "node:crypto";
import { json, readBody } from "./_lib/http.js";
import { isAuthed } from "./_lib/auth.js";
import { readJSON, writeJSON } from "./_lib/store.js";
import { FEED, SCANS, buildDealsEmail, runScan, tavilyConfigured } from "./_lib/deals.js";
import { missingConfig, sendWithResend } from "./_lib/reminders.js";
import { LIMITS, scanAllowance } from "../src/tools/deals/feed.js";

const appUrl = (request) => process.env.APP_URL || new URL(request.url).origin;

function fromCron(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = (v) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(h(request.headers.get("authorization") || ""), h(`Bearer ${secret}`));
}

async function status() {
  const log = (await readJSON(SCANS)) || { runs: [] };
  return { configured: true, web: tavilyConfigured(), limits: LIMITS, allowance: scanAllowance(log.runs) };
}

export async function GET(request) {
  try {
    if (!fromCron(request)) return json(401, { error: "unauthorised" });
    const r = await runScan({ readJSON, writeJSON, trigger: "weekly" });
    let emailed = false;
    if (r.newCount && r.settings.email && !missingConfig().length) {
      try {
        await sendWithResend(buildDealsEmail(r.post, appUrl(request)));
        emailed = true;
      } catch (e) {
        console.error("deals email failed", e);
      }
    }
    return json(200, { new: r.newCount, errors: r.errors.length, emailed });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.code || "server_error", detail: e.message });
  }
}

export async function POST(request) {
  try {
    if (!isAuthed(request)) return json(401, { error: "unauthorised" });
    const { action } = await readBody(request);

    if (action === "feed") {
      const feed = (await readJSON(FEED)) || { posts: [] };
      return json(200, { posts: feed.posts, ...(await status()) });
    }

    if (action === "scan") {
      const log = (await readJSON(SCANS)) || { runs: [] };
      const allow = scanAllowance(log.runs);
      if (!allow.ok) return json(429, { error: "too_soon", retryAfter: allow.retryAfter, left: allow.left });
      const r = await runScan({ readJSON, writeJSON, trigger: "manual" });
      const feed = (await readJSON(FEED)) || { posts: [] };
      return json(200, { new: r.newCount, errors: r.errors, posts: feed.posts, ...(await status()) });
    }

    return json(400, { error: "bad_action" });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.code || "server_error", detail: e.message });
  }
}
