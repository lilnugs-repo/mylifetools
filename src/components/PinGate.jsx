import { useEffect, useRef, useState } from "react";
import { icons } from "./icons.jsx";
import { api } from "../lib/api.js";
import { releaseKeyboard } from "../lib/keyboard.js";

const LENGTH = 4;

const MESSAGES = {
  offline: "Can't reach the server. Check your connection and try again.",
  timeout: "The server took too long to answer. Check the function logs in Vercel.",
  no_api: "The server isn't running. Start the app with `vercel dev` (see README).",
  server: "Something went wrong on the server. Check the env variables are set (see README).",
};

/** The PIN is checked on the server (/api/unlock, PIN_KEY env var); it's not stored in the app's code. */
export default function PinGate({ tool, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  const lockedOut = until > now;

  // Keep the boxes ready to type into: on open, after a wrong try, and when a lockout ends
  useEffect(() => {
    if (!busy && !lockedOut) {
      inputRef.current?.focus();
      releaseKeyboard(); // the PIN boxes now hold the keyboard a tile tap raised
    }
  }, [busy, lockedOut]);
  useEffect(() => {
    if (!lockedOut) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedOut]);

  const submit = async (value) => {
    if (lockedOut || busy) return;
    if (value.length !== LENGTH) {
      setError(`Enter all ${LENGTH} digits.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.unlock(value);
      onUnlock();
    } catch (err) {
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (err.code === "wrong") setError(`Not quite. ${err.triesLeft} ${err.triesLeft === 1 ? "try" : "tries"} left.`);
      else if (err.code === "too_many") {
        setUntil(Date.now() + (err.retryAfter || 60) * 1000);
        setNow(Date.now());
      } else if (err.status === 400 && err.error === "bad_format") setError(`The PIN is ${LENGTH} digits.`);
      else setError(MESSAGES[err.code] || MESSAGES.server);
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
    setPin(v);
    setError("");
    if (v.length === LENGTH) submit(v); // open as soon as the last digit is in
  };

  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  const wait = secs >= 3600 ? `${Math.ceil(secs / 3600)} h` : secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`;

  return (
    <form
      className="gate"
      onSubmit={(e) => {
        e.preventDefault();
        submit(pin);
      }}
      noValidate
    >
      <div className="ico">{icons.lock}</div>
      <div>
        <h1 style={{ fontSize: 18 }}>{tool.name}</h1>
        <p>Enter your PIN to open your tools.</p>
      </div>
      <label htmlFor="pin" className="pin-label">
        PIN
        <span className={["pin", shake && "shake", error && "bad", (lockedOut || busy) && "off"].filter(Boolean).join(" ")} onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <span key={i} className={`pin-box${i < pin.length ? " filled" : ""}${i === pin.length && !lockedOut ? " here" : ""}`} aria-hidden="true" />
          ))}
          <input
            id="pin"
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={LENGTH}
            value={pin}
            aria-invalid={!!error}
            aria-describedby="pin-err"
            disabled={lockedOut || busy}
            onChange={onChange}
          />
        </span>
      </label>
      <p className="err" id="pin-err" role="alert">
        {lockedOut ? `Too many tries. Try again in ${wait}.` : error}
      </p>
      <button className="btn primary" type="submit" disabled={lockedOut || busy || pin.length !== LENGTH}>
        {busy ? "Checking…" : "Open"}
      </button>
    </form>
  );
}
