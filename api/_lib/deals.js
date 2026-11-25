// Deals scan: search Tavily for each category, keep links not posted before, and add one
// post to the feed (deals/feed.json). Storage, search and email are passed in, so the scan
// can be tested without Blob, Tavily or Resend.
import { CATEGORIES, defaults, domainOf, enabledCategories, shapeState } from "../../src/tools/deals/feed.js";

export const FEED = "deals/feed.json";
export const SCANS = "deals/scans.json";
const KEEP_POSTS = 60;
const KEEP_SEEN = 2000;
const PER_CATEGORY = 5;

/** One Tavily search. Throws { status, message } on failure. */
export async function tavilySearch(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      topic: "general",
      country: "australia",
      search_depth: "basic", // 1 credit
      time_range: "month",
      include_answer: "basic",
      max_results: 8,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.detail?.error || (Array.isArray(body?.detail) ? body.detail[0]?.msg : "") || res.statusText;
    throw Object.assign(new Error(`Tavily ${res.status}: ${msg}`), { status: res.status });
  }
  return res.json();
}

const TAVILY_MESSAGES = {
  401: "The Tavily API key is missing or wrong (TAVILY_API_KEY).",
  432: "Tavily's monthly free credits are used up.",
  433: "Tavily's pay-as-you-go limit is reached.",
  429: "Tavily is rate-limiting right now. Try again later.",
};

/**
 * Run one scan and save it. `trigger`: "weekly" | "manual".
 * Returns { post, newCount, errors }.
 */
export async function runScan({ readJSON, writeJSON, search = tavilySearch, trigger, now = new Date() }) {
  const settings = shapeState((await readJSON("tools/deals.json"))?.data) ?? defaults();
  const feed = (await readJSON(FEED)) || { posts: [], seen: [] };
  const seen = new Set(feed.seen);
  const cats = enabledCategories(settings);

  const results = await Promise.allSettled(cats.map((k) => search(CATEGORIES[k].query)));
  const sections = [];
  const errors = [];
  results.forEach((r, i) => {
    const cat = cats[i];
    if (r.status === "rejected") {
      errors.push({ cat, message: TAVILY_MESSAGES[r.reason?.status] || r.reason?.message || "Search failed" });
      return;
    }
    const fresh = (r.value.results || [])
      .filter((x) => x.url && !seen.has(x.url))
      .slice(0, PER_CATEGORY)
      .map((x) => ({
        title: String(x.title || domainOf(x.url)).slice(0, 200),
        url: x.url,
        snippet: String(x.content || "").replace(/\s+/g, " ").slice(0, 400),
        domain: domainOf(x.url),
        published: x.published_date || null,
      }));
    for (const x of fresh) seen.add(x.url);
    if (fresh.length) sections.push({ cat, answer: String(r.value.answer || "").slice(0, 1500), results: fresh });
  });

  // Every search failed for the same reason (bad key, no credits): say so instead of posting nothing
  if (!sections.length && errors.length === cats.length && cats.length) {
    throw Object.assign(new Error(errors[0].message), { status: 502, code: "search_failed" });
  }

  const post = {
    id: now.toISOString(),
    at: now.toISOString(),
    trigger,
    searched: cats,
    sections,
    errors,
  };
  const next = {
    posts: [post, ...feed.posts].slice(0, KEEP_POSTS),
    seen: [...seen].slice(-KEEP_SEEN),
  };
  await writeJSON(FEED, next);

  const log = (await readJSON(SCANS)) || { runs: [] };
  log.runs = [...log.runs, { at: post.at, trigger }].slice(-200);
  await writeJSON(SCANS, log);

  return { post, newCount: sections.reduce((a, s) => a + s.results.length, 0), errors, settings };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The weekly "new deals" email: each category's summary and its new links. */
export function buildDealsEmail(post, appUrl) {
  const count = post.sections.reduce((a, s) => a + s.results.length, 0);
  const subject = `${count} new deal${count === 1 ? "" : "s"} this week`;
  const link = appUrl ? `${appUrl}/#/deals` : "";
  const text = [
    "New sign-up bonuses and offers found this week:",
    "",
    ...post.sections.flatMap((s) => [
      `${CATEGORIES[s.cat]?.label ?? s.cat}`,
      s.answer && `  ${s.answer}`,
      ...s.results.map((r) => `  • ${r.title}\n    ${r.url}`),
      "",
    ]).filter((l) => l !== "" && l != null),
    "",
    "Summaries are written by Tavily's AI from the search results. Check each offer's terms on the provider's site before signing up.",
    link && `See them all: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<div style="background:#f6f1e9;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fffcf7;border:1px solid #e3d9ca;border-radius:12px;padding:20px 24px;width:100%">
<tr><td style="font-size:20px;font-weight:700;color:#2f2a24;padding-bottom:8px">My Life Tools · Deals</td></tr>
<tr><td style="font-size:15px;color:#2f2a24;padding-bottom:8px">New sign-up bonuses and offers found this week:</td></tr>
${post.sections
  .map(
    (s) => `<tr><td style="padding:12px 0;border-top:1px solid #e3d9ca">
  <div style="font-size:16px;font-weight:700;color:#2f2a24">${esc(CATEGORIES[s.cat]?.label ?? s.cat)}</div>
  ${s.answer ? `<div style="font-size:14px;color:#2f2a24;margin:4px 0 8px">${esc(s.answer)}</div>` : ""}
  ${s.results
    .map(
      (r) =>
        `<div style="margin:6px 0"><a href="${esc(r.url)}" style="font-size:14px;color:#4d6b51;font-weight:700;text-decoration:none">${esc(r.title)}</a><div style="font-size:12px;color:#75695c">${esc(r.domain)}</div></div>`
    )
    .join("")}
</td></tr>`
  )
  .join("")}
<tr><td style="font-size:12px;color:#75695c;padding-top:16px;border-top:1px solid #e3d9ca">Summaries are written by Tavily's AI from the search results. Check each offer's terms on the provider's site before signing up.${
    link ? ` <a href="${esc(link)}" style="color:#4d6b51">See them all</a>.` : ""
  }</td></tr>
</table></div>`;
  return { subject, text, html };
}
