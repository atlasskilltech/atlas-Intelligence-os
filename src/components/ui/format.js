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
