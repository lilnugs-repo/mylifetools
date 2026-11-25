// OzBargain's public RSS feeds (RSS 2.0 with an ozb: namespace for votes, expiry and the
// merchant link). Only /…/feed paths are read; robots.txt doesn't restrict them. Each scan
// fetches each feed once, at most once every 6 hours (LIMITS in src/tools/deals/feed.js).
const BASE = "https://www.ozbargain.com.au";
const UA = "MyLifeTools/1.0 (personal deal reader; weekly)";

export async function fetchFeed(path) {
  const res = await fetch(BASE + path, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml" } });
  if (!res.ok) throw Object.assign(new Error(`OzBargain ${res.status} for ${path}`), { status: res.status });
  return parseFeed(await res.text());
}

const decode = (s) =>
  String(s || "")
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);
const attrs = (s) => Object.fromEntries([...String(s || "").matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, decode(v)]));
const text = (html) => decode(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** RSS text → [{ title, url, node, merchant, snippet, tags, published, expiry, votes, comments, expired }]. */
export function parseFeed(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const meta = attrs(it.match(/<ozb:meta([^>]*)\/?>/)?.[1]);
    const flags = [...it.matchAll(/<ozb:title-msg[^>]*type="([^"]+)"/g)].map((m) => m[1]);
    return {
      title: tag(it, "title"),
      url: tag(it, "link"), // the OzBargain deal page (comments, votes)
      merchant: meta.url || null,
      snippet: text(tag(it, "description")).slice(0, 400),
      tags: [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map((m) => decode(m[1])),
      published: tag(it, "pubDate") || null,
      expiry: meta.expiry || null,
      votes: Number(meta["votes-pos"]) || 0,
      comments: Number(meta["comment-count"]) || 0,
      expired: flags.includes("expired"),
    };
  });
}

/** Still worth showing: not flagged expired, not past its expiry date, posted in the last `days`. */
export function isLive(item, now = new Date(), days = 30) {
  if (item.expired) return false;
  if (item.expiry && Date.parse(item.expiry) < +now) return false;
  const at = Date.parse(item.published);
  return !at || +now - at < days * 864e5;
}
