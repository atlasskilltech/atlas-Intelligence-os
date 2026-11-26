"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

/**
 * Search box for the agents list. Debounces typing and writes the `q` query
 * param (other filters preserved), so the server re-filters agents by name.
 */
export default function AgentSearch({ value = "", placeholder = "Search agents by name…", className }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(value);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);

  useEffect(() => {
    // Skip the first run so loading the page with ?q=… doesn't re-navigate.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      const trimmed = q.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search agents"
        className={cn("h-9 pl-9", pending && "opacity-80")}
      />
    </div>
  );
}
