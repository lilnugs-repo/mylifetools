import { useEffect, useState } from "react";

// Light/dark mode. With no saved choice the app follows the device setting;
// tapping the toggle saves "light" or "dark" in this browser.
// index.html applies the saved choice before React loads, so there's no flash.
const KEY = "mt:theme";
const BAR = { light: "#f6f1e9", dark: "#1d1a17" };
const media = window.matchMedia("(prefers-color-scheme: dark)");

const saved = () => {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
};

const apply = (theme) => {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR[theme]);
};

export function useTheme() {
  const [choice, setChoice] = useState(saved);
  const [system, setSystem] = useState(media.matches ? "dark" : "light");
  const theme = choice || system;

  useEffect(() => {
    const on = (e) => setSystem(e.matches ? "dark" : "light");
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    apply(theme);
  }, [choice, theme]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setChoice(next);
  };

  return { theme, toggle };
}
