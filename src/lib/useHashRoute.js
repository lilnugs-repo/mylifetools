import { useEffect, useState } from "react";

// Hash routing (#/car-loan) keeps the app a static site: no server rewrites
// needed on Vercel, and refreshing any page just works.
const read = () => window.location.hash.replace(/^#\/?/, "").split("/")[0] || "";

export function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
