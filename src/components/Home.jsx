import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";

export default function Home() {
  return (
    <div className="wrap">
      <div className="home-intro">
        <h1>My tools</h1>
        <p>Pick a tool to open it. Locked tools ask for your date of birth once per login.</p>
      </div>
      <nav className="tiles-dir" aria-label="Tools">
        {tools.map((t) => (
          <a key={t.id} className="tool-tile" href={`#/${t.id}`}>
            <span className="ico">{icons[t.icon] ?? icons.plus}</span>
            {t.locked && <span className="lock" title="Locked">{icons.lock}</span>}
            <span className="name">{t.name}</span>
            <span className="desc">{t.description}</span>
          </a>
        ))}
        <div className="tool-tile soon" aria-hidden="true">
          <span className="ico">{icons.plus}</span>
          <span className="name">More coming</span>
          <span className="desc">New tools appear here</span>
        </div>
      </nav>
    </div>
  );
}
