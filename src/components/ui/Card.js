import { cn } from "./cn";

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn("rounded-xl border border-slate-200 bg-surface shadow-xs", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
