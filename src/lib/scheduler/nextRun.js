import { DAYS } from "../agents/schedule.js";

/**
 * When does a schedule fire next? (pure, no dependencies)
 * Works in the schedule's own time zone, so "every day at 09:00 Asia/Kolkata"
 * means 09:00 in India whatever the server's clock zone is.
 */

/** Wall-clock parts of an instant in a time zone. */
export function wallParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: DAYS.indexOf(parts.weekday.slice(0, 3).toLowerCase()),
  };
}

/** Offset (ms) of a time zone from UTC at an instant. */
function offsetMs(instantMs, timeZone) {
  const p = wallParts(new Date(instantMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** The instant (ms) when the wall clock in `timeZone` shows y-m-d h:mi. Handles DST shifts. */
export function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMs(guess, timeZone);
  const again = guess - offsetMs(t, timeZone); // re-check across a DST boundary
  if (again !== t) t = again;
  return t;
}

/**
 * First fire time strictly after `after` (Date or ms), as a Date.
 * schedule: { frequency: hourly|daily|weekly|monthly, time "HH:MM", daysOfWeek [], dayOfMonth, timezone }
 */
export function nextRunAfter(schedule, after) {
  const afterMs = after instanceof Date ? after.getTime() : Number(after);
  const tz = schedule.timezone || "Asia/Kolkata";
  const [h, m] = String(schedule.time || "09:00").split(":").map(Number);
  const now = wallParts(new Date(afterMs), tz);

  if (schedule.frequency === "hourly") {
    for (let k = 0; k <= 25; k++) {
      // walk forward hour by hour in wall time
      const base = Date.UTC(now.year, now.month - 1, now.day, now.hour + k, m);
      const d = new Date(base);
      const t = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), m, tz);
      if (t > afterMs) return new Date(t);
    }
  }

  const wantDays = (schedule.daysOfWeek || []).map((d) => DAYS.indexOf(d)).filter((d) => d >= 0);
  for (let k = 0; k <= 400; k++) {
    const d = new Date(Date.UTC(now.year, now.month - 1, now.day + k));
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = d.getUTCDay();
    if (schedule.frequency === "weekly" && !wantDays.includes(weekday)) continue;
    if (schedule.frequency === "monthly" && day !== Number(schedule.dayOfMonth || 1)) continue;
    const t = zonedTimeToUtc(y, mo, day, h, m, tz);
    if (t > afterMs) return new Date(t);
  }
  throw new Error("No upcoming run found for this schedule.");
}

/** Signature that changes whenever the schedule changes (so the next run is recalculated). */
export const scheduleSignature = (s) => [s.frequency, s.time, (s.daysOfWeek || []).join(","), s.dayOfMonth ?? "", s.timezone].join("|");
