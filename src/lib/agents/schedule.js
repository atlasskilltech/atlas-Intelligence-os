/**
 * Schedule helpers (pure; client + server). A schedule is stored as friendly
 * fields AND a derived cron expression, so the UI stays simple and the
 * scheduler (Milestone 9) gets a precise rule.
 */

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABEL = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
export const FREQUENCIES = ["hourly", "daily", "weekly", "monthly"];
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fills defaults and fixes invalid values. Returns a complete schedule object. */
export function normalizeSchedule(s = {}) {
  const frequency = FREQUENCIES.includes(s.frequency) ? s.frequency : "daily";
  const time = TIME_RE.test(s.time || "") ? s.time : "09:00";
  let daysOfWeek = Array.isArray(s.daysOfWeek) ? [...new Set(s.daysOfWeek.filter((d) => DAYS.includes(d)))] : [];
  daysOfWeek.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  if (frequency === "weekly" && daysOfWeek.length === 0) daysOfWeek = ["mon"];
  if (frequency !== "weekly") daysOfWeek = [];
  const dom = Number.parseInt(s.dayOfMonth, 10);
  const dayOfMonth = frequency === "monthly" ? (dom >= 1 && dom <= 28 ? dom : 1) : null;
  const timezone = typeof s.timezone === "string" && isValidTimezone(s.timezone) ? s.timezone : DEFAULT_TIMEZONE;
  const schedule = { frequency, time, daysOfWeek, dayOfMonth, timezone };
  return { ...schedule, cron: toCron(schedule) };
}

export function toCron({ frequency, time, daysOfWeek, dayOfMonth }) {
  const [h, m] = time.split(":").map(Number);
  switch (frequency) {
    case "hourly":
      return `${m} * * * *`;
    case "weekly":
      return `${m} ${h} * * ${daysOfWeek.map((d) => DAYS.indexOf(d)).join(",")}`;
    case "monthly":
      return `${m} ${h} ${dayOfMonth} * *`;
    default:
      return `${m} ${h} * * *`;
  }
}

function fmtTime(time) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

/** Human-readable trigger, e.g. "Every Mon, Wed at 9:00 AM (Asia/Kolkata)". */
export function describeTrigger(trigger) {
  if (!trigger || trigger.type === "manual") return "Run manually";
  if (trigger.type === "webhook") return "When triggered by another system (webhook)";
  const s = trigger.schedule;
  if (!s) return "On a schedule";
  const tz = ` (${s.timezone})`;
  switch (s.frequency) {
    case "hourly":
      return `Every hour at :${s.time.split(":")[1]}${tz}`;
    case "weekly":
      return `Every ${s.daysOfWeek.map((d) => DAY_LABEL[d]).join(", ")} at ${fmtTime(s.time)}${tz}`;
    case "monthly":
      return `Monthly on the ${ordinal(s.dayOfMonth)} at ${fmtTime(s.time)}${tz}`;
    default:
      return `Every day at ${fmtTime(s.time)}${tz}`;
  }
}
