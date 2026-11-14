import { Suspense, useEffect, useState } from "react";
import Home from "./components/Home.jsx";
import PinGate from "./components/PinGate.jsx";
import { Logo, icons } from "./components/icons.jsx";
import { findTool } from "./tools/registry.js";
import { api } from "./lib/api.js";
import { useHashRoute } from "./lib/useHashRoute.js";
import { useTheme } from "./lib/theme.js";
import { syncAll } from "./lib/syncAll.js";

export default function App() {
  const route = useHashRoute();
  const { theme, toggle: toggleTheme } = useTheme();
  const tool = route ? findTool(route) : null;
  // "checking" until /api/session answers; one login unlocks every locked tool
  const [auth, setAuth] = useState("checking");

  useEffect(() => {
    api
      .session()
      .then((r) => setAuth(r.authed ? "in" : "out"))
      .catch(() => setAuth("out"));
    const onLocked = () => setAuth("out");
    window.addEventListener("mt:locked", onLocked);
    return () => window.removeEventListener("mt:locked", onLocked);
  }, []);

  useEffect(() => {
    document.title = tool ? `${tool.name} · My Life Tools` : "My Life Tools";
  }, [tool]);

  useEffect(() => {
    if (route && !tool) window.location.hash = "#/";
  }, [route, tool]);

  const Tool = tool?.component;

  // Each time the home screen opens while logged in, pull every tool's latest data so the
  // tiles (Fixed Expenses total, badges, countdowns) are current; then redraw them.
  const [sync, setSync] = useState({ state: "idle", n: 0 });
  useEffect(() => {
    if (tool || auth !== "in") return;
    let alive = true;
    setSync((s) => ({ ...s, state: "syncing" }));
    syncAll().then((state) => alive && setSync((s) => ({ state, n: s.n + 1 })));
    return () => {
      alive = false;
    };
  }, [tool, auth]);

  const lock = async () => {
    try {
      await api.logout();
    } catch {}
    setAuth("out");
    window.location.hash = "#/";
  };

  return (
    <>
      <div className="topbar">
        {tool && auth === "in" ? (
          <a className="btn" href="#/">
            {icons.back} All tools
          </a>
        ) : (
          <a className="brand" href="#/">
            <Logo /> My Life Tools
          </a>
        )}
        <div className="head-actions">
          {auth === "in" && (
          <a
            className="btn tb-notify"
            href="#/reminders"
            aria-current={route === "reminders" ? "page" : undefined}
            aria-label="Configure notifications"
            title="Configure email notifications"
          >
            {icons.bell}
            <span className="tb-label">Notifications</span>
          </a>
          )}
          <button
            className="btn icon"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? icons.sun : icons.moon}
          </button>
          {auth === "in" && (
            <button className="btn" type="button" onClick={lock}>
              Lock
            </button>
          )}
        </div>
      </div>

      {/* One PIN, on the way in: nothing (home or any tool) shows until it's entered */}
      {auth === "checking" && <div className="wrap loading">Checking your session…</div>}
      {auth === "out" && <PinGate tool={tool} onUnlock={() => setAuth("in")} />}
      {auth === "in" && !tool && <Home key={sync.n} syncing={sync.state === "syncing"} />}
      {auth === "in" && tool && (
        <Suspense fallback={<div className="wrap loading">Loading {tool.name}…</div>}>
          <Tool />
        </Suspense>
      )}
    </>
  );
}
