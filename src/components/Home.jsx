import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";
import { primeKeyboard } from "../lib/keyboard.js";

/** `needsPin`: not logged in, so tapping a locked tool opens the PIN screen. */
export default function Home({ needsPin }) {
  // Bring the number keyboard up during the tap, ready for the PIN screen
  const onOpen = (t) => () => {
    if (t.locked && needsPin) primeKeyboard();
  };
  const featured = tools.filter((t) => t.featured && !t.hidden);
  const rest = tools.filter((t) => !t.featured && !t.hidden);
  return (
    <div className="wrap">
      <div className="home-intro">
        <h1>Adulting, but make it organised.</h1>
        <p>
          Loans, bills, warranties and that streaming service you forgot you pay for, all in one place. Tap a tile and get
          sorting.
        </p>
      </div>

      {featured.map((t) => {
        const h = t.headline?.();
        return (
          <a key={t.id} className="tool-hero" href={`#/${t.id}`} onClick={onOpen(t)}>
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
          </a>
        );
      })}

      <h2 className="home-sub">Your tools</h2>
      <nav className="tiles-dir" aria-label="Tools">
        {rest.map((t) => {
          const badge = t.badge?.();
          return (
            <a key={t.id} className="tool-tile" href={`#/${t.id}`} onClick={onOpen(t)}>
              <span className="ico">{icons[t.icon] ?? icons.plus}</span>
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
