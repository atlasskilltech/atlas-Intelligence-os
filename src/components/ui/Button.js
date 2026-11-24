import Link from "next/link";
import { cn } from "./cn";

const VARIANTS = {
  // CRM .btn-primary: emerald #10b981, hover #059669
  primary: "bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500",
  // CRM .btn-outline
  secondary:
    "bg-white text-navy-800 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 focus-visible:outline-slate-400",
  // CRM .btn-ghost
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-navy-800 focus-visible:outline-slate-400",
  // CRM navy button (secondary emphasis)
  navy: "bg-navy-800 text-white hover:bg-navy-700 focus-visible:outline-navy-800",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

/** Renders a <Link> when `href` is given, otherwise a <button>. */
export default function Button({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}) {
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
