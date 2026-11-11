import LoanTracker from "../_shared/loan/LoanTracker.jsx";
import config from "./config.js";

export default function HomeLoanTracker() {
  return <LoanTracker config={config} />;
}
