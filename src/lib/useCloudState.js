import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// Keeps a tool's state in the private Blob store (via /api/state), with a
// localStorage copy as an offline cache.
//   - `shape(saved)` turns saved data into the tool's state, or returns null
//     if it isn't valid; `empty` is the state before anything is saved.
//   - On open: the server copy wins, unless this device has edits that never
//     reached the server (pendingSync), in which case those are uploaded.
//   - First time on the server: this device's existing local data is uploaded.
//   - Edits save ~0.6s after you stop changing things (and on leaving the page).

const STATUS_TEXT = {
  loading: "Syncing…",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline · saved on this device",
  locked: "Signed out · saved on this device",
  error: "Couldn't save · kept on this device",
};

export function readCache(keys, shape) {
  try {
    for (const k of keys) {
      const v = JSON.parse(localStorage.getItem(k));
      const state = v && shape(v);
      if (state) return { state, pending: !!v.pendingSync };
    }
  } catch {}
  return null;
}

function writeCache(key, state, pending) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...state, pendingSync: pending }));
  } catch {}
}

export function useCloudState({ id, storageKey, legacyKeys = [], shape, empty }) {
  const cached = useRef(readCache([storageKey, ...legacyKeys], shape));
  const [state, setState] = useState(() => cached.current?.state ?? empty);
  const [status, setStatus] = useState("loading");

  const ready = useRef(false); // server has answered
  const fromServer = useRef(false); // next state change came from the server, don't echo it back
  const latest = useRef(state);
  const timer = useRef(null);
  const inflight = useRef(false);
  const queued = useRef(null);

  const push = (next) => {
    if (inflight.current) {
      queued.current = next;
      return;
    }
    inflight.current = true;
    setStatus("saving");
    api
      .putState(id, next)
      .then(() => {
        writeCache(storageKey, next, false);
        setStatus("saved");
      })
      .catch((e) => {
        writeCache(storageKey, next, true);
        setStatus(e.code === "unauthorised" ? "locked" : e.code === "offline" || e.code === "no_api" ? "offline" : "error");
      })
      .finally(() => {
        inflight.current = false;
        if (queued.current) {
          const q = queued.current;
          queued.current = null;
          push(q);
        }
      });
  };

  // Load once from the server
  useEffect(() => {
    let alive = true;
    api
      .getState(id)
      .then((r) => {
        if (!alive) return;
        ready.current = true;
        const local = cached.current;
        if (local?.pending) return push(local.state);
        const s = r.data && shape(r.data);
        if (s) {
          fromServer.current = true;
          setState(s);
          writeCache(storageKey, s, false);
          setStatus("saved");
        } else if (local) push(local.state);
        else setStatus("saved");
      })
      .catch((e) => {
        if (!alive) return;
        ready.current = true;
        setStatus(e.code === "unauthorised" ? "locked" : "offline");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Save after changes (debounced)
  useEffect(() => {
    latest.current = state;
    if (fromServer.current) {
      fromServer.current = false;
      return;
    }
    if (!ready.current) return;
    writeCache(storageKey, state, true);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      push(state);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Don't lose a pending save when the tab is hidden or closed
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        push(latest.current);
      }
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, setState, status, statusText: STATUS_TEXT[status], loading: status === "loading" };
}
