import { cn } from "./cn";

const control =
  "block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

/** Label + control + hint/error wrapper. */
export function Field({ label, htmlFor, hint, error, children, className }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Input({ invalid, className, ...props }) {
  return (
    <input
      className={cn(control, invalid ? "border-red-400 focus:border-red-500" : "border-slate-300 focus:border-brand-500", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({ invalid, className, children, ...props }) {
  return (
    <select
      className={cn(control, invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
}
