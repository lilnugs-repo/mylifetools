// Session cookie auth. The DoB lives only in the UNLOCK_DOB env var on the
// server, never in the browser bundle. A correct DoB gets a signed, HttpOnly
// cookie; every data request checks it.
import crypto from "node:crypto";
import { readJSON, writeJSON } from "./store.js";

const COOKIE = "mt_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

export const MAX_FAILS = 5; // wrong tries allowed…
export const WINDOW_MS = 15 * 60_000; // …within this window before a lockout

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

/** "03/06/2000", "3-6-2000", "03062000" → "03062000"; null if not a real date. */
export function normaliseDob(input) {
  const parts = String(input ?? "").trim().split(/[^0-9]+/).filter(Boolean);
  let d, m, y;
  if (parts.length === 3) [d, m, y] = parts;
  else if (parts.length === 1 && parts[0].length === 8) [d, m, y] = [parts[0].slice(0, 2), parts[0].slice(2, 4), parts[0].slice(4)];
  else return null;
  if (y.length !== 4) return null;
  const dd = Number(d), mm = Number(m), yy = Number(y);
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (date.getUTCFullYear() !== yy || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return String(dd).padStart(2, "0") + String(mm).padStart(2, "0") + y;
}

export function dobMatches(input) {
  const expected = normaliseDob(process.env.UNLOCK_DOB);
  if (!expected) throw new Error("UNLOCK_DOB must be set as DD/MM/YYYY");
  const given = normaliseDob(input) ?? "";
  const h = (s) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(given), h(expected));
}

// Failed attempts are kept in the same private Blob store.
const ATTEMPTS = "_system/unlock-attempts.json";

export async function recentFails() {
  const v = (await readJSON(ATTEMPTS)) || { fails: [] };
  const cutoff = Date.now() - WINDOW_MS;
  return v.fails.filter((t) => t > cutoff);
}

export async function saveFails(fails) {
  await writeJSON(ATTEMPTS, { fails });
}
