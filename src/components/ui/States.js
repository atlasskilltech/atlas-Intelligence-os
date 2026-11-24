import { cn } from "./cn";
import Icon from "./Icon";

/** Shown when a list or page has no data yet. */
export function EmptyState({ icon = "sparkles", title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600",
        className,
      )}
    />
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}

const ALERT_TONES = {
  info: { box: "border-blue-200 bg-blue-50 text-blue-900", icon: "sparkles" }, // CRM --info #3b82f6
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "check" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "alert" },
};

/** Inline message for info / success / warning / error states. */
export function Alert({ tone = "info", title, children, className }) {
  const t = ALERT_TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", t.box, className)}
    >
      <Icon name={t.icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}
