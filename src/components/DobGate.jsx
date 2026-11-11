import { useEffect, useRef, useState } from "react";
import { icons } from "./icons.jsx";
import { api } from "../lib/api.js";

/** Auto-insert slashes as the user types: 15081995 → 15/08/1995 */
function formatTyping(v) {
  const digits = v.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const MESSAGES = {
  offline: "Can't reach the server. Check your connection and try again.",
  timeout: "The server took too long to answer. Check the function logs in Vercel.",
  no_api: "The server isn't running. Start the app with `vercel dev` (see README).",
  server: "Something went wrong on the server. Check the env variables are set (see README).",
};

/** The DoB is checked on the server (/api/unlock); it's not stored in the app's code. */
export default function DobGate({ tool, onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  const lockedOut = until > now;

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (!lockedOut) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedOut]);

  const submit = async (e) => {
    e.preventDefault();
    if (lockedOut || busy) return;
    if (value.replace(/\D/g, "").length !== 8) {
      setError("Enter a full date as DD/MM/YYYY.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.unlock(value);
      onUnlock();
    } catch (err) {
      setValue("");
      if (err.code === "wrong") setError(`That date doesn't match. ${err.triesLeft} ${err.triesLeft === 1 ? "try" : "tries"} left.`);
      else if (err.code === "too_many") {
        setUntil(Date.now() + (err.retryAfter || 60) * 1000);
        setNow(Date.now());
      } else if (err.status === 400 && err.error === "bad_format") setError("Enter a real date as DD/MM/YYYY.");
      else setError(MESSAGES[err.code] || MESSAGES.server);
    } finally {
      setBusy(false);
    }
  };

  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  const wait = secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`;

  return (
    <form className="gate" onSubmit={submit} noValidate>
      <div className="ico">{icons.lock}</div>
      <div>
        <h1 style={{ fontSize: 18 }}>{tool.name}</h1>
        <p>Enter your date of birth to open your tools.</p>
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
        {lockedOut ? `Too many tries. Try again in ${wait}.` : error}
      </p>
      <button className="btn primary" type="submit" disabled={lockedOut || busy}>
        {busy ? "Checking…" : "Open"}
      </button>
    </form>
  );
}
