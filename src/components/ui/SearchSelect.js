"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Input } from "./Field";
import Icon from "./Icon";
import { cn } from "./cn";

/**
 * A dropdown whose options are links, with a search box inside the menu to
 * filter long lists (e.g. people by email). Picking one navigates to its href.
 * `options` = [{ value, label, href }]; `value` = the selected option's value.
 */
export default function SearchSelect({ id, label, icon, value, options, placeholder = "Search…", className }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options), [q, options]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (opt) => {
    setOpen(false);
    setQuery("");
    if (opt.value !== value) startTransition(() => router.push(opt.href, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      {label && (
        <span className="mr-1 inline-flex items-center gap-1 font-medium text-slate-500">
          {icon && <Icon name={icon} className="size-3.5" />}
          {label}:
        </span>
      )}
      <div ref={rootRef} className="relative w-64 max-w-full">
        <button
          type="button"
          id={id}
          disabled={pending}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-surface px-3 text-xs text-ink shadow-xs focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-70"
        >
          <span className="truncate">{selected ? selected.label : "Select…"}</span>
          <Icon name="arrowUp" className="size-3.5 shrink-0 rotate-180 text-slate-400" />
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-lg">
            <div className="border-b border-slate-100 p-1.5">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  aria-label={label ? `Search ${label}` : "Search"}
                  className="h-8 py-0 pl-8 text-xs"
                />
              </div>
            </div>
            <ul role="listbox" aria-label={label} className="max-h-60 overflow-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-400">No matches</li>
              ) : (
                filtered.map((o) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      onClick={() => choose(o)}
                      className={cn(
                        "block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-slate-50",
                        o.value === value ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600",
                      )}
                    >
                      {o.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
