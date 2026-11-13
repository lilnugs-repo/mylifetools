/**
 * "Send to Fixed Expenses" switch shown at the top of each tool that has regular costs.
 * `summary` says what gets sent (e.g. "$612.40 a month"), shown while it's on.
 */
export default function FixedToggle({ on, onChange, summary }) {
  return (
    <div className="fx-toggle" data-on={on ? "1" : undefined}>
      <label>
        <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="fx-switch" aria-hidden="true" />
        <span>
          <b>Send to Fixed Expenses</b>
          <small>{on ? (summary ? `Adding ${summary} to your fixed expenses` : "Included in your fixed expenses") : "Not counted in your fixed expenses"}</small>
        </span>
      </label>
      <a className="btn small" href="#/fixed-expenses">
        Open Fixed Expenses
      </a>
    </div>
  );
}
