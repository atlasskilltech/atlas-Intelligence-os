"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "./Field";
import Icon from "./Icon";
import { cn } from "./cn";

/**
 * A dropdown whose options are links: picking one navigates to its href.
 * For filters with too many choices for a row of chips.
 * `options` = [{ value, label, href }]; `value` = the selected option's value.
 */
export default function LinkSelect({ id, label, icon, value, options, className }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <label htmlFor={id} className="mr-1 inline-flex items-center gap-1 font-medium text-slate-500">
        {icon && <Icon name={icon} className="size-3.5" />}
        {label}:
      </label>
      <div className="w-64 max-w-full">
      <Select
        id={id}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) startTransition(() => router.push(opt.href, { scroll: false }));
        }}
        className="h-8 py-0 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      </div>
    </div>
  );
}
