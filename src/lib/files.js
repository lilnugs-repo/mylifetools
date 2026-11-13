// Small browser helpers shared by tools: safe links, calendar reminders, downloads.

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const esc = (t) => String(t).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

/** Only ever link to http(s); add https:// when it was typed without one. Returns null otherwise. */
export function safeUrl(url) {
  const u = (url || "").trim();
  if (!u) return null;
  const full = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const p = new URL(full);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * An all-day .ics calendar event on `date`, with a reminder `daysBefore` and
 * one at 9am on the day. Works with Apple, Google and Outlook calendars.
 */
export function calendarEvent({ uid, date, title, description = "", url, daysBefore = 7 }) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const link = safeUrl(url);
  const alarm = (trigger, text) => ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, "END:VALARM"];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Life Tools//EN",
    "BEGIN:VEVENT",
    `UID:${uid}-${ymd(date)}@my-tools`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(link ? [`URL:${link}`] : []),
    ...alarm(`-P${daysBefore}D`, `${title} in ${daysBefore} days`),
    ...alarm("PT9H", `${title} today`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Hand the viewer a file to save. */
export function downloadFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name.replace(/[^a-z0-9.-]+/gi, "-");
  a.click();
  URL.revokeObjectURL(a.href);
}
