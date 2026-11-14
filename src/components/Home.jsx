import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";

/** Shown once the PIN is in (App.jsx). `syncing`: App is pulling every tool's latest data (see syncAll). */
export default function Home({ syncing }) {
  const featured = tools.filter((t) => t.featured && !t.hidden);
  const rest = tools.filter((t) => !t.featured && !t.hidden);
  const strip = tools.flatMap((t) => (t.countdowns?.() ?? []).map((c) => ({ ...c, tool: t })));
  const CD_COLOR = { payday: "var(--ok)", rent: "var(--interest)", cotenant: "var(--accent)" };
  return (
    <div className="wrap">
      <div className="home-intro">
        <h1>Adulting, but make it organised.</h1>
        <p>
          Loans, bills, warranties and that streaming service you forgot you pay for, all in one place. Tap a tile and get
          sorting.
        </p>
      </div>

      {strip.length > 0 && (
        <nav className="home-countdowns" aria-label="Coming up">
          {strip.map((c) => (
            <a
              key={`${c.tool.id}-${c.key}`}
              href={`#/${c.tool.id}`}
              style={{ "--c": c.paid ? "var(--ok)" : CD_COLOR[c.key] }}
              data-paid={c.paid ? "1" : undefined}
            >
              <b>{c.text}</b>
              <small className={c.warn ? "cd-warn" : undefined}>
                {c.warn ??
                  `${c.paid ? "Due " : ""}${c.date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}`}
              </small>
            </a>
          ))}
        </nav>
      )}

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
                <small>{syncing ? "Updating…" : h.per}</small>
              </span>
            ) : (
              <span className="hero-fig hero-go">{syncing ? "Updating…" : "Open →"}</span>
            )}
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
