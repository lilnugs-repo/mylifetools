// Small inline icon set (stroke icons, 24px grid). Add new ones here as tools are added.
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export const icons = {
  car: (
    <svg {...base}>
      <path d="M5 17h14M5 17a2 2 0 1 1-4 0v-4l2.5-5.5A2 2 0 0 1 5.3 6h13.4a2 2 0 0 1 1.8 1.5L23 13v4a2 2 0 1 1-4 0" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  ),
  home: (
    <svg {...base}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  ),
  plus: (
    <svg {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  lock: (
    <svg {...base}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  back: (
    <svg {...base} width="16" height="16">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
};
