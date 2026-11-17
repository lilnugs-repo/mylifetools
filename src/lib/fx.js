import { useEffect, useState } from "react";
import { api } from "./api.js";

// The latest AUD → NPR rate for the home screen (from /api/fx). The last one is kept on
// this device so something shows straight away and while offline.
const KEY = "mt:fx:aud-npr";

function cached() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && Number(v.rate) > 0 ? v : null;
  } catch {
    return null;
  }
}

/** { rate, updated, source, stale } or null before anything has loaded. */
export function useFxRate() {
  const [fx, setFx] = useState(() => {
    const c = cached();
    return c && { ...c, stale: true };
  });
  useEffect(() => {
    let alive = true;
    api
      .fx()
      .then((r) => {
        if (!alive || !(Number(r.rate) > 0)) return;
        const v = { rate: r.rate, updated: r.updated, source: r.source };
        try {
          localStorage.setItem(KEY, JSON.stringify(v));
        } catch {}
        setFx({ ...v, stale: false });
      })
      .catch(() => {}); // keep the saved rate, marked as not fresh
    return () => {
      alive = false;
    };
  }, []);
  return fx;
}
