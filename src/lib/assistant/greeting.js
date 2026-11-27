/**
 * Time-of-day greeting (ATLAS Agent Etiquette A1). Pure, no I/O, no server-only:
 * the Home welcome line (client) and the NEXUS prompt (server) import this SAME
 * module, so the two can never disagree about which half of the day it is.
 *
 * Clock: the user's own IANA zone when the browser sent a valid one, else
 * Asia/Kolkata. The hour is always computed from `now` + zone here — a
 * client-sent hour is never trusted.
 *
 * Bands (local hour): 05–11 Good morning · 12–16 Good afternoon ·
 * 17–21 Good evening · 22–04 Hello. Never "Good night" as a greeting.
 * An unreadable clock → "Hello" (neutral is safe; the wrong half of the day is the bug).
 */

export const DEFAULT_TZ = "Asia/Kolkata";

/** A valid IANA zone, else Asia/Kolkata. */
export function resolveTimeZone(tz) {
  if (typeof tz !== "string" || !tz.trim() || tz.length > 64) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz.trim() }).format(0);
    return tz.trim();
  } catch {
    return DEFAULT_TZ;
  }
}

function toDate(now) {
  if (now == null || now === "") return new Date(); // absent clock means NOW (new Date(null) is 1970)
  const d = now instanceof Date ? now : new Date(now);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local hour 0–23 in the zone, or null for an unreadable clock. */
export function localHour(now, tz) {
  const d = toDate(now);
  if (!d) return null;
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: resolveTimeZone(tz) }).format(d));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}

export function greetingForHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "Hello";
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 16) return "Good afternoon";
  if (hour >= 17 && hour <= 21) return "Good evening";
  return "Hello";
}

export function greetingFor({ now, tz } = {}) {
  return greetingForHour(localHour(now, tz));
}

/** First name only; emails and junk give "". */
export function firstName(name) {
  const s = String(name ?? "").trim();
  if (!s || s.includes("@")) return "";
  const w = s.split(/\s+/)[0].replace(/[^\p{L}\p{M}'-]/gu, "");
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "";
}

/** "Good morning, Priya!" / "Good morning!" */
export function greetLine({ name, now, tz } = {}) {
  const g = greetingFor({ now, tz });
  const f = firstName(name);
  return f ? `${g}, ${f}!` : `${g}!`;
}

/** "Fri, 27 Nov 2026, 3:30 PM IST" — the user's clock, zone named. */
export function localTimeText({ now, tz } = {}) {
  const d = toDate(now);
  const zone = resolveTimeZone(tz);
  if (!d) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const text = `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod || "").toUpperCase()}`;
  return `${text} ${zone === DEFAULT_TZ ? "IST" : zone}`;
}

/** Everything the prompt needs so the model never guesses the time. */
export function clockContext({ now, tz, name } = {}) {
  const zone = resolveTimeZone(tz);
  return { greeting: greetingFor({ now, tz: zone }), greetLine: greetLine({ name, now, tz: zone }), localTimeText: localTimeText({ now, tz: zone }), tz: zone };
}
