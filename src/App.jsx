import { Suspense, useEffect, useState } from "react";
import Home from "./components/Home.jsx";
import DobGate from "./components/DobGate.jsx";
import { icons } from "./components/icons.jsx";
import { findTool } from "./tools/registry.js";
import { isUnlocked, lockAll } from "./lib/lock.js";
import { useHashRoute } from "./lib/useHashRoute.js";

export default function App() {
  const route = useHashRoute();
  const tool = route ? findTool(route) : null;
  const [unlockedId, setUnlockedId] = useState(null);
  const unlocked = !!tool && (unlockedId === tool.id || isUnlocked(tool.id));
  const setUnlocked = () => setUnlockedId(tool.id);

  useEffect(() => {
    document.title = tool ? `${tool.name} · My Tools` : "My Tools";
  }, [tool]);

  // Unknown route → back to the directory
  useEffect(() => {
    if (route && !tool) window.location.hash = "#/";
  }, [route, tool]);

  const needsGate = tool && tool.lockHash && !unlocked;
  const Tool = tool?.component;

  return (
    <>
      <div className="topbar">
        {tool ? (
          <a className="btn" href="#/">
            {icons.back} All tools
          </a>
        ) : (
          <a className="brand" href="#/">
            <span className="brand-mark">S</span> My Tools
          </a>
        )}
        {tool && tool.lockHash && unlocked && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              lockAll();
              setUnlockedId(null);
              window.location.hash = "#/";
            }}
          >
            Lock
          </button>
        )}
      </div>

      {!tool && <Home />}
      {needsGate && <DobGate tool={tool} onUnlock={setUnlocked} />}
      {tool && !needsGate && (
        <Suspense fallback={<div className="wrap loading">Loading {tool.name}…</div>}>
          <Tool />
        </Suspense>
      )}
    </>
  );
}
