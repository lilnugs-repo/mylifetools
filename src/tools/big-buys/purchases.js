// Pure logic for Big Buys & Warranties: categories, warranty status, totals and
// the home screen badge. No React here, so the home screen can use it cheaply.
import { addMonths, parseISO, toISO } from "../_shared/loan/loan.js";
import { calendarEvent, safeUrl } from "../../lib/files.js";

export { parseISO, toISO };

export const STORAGE_KEY = "tools:big-buys:v1";
export const SOON_DAYS = 60; // "Warranty ending soon" this many days before cover ends

const DAY = 864e5;

// What counts as a big buy. `examples` fill the placeholder and the empty-state guide.
export const CATEGORIES = {
  phones: { label: "Phones & tablets", icon: "phone", examples: "Phone, tablet, smartwatch, e-reader" },
  computers: { label: "Computers", icon: "laptop", examples: "Laptop, desktop, monitor, printer, Wi-Fi router" },
  tv: { label: "TV & audio", icon: "tv", examples: "TV, soundbar, speakers, headphones, projector" },
  kitchen: { label: "Kitchen", icon: "fridge", examples: "Fridge, oven, cooktop, dishwasher, microwave, coffee machine, air fryer" },
  laundry: { label: "Laundry & cleaning", icon: "washer", examples: "Washing machine, dryer, vacuum, robot vacuum" },
  climate: { label: "Heating & cooling", icon: "snowflake", examples: "Air conditioner, heater, fan, dehumidifier, air purifier" },
  home: { label: "Home systems", icon: "home", examples: "Solar panels, home battery, hot water system, security cameras, EV charger" },
  furniture: { label: "Furniture & bedding", icon: "sofa", examples: "Mattress, bed, sofa, desk, office chair, dining table" },
  vehicles: { label: "Vehicles", icon: "car", examples: "Car, motorbike, e-bike, e-scooter, caravan, boat" },
  cameras: { label: "Cameras & gaming", icon: "camera", examples: "Camera, lens, drone, games console, VR headset" },
  tools: { label: "Tools & garden", icon: "wrench", examples: "Power tools, lawn mower, pressure washer, BBQ, generator" },
  fitness: { label: "Sport & fitness", icon: "dumbbell", examples: "Bike, treadmill, exercise bike, home gym, kayak" },
  hobbies: { label: "Hobbies & instruments", icon: "music", examples: "Guitar, piano, sewing machine, 3D printer" },
  jewellery: { label: "Jewellery & watches", icon: "gem", examples: "Watch, ring, necklace" },
  baby: { label: "Baby & kids", icon: "tag", examples: "Pram, car seat, cot" },
  other: { label: "Other", icon: "tag", examples: "Anything else worth keeping a record of" },
};

// Where the warranty card and receipt live.
export const STORED = {
  email: "Email",
  cloud: "Cloud drive (Google Drive, iCloud, Dropbox)",
  photo: "Photo on my phone",
  paper: "Paper copy at home",
  store: "Store account or app",
  brand: "Registered with the brand",
  box: "In the box",
  other: "Somewhere else",
};

export const GONE_HOW = ["Sold", "Gave away", "Replaced", "Broken", "Recycled", "Lost or stolen"];

export const emptyState = { items: [] };

export function shapeState(v) {
  return v && Array.isArray(v.items) ? { items: v.items } : null;
}

export function newItem(category = "phones", today = new Date()) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    category,
    brand: "",
    model: "",
    serial: "",
    store: "",
    bought: toISO(today),
    price: "",
    warrantyMonths: 12, // manufacturer's warranty
    extMonths: 0, // extended warranty, on top of the manufacturer's
    extProvider: "",
    storedIn: "email",
    storedNote: "",
    receiptUrl: "",
    notes: "",
    gone: null, // { date, how, soldFor } once you no longer have it
  };
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const price = (i) => Number(i.price) || 0;

/**
 * Warranty cover on `today`:
 *   none     no warranty recorded
 *   active   covered, more than SOON_DAYS left (onExtended: past the manufacturer's)
 *   soon     cover ends within SOON_DAYS
 *   expired  cover has ended
 */
export function warrantyStatus(i, today) {
  const bought = parseISO(i.bought);
  const mfr = Number(i.warrantyMonths) || 0;
  const ext = Number(i.extMonths) || 0;
  if (!mfr && !ext) return { state: "none", bought };
  const mfrEnd = addMonths(bought, mfr);
  const end = addMonths(bought, mfr + ext);
  const daysLeft = Math.round((end - today) / DAY);
  const pct = Math.min(100, Math.max(0, ((today - bought) / (end - bought)) * 100));
  const onExtended = ext > 0 && today >= mfrEnd;
  const state = daysLeft <= 0 ? "expired" : daysLeft <= SOON_DAYS ? "soon" : "active";
  return { state, bought, mfrEnd, end, daysLeft, pct, onExtended };
}

/** "2 years 3 months", "5 months", "12 days" */
export function span(from, to) {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m--;
  if (m < 1) {
    const d = Math.max(0, Math.round((to - from) / DAY));
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const y = Math.floor(m / 12), r = m % 12;
  const part = (n, w) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
  return [part(y, "year"), part(r, "month")].filter(Boolean).join(" ");
}

export function summary(items, today) {
  const owned = items.filter((i) => !i.gone);
  let covered = 0, soon = 0, spent = 0;
  for (const i of owned) {
    const st = warrantyStatus(i, today).state;
    if (st === "active" || st === "soon") covered++;
    if (st === "soon") soon++;
    spent += price(i);
  }
  return { owned: owned.length, covered, soon, spent };
}

export function endingSoon(items, today) {
  return items.filter((i) => !i.gone).map((i) => ({ i, st: warrantyStatus(i, today) })).filter((x) => x.st.state === "soon");
}

/** Badge for the home screen tile, read from this device's saved copy (no login needed). */
export function homeBadge() {
  try {
    const state = shapeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    const n = state ? endingSoon(state.items, startOfToday()).length : 0;
    if (n) return { tone: "soon", text: `${n} warrant${n > 1 ? "ies" : "y"} ending soon` };
  } catch {}
  return null;
}

/** An .ics reminder 30 days before the warranty ends, so there's time to check the item over. */
export function calendarFile(i) {
  const { end } = warrantyStatus(i, startOfToday());
  const what = i.name || "item";
  const description = [
    `Warranty for ${[i.brand, i.model].filter(Boolean).join(" ") || what} ends. Check it over and claim any faults before then.`,
    i.store && `Bought at: ${i.store}`,
    i.serial && `Serial: ${i.serial}`,
    `Warranty stored: ${STORED[i.storedIn] ?? "?"}${i.storedNote ? ` (${i.storedNote})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    name: `${what}-warranty-ends-${toISO(end)}.ics`,
    text: calendarEvent({ uid: i.id, date: end, title: `${what} warranty ends`, description, url: safeUrl(i.receiptUrl), daysBefore: 30 }),
  };
}
