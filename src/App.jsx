import { Suspense, useEffect, useState } from "react";
import Home from "./components/Home.jsx";
import PinGate from "./components/PinGate.jsx";
import { Logo, icons } from "./components/icons.jsx";
import { findTool } from "./tools/registry.js";
import { api } from "./lib/api.js";
import { useHashRoute } from "./lib/useHashRoute.js";
import { useTheme } from "./lib/theme.js";
import { releaseKeyboard } from "./lib/keyboard.js";

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

  const needsGate = tool && tool.locked && auth !== "in";
  const Tool = tool?.component;

  // A tile tap may have raised the keyboard for the PIN; let it go if no PIN screen follows
  useEffect(() => {
    if (!(needsGate && auth !== "in")) releaseKeyboard();
  }, [needsGate, auth]);

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
        {tool ? (
          <a className="btn" href="#/">
            {icons.back} All tools
          </a>
        ) : (
          <a className="brand" href="#/">
            <Logo /> My Life Tools
          </a>
        )}
        <div className="head-actions">
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

      {!tool && <Home needsPin={auth !== "in"} />}
      {needsGate && auth === "checking" && <div className="wrap loading">Checking your session…</div>}
      {needsGate && auth === "out" && <PinGate tool={tool} onUnlock={() => setAuth("in")} />}
      {tool && !needsGate && (
        <Suspense fallback={<div className="wrap loading">Loading {tool.name}…</div>}>
          <Tool />
        </Suspense>
      )}
    </>
  );
}
