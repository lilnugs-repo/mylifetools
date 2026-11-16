import { tools } from "../tools/registry.js";
import { icons } from "./icons.jsx";
import { inDays } from "../tools/rent-payday/schedule.js";
import { leftAfterFixed } from "../tools/fixed-expenses/fixed.js";

const nf = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => (n < 0 ? "−" : "") + "$" + nf.format(Math.abs(n));

const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

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
                {c.warn ?? (c.after ? `Next due ${inDays(c.after.days)}` : fmtDay(c.date))}
              </small>
              {!c.warn && c.after && <small>{fmtDay(c.after.date)}</small>}
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

      <LeftToSpend l={leftAfterFixed()} syncing={syncing} />

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

/** What's left from each pay once fixed expenses are covered (pay from Rent & Payday). */
function LeftToSpend({ l, syncing }) {
  if (!l) return null;
  if (!l.hasPay)
    return (
      <section className="home-left" data-empty="1" aria-label="Left for spending">
        <span className="k">Left for spending</span>
        <p>Add your pay amount in Rent &amp; Payday to see what's left each payday after your fixed expenses.</p>
        <a className="btn small" href="#/rent-payday">
          Add my pay
        </a>
      </section>
    );
  const short = l.left < 0;
  return (
    <section className="home-left" data-short={short ? "1" : undefined} aria-label="Left for spending">
      <span className="k">{short ? "Fixed expenses are more than your pay" : "Left for spending each payday"}</span>
      <span className="v num">
        {money(l.left)}
        <small> {syncing ? "Updating…" : l.per}</small>
      </span>
      <span className="sum num">
        {money(l.pay)} pay − {money(l.fixed)} fixed expenses
      </span>
      <span className="sum num">≈ {money(l.leftMonthly)} a month</span>
      {!l.rentCounted && (
        <span className="note">
          Rent isn't counted yet.{" "}
          <a href="#/rent-payday">Switch on “Send to Fixed Expenses” in Rent &amp; Payday</a>
        </span>
      )}
    </section>
  );
}
