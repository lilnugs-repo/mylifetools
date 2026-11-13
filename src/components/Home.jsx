import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";

export default function Home() {
  const featured = tools.filter((t) => t.featured);
  const rest = tools.filter((t) => !t.featured);
  return (
    <div className="wrap">
      <div className="home-intro">
        <h1>Adulting, but make it organised.</h1>
        <p>
          Loans, bills, warranties and that streaming service you forgot you pay for, all in one place. Tap a tile and get
          sorting. The ones with a padlock want your birthday once per login. No cake involved, sadly.
        </p>
      </div>

      {featured.map((t) => {
        const h = t.headline?.();
        return (
          <a key={t.id} className="tool-hero" href={`#/${t.id}`}>
            <span className="ico">{icons[t.icon] ?? icons.plus}</span>
            <span className="hero-text">
              <span className="name">{t.name}</span>
              <span className="desc">{t.description}</span>
            </span>
            {h ? (
              <span className="hero-fig num">
                {h.value}
                <small>{h.per}</small>
              </span>
            ) : (
              <span className="hero-fig hero-go">Open →</span>
            )}
            {t.locked && <span className="lock" title="Locked">{icons.lock}</span>}
          </a>
        );
      })}

      <h2 className="home-sub">Your tools</h2>
      <nav className="tiles-dir" aria-label="Tools">
        {rest.map((t) => {
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
