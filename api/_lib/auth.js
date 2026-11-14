// Session cookie auth. The PIN lives only in the PIN_KEY env var on the
// server, never in the browser bundle. A correct PIN gets a signed, HttpOnly
// cookie; every data request checks it.
import crypto from "node:crypto";
import { readJSON, writeJSON } from "./store.js";

const COOKIE = "mt_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

// A 4-digit PIN has only 10,000 combinations, so wrong tries are capped twice over:
export const MAX_FAILS = 5; // wrong tries allowed…
export const WINDOW_MS = 15 * 60_000; // …within 15 minutes, then a pause
export const DAILY_MAX_FAILS = 15; // and no more than this many…
export const DAY_MS = 24 * 60 * 60_000; // …in 24 hours (guessing every PIN would take years)

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

const sign = (v) => crypto.createHmac("sha256", secret()).update(v).digest("base64url");

const isLocal = (request) => /^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname);

function cookieAttrs(request, maxAge) {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isLocal(request) ? "" : "; Secure"}`;
}

export function sessionCookie(request) {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `${COOKIE}=${exp}.${sign(exp)}; ${cookieAttrs(request, SESSION_DAYS * 86400)}`;
}

export function clearedCookie(request) {
  return `${COOKIE}=; ${cookieAttrs(request, 0)}`;
}

export function isAuthed(request) {
  const raw = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig) return false;
  const expected = sign(exp);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(exp) > Date.now();
}

/** The PIN as typed, digits only; null if it isn't 4 digits. */
export function normalisePin(input) {
  const pin = String(input ?? "").replace(/\s+/g, "");
  return /^\d{4}$/.test(pin) ? pin : null;
}

export function pinMatches(input) {
  const expected = normalisePin(process.env.PIN_KEY);
  if (!expected) throw new Error("PIN_KEY must be set to a 4-digit code");
  const given = normalisePin(input) ?? "";
  const h = (v) => crypto.createHash("sha256").update(v).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

/** Seconds until another try is allowed, given recent failure times; 0 if a try is allowed now. */
export function lockedFor(fails, now = Date.now()) {
  const wait = (limit, windowMs) => {
    const recent = fails.filter((t) => t > now - windowMs).sort((x, y) => x - y);
    if (recent.length < limit) return 0;
    // Open again once the oldest of the last `limit` failures leaves the window
    return Math.max(1, Math.ceil((recent[recent.length - limit] + windowMs - now) / 1000));
  };
  return Math.max(wait(MAX_FAILS, WINDOW_MS), wait(DAILY_MAX_FAILS, DAY_MS));
}

// Failed attempts are kept in the same private Blob store.
const ATTEMPTS = "_system/unlock-attempts.json";

export async function recentFails() {
  const v = (await readJSON(ATTEMPTS)) || { fails: [] };
  const cutoff = Date.now() - DAY_MS;
  return v.fails.filter((t) => t > cutoff);
}

export async function saveFails(fails) {
  await writeJSON(ATTEMPTS, { fails });
}
