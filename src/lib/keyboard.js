// Phones (iPhones especially) only open the on-screen keyboard when an input is focused
// during the tap itself. The PIN screen appears a moment after a tile is tapped, which is
// too late, so the tap focuses this hidden number field to bring the keyboard up; the PIN
// screen then moves focus to its own boxes and the keyboard stays open.

let proxy = null;

export function primeKeyboard() {
  try {
    if (!proxy) {
      proxy = document.createElement("input");
      proxy.setAttribute("inputmode", "numeric");
      proxy.setAttribute("aria-hidden", "true");
      proxy.tabIndex = -1;
      // 16px stops iOS zooming in; kept on screen but invisible so it can take focus
      Object.assign(proxy.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", border: "0", padding: "0", fontSize: "16px" });
      document.body.appendChild(proxy);
    }
    proxy.focus({ preventScroll: true });
  } catch {}
}

/** Drop the hidden field: once the PIN boxes have focus, or when no PIN is needed after all. */
export function releaseKeyboard() {
  if (!proxy) return;
  if (document.activeElement === proxy) proxy.blur();
  proxy.remove();
  proxy = null;
}
