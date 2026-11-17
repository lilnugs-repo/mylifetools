// GET /api/fx → { base: "AUD", quote: "NPR", rate, updated, source }
// The latest Australian dollar → Nepalese rupee rate for the home screen. Public data, so
// no login needed. Vercel's CDN keeps each answer for an hour (s-maxage), so the rate
// services are asked at most about once an hour however often the app is opened.
import { json } from "./_lib/http.js";

const TIMEOUT_MS = 6000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Tried in order; the first that gives a sensible rate wins.
const SOURCES = [
  {
    name: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/AUD",
    read: (d) => d.result === "success" && { rate: d.rates?.NPR, updated: new Date(d.time_last_update_unix * 1000).toISOString() },
  },
  {
    name: "fawazahmed0/exchange-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aud.json",
    read: (d) => ({ rate: d.aud?.npr, updated: d.date ? new Date(`${d.date}T00:00:00Z`).toISOString() : null }),
  },
];

export async function GET() {
  const errors = [];
  for (const src of SOURCES) {
    try {
      const r = src.read(await getJSON(src.url));
      if (r && Number(r.rate) > 1) {
        return json(
          200,
          { base: "AUD", quote: "NPR", rate: Number(r.rate), updated: r.updated, source: src.name },
          // Not personal data, so the CDN may share it: fresh for an hour, then served stale while it refetches
          { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" }
        );
      }
      errors.push(`${src.name}: no NPR rate`);
    } catch (e) {
      errors.push(`${src.name}: ${e.message}`);
    }
  }
  console.error("fx: no source answered", errors);
  return json(502, { error: "unavailable", detail: errors.join("; ") });
}
