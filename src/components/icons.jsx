// Small inline icon set (stroke icons, 24px grid). Add new ones here as tools are added.
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

/** The app's logo: a heartbeat that rises like a tick ("life, sorted"), ending in a warm dot. Matches public/favicon.svg. */
export function Logo({ size = 28 }) {
  return (
    <svg className="logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M5 18h4l2.5-6.5 4.5 11 3.5-9 1.8 4.5"
        fill="none"
        stroke="var(--surface)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25.8" cy="18" r="2.3" fill="var(--spark)" />
    </svg>
  );
}

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
  bolt: (
    <svg {...base}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  ),
  flame: (
    <svg {...base}>
      <path d="M12 22c4 0 7-2.7 7-7 0-4.5-4-7.5-5-12-2 2.5-3 4.5-3 7-1.2-.8-2-2-2.2-3.5C6.6 8.6 5 11.3 5 15c0 4.3 3 7 7 7z" />
    </svg>
  ),
  wifi: (
    <svg {...base}>
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.3a5 5 0 0 1 7 0" />
      <circle cx="12" cy="20" r="0.6" fill="currentColor" />
    </svg>
  ),
  phone: (
    <svg {...base}>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  ),
  tag: (
    <svg {...base}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  ),
  receipt: (
    <svg {...base}>
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5-2 1.5-2.5-1.5L5 21V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  ),
  laptop: (
    <svg {...base}>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </svg>
  ),
  tv: (
    <svg {...base}>
      <rect x="2" y="5" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
    </svg>
  ),
  fridge: (
    <svg {...base}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M5 10h14M9 5.5v2M9 13v3" />
    </svg>
  ),
  washer: (
    <svg {...base}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="13" r="5" />
      <path d="M8 5.5h.01M11 5.5h.01" />
    </svg>
  ),
  snowflake: (
    <svg {...base}>
      <path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9 4l3 2 3-2M9 20l3-2 3 2" />
    </svg>
  ),
  sofa: (
    <svg {...base}>
      <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
      <path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2v-5zM5 18v2M19 18v2" />
    </svg>
  ),
  camera: (
    <svg {...base}>
      <path d="M3 8a2 2 0 0 1 2-2h2.5L9 4h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  wrench: (
    <svg {...base}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" />
    </svg>
  ),
  dumbbell: (
    <svg {...base}>
      <path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />
    </svg>
  ),
  music: (
    <svg {...base}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  gem: (
    <svg {...base}>
      <path d="M6 3h12l3 6-9 12L3 9l3-6zM3 9h18M9 3l3 18M15 3l-3 18" />
    </svg>
  ),
  repeat: (
    <svg {...base}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V10a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  play: (
    <svg {...base}>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M10 9l5 3-5 3V9z" />
    </svg>
  ),
  grid: (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  cloud: (
    <svg {...base}>
      <path d="M7 18a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17.5 18H7z" />
    </svg>
  ),
  news: (
    <svg {...base}>
      <path d="M4 4h13v15a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z" />
      <path d="M17 8h3v11a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" />
    </svg>
  ),
  gamepad: (
    <svg {...base}>
      <path d="M6 7h12a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L15 14H9l-.7.6A3.5 3.5 0 0 1 2 12.5V11a4 4 0 0 1 4-4z" />
      <path d="M7 10v3M5.5 11.5h3M15.5 11h.01M17.5 12.5h.01" />
    </svg>
  ),
  bag: (
    <svg {...base}>
      <path d="M5 8h14l-1 13H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  book: (
    <svg {...base}>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20v-5" />
    </svg>
  ),
  wallet: (
    <svg {...base}>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 14h.01" />
    </svg>
  ),
  pin: (
    <svg {...base}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  link: (
    <svg {...base}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  ),
  calendar: (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  sun: (
    <svg {...base} width="16" height="16">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg {...base} width="16" height="16">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
  back: (
    <svg {...base} width="16" height="16">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
};
