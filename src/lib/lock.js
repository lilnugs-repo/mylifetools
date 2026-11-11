// Lightweight DoB lock. The date is never stored in the code, only a salted
// SHA-256 hash. Unlocks last for the browser tab session.
//
// Note: this keeps casual visitors out of the UI. It is not strong security,
// since anyone with the built JS could try every date offline. For real
// protection, turn on Vercel's Password Protection or add auth.
import { LOCK_SALT } from "../tools/registry.js";

const sessionKey = (toolId) => `tools:unlocked:${toolId}`;
const attemptsKey = (toolId) => `tools:attempts:${toolId}`;

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

/** "15/08/1995", "15-8-1995", "15081995" → "15081995"; null if not a real date. */
export function normaliseDob(input) {
  const parts = input.trim().split(/[^0-9]+/).filter(Boolean);
  let d, m, y;
  if (parts.length === 3) [d, m, y] = parts;
  else if (parts.length === 1 && parts[0].length === 8) [d, m, y] = [parts[0].slice(0, 2), parts[0].slice(2, 4), parts[0].slice(4)];
  else return null;
  if (y.length !== 4) return null;
  const dd = Number(d), mm = Number(m), yy = Number(y);
  const date = new Date(yy, mm - 1, dd);
  if (date.getFullYear() !== yy || date.getMonth() !== mm - 1 || date.getDate() !== dd) return null;
  return String(dd).padStart(2, "0") + String(mm).padStart(2, "0") + y;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkDob(input, expectedHash) {
  const n = normaliseDob(input);
  if (!n) return false;
  return (await sha256Hex(LOCK_SALT + n)) === expectedHash;
}

export function isUnlocked(toolId) {
  try { return sessionStorage.getItem(sessionKey(toolId)) === "1"; } catch { return false; }
}
export function setUnlocked(toolId) {
  try { sessionStorage.setItem(sessionKey(toolId), "1"); } catch {}
}
export function lockAll() {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith("tools:unlocked:")).forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

export function readAttempts(toolId) {
  try { return JSON.parse(localStorage.getItem(attemptsKey(toolId))) || { count: 0, until: 0 }; } catch { return { count: 0, until: 0 }; }
}
export function writeAttempts(toolId, v) {
  try { localStorage.setItem(attemptsKey(toolId), JSON.stringify(v)); } catch {}
}
