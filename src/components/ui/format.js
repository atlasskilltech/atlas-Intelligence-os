export const fmtInt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

export function fmtUsd(n) {
  if (!n) return "$0.00";
  if (n < 0.0001) return "< $0.0001";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
}

export function fmtDuration(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Duration of a run: finished → total, otherwise time since start. */
export function runDuration(run) {
  if (!run.startedAt) return null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  return end - Date.parse(run.startedAt);
}
