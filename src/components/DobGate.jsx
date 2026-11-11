import { useEffect, useRef, useState } from "react";
import { icons } from "./icons.jsx";
import { checkDob, normaliseDob, readAttempts, writeAttempts, setUnlocked, MAX_ATTEMPTS, LOCKOUT_MS } from "../lib/lock.js";

/** Auto-insert slashes as the user types: 15081995 → 15/08/1995 */
function formatTyping(v) {
  const digits = v.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DobGate({ tool, onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [attempts, setAttempts] = useState(() => readAttempts(tool.id));
  const inputRef = useRef(null);
  const lockedOut = attempts.until > now;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (!lockedOut) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedOut]);

  const submit = async (e) => {
    e.preventDefault();
    if (lockedOut || busy) return;
    if (!normaliseDob(value)) {
      setError("Enter a full date as DD/MM/YYYY.");
      return;
    }
    setBusy(true);
    const ok = await checkDob(value, tool.lockHash);
    setBusy(false);
    if (ok) {
      writeAttempts(tool.id, { count: 0, until: 0 });
      setUnlocked(tool.id);
      onUnlock();
      return;
    }
    const count = attempts.count + 1;
    const next = count >= MAX_ATTEMPTS ? { count: 0, until: Date.now() + LOCKOUT_MS } : { count, until: 0 };
    writeAttempts(tool.id, next);
    setAttempts(next);
    setNow(Date.now());
    setValue("");
    setError(count >= MAX_ATTEMPTS ? "Too many tries." : `That date doesn't match. ${MAX_ATTEMPTS - count} ${MAX_ATTEMPTS - count === 1 ? "try" : "tries"} left.`);
  };

  const secs = Math.ceil((attempts.until - now) / 1000);

  return (
    <form className="gate" onSubmit={submit} noValidate>
      <div className="ico">{icons.lock}</div>
      <div>
        <h1 style={{ fontSize: 18 }}>{tool.name}</h1>
        <p>Enter your date of birth to open this tool.</p>
      </div>
      <label htmlFor="dob">
        Date of birth
        <input
          id="dob"
          ref={inputRef}
          inputMode="numeric"
          autoComplete="off"
          placeholder="DD/MM/YYYY"
          value={value}
          aria-invalid={!!error}
          aria-describedby="dob-err"
          disabled={lockedOut}
          onChange={(e) => {
            setValue(formatTyping(e.target.value));
            setError("");
          }}
        />
      </label>
      <p className="err" id="dob-err" role="alert">
        {lockedOut ? `Too many tries. Try again in ${secs}s.` : error}
      </p>
      <button className="btn primary" type="submit" disabled={lockedOut || busy}>
        {busy ? "Checking…" : "Open"}
      </button>
    </form>
  );
}
