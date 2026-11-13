import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";

export default function Home() {
  return (
    <div className="wrap">
      <div className="home-intro">
        <h1>Adulting, but make it organised.</h1>
        <p>
          Loans, bills, warranties and that streaming service you forgot you pay for, all in one place. Tap a tile and get
          sorting. The ones with a padlock want your birthday once per login. No cake involved, sadly.
        </p>
      </div>
      <nav className="tiles-dir" aria-label="Tools">
        {tools.map((t) => {
          const badge = t.badge?.();
          return (
            <a key={t.id} className="tool-tile" href={`#/${t.id}`}>
              <span className="ico">{icons[t.icon] ?? icons.plus}</span>
              {t.locked && <span className="lock" title="Locked">{icons.lock}</span>}
              <span className="name">{t.name}</span>
              <span className="desc">{t.description}</span>
              {badge && <span className={`tile-badge ${badge.tone}`}>{badge.text}</span>}
            </a>
          );
        })}
        <div className="tool-tile soon" aria-hidden="true">
          <span className="ico">{icons.plus}</span>
          <span className="name">More coming</span>
          <span className="desc">New tools appear here</span>
        </div>
      </nav>
    </div>
  );
}
