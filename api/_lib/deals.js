// Deals scan: for each category, read OzBargain's feed and run a Tavily search, keep links not
// posted before, and add one post to the feed (deals/feed.json). Storage, search, feeds and
// email are passed in, so the scan can be tested without Blob, Tavily, OzBargain or Resend.
import { AU_SITES, CATEGORIES, defaults, domainOf, enabledCategories, isForeignDomain, shapeState } from "../../src/tools/deals/feed.js";
import { fetchFeed, isLive } from "./ozbargain.js";

export const FEED = "deals/feed.json";
export const SCANS = "deals/scans.json";
const KEEP_POSTS = 60;
const KEEP_SEEN = 3000;
const PER_CATEGORY = 5; // per source

export const tavilyConfigured = () => !!process.env.TAVILY_API_KEY;

/** One Tavily search, kept to Australia. Throws { status, message } on failure. */
export async function tavilySearch(query) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      topic: "general",
      country: "australia", // boosts Australian results
      include_domains: AU_SITES, // Australian deal and comparison sites…
      include_domains_mode: "prefer", // …ranked first, without excluding providers' own sites
      search_depth: "basic", // 1 credit
      time_range: "month",
      include_answer: "basic",
      max_results: 10,
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
 * `search` (Tavily) is skipped when it's null or switched off; `feeds` (OzBargain) likewise.
 * Returns { post, newCount, errors, settings }.
 */
export async function runScan({
  readJSON,
  writeJSON,
  search = tavilyConfigured() ? tavilySearch : null,
  feeds = fetchFeed,
  trigger,
  now = new Date(),
}) {
  const settings = shapeState((await readJSON("tools/deals.json"))?.data) ?? defaults();
  const feed = (await readJSON(FEED)) || { posts: [], seen: [] };
  const seen = new Set(feed.seen);
  const cats = enabledCategories(settings);
  const useOzb = settings.sources.ozbargain !== false && !!feeds;
  const useWeb = settings.sources.tavily !== false && !!search;
  const errors = [];

  // OzBargain: each feed once, shared by the categories that read it
  const feedPaths = useOzb ? [...new Set(cats.map((k) => CATEGORIES[k].ozb?.feed).filter(Boolean))] : [];
  const feedItems = {};
  await Promise.all(
    feedPaths.map(async (p) => {
      try {
        feedItems[p] = (await feeds(p)).filter((it) => it.url && isLive(it, now));
      } catch (e) {
        errors.push({ source: "ozbargain", message: `OzBargain couldn't be read (${e.status || e.message}).` });
      }
    })
  );

  // Tavily: one search per category that has a query
  const webCats = useWeb ? cats.filter((k) => CATEGORIES[k].query) : [];
  const web = await Promise.allSettled(webCats.map((k) => search(CATEGORIES[k].query)));
  const webByCat = {};
  web.forEach((r, i) => {
    if (r.status === "fulfilled") webByCat[webCats[i]] = r.value;
    else errors.push({ cat: webCats[i], source: "tavily", message: TAVILY_MESSAGES[r.reason?.status] || r.reason?.message || "Search failed" });
  });

  const sections = [];
  for (const cat of cats) {
    const c = CATEGORIES[cat];
    const ozb = (feedItems[c.ozb?.feed] || [])
      .filter((it) => c.ozb.match(it) && !seen.has(it.url))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, PER_CATEGORY)
      .map((it) => ({
        source: "ozbargain",
        title: it.title.slice(0, 200),
        url: it.url,
        merchant: it.merchant,
        snippet: it.snippet,
        domain: "ozbargain.com.au",
        published: it.published,
        expiry: it.expiry,
        votes: it.votes,
        comments: it.comments,
      }));
    for (const x of ozb) seen.add(x.url);

    const w = webByCat[cat];
    const webResults = (w?.results || [])
      .filter((x) => x.url && !seen.has(x.url) && !isForeignDomain(domainOf(x.url)))
      .slice(0, PER_CATEGORY)
      .map((x) => ({
        source: "tavily",
        title: String(x.title || domainOf(x.url)).slice(0, 200),
        url: x.url,
        snippet: String(x.content || "").replace(/\s+/g, " ").slice(0, 400),
        domain: domainOf(x.url),
        published: x.published_date || null,
      }));
    for (const x of webResults) seen.add(x.url);

    const results = [...ozb, ...webResults];
    if (results.length) sections.push({ cat, answer: webResults.length ? String(w.answer || "").slice(0, 1500) : "", results });
  }

  // Nothing could be read at all (bad key, no credits, OzBargain down): say so instead of posting nothing
  const tried = feedPaths.length + webCats.length;
  if (!tried) throw Object.assign(new Error("No source is switched on, or web search isn't set up."), { status: 400, code: "no_source" });
  const ozbDown = !feedPaths.length || !Object.keys(feedItems).length;
  const webDown = !webCats.length || !Object.keys(webByCat).length;
  if (!sections.length && ozbDown && webDown) throw Object.assign(new Error(errors[0].message), { status: 502, code: "search_failed" });

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
