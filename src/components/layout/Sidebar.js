"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { NAV_SECTIONS, activeHref } from "./navigation";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        A
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-slate-900">ATLAS</span>
        <span className="block text-xs text-slate-500">IntelligenceOS</span>
      </span>
    </Link>
  );
}

export default function Sidebar({ onNavigate }) {
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === current;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon
                        name={item.icon}
                        className={cn("size-[18px]", active ? "text-brand-600" : "text-slate-400")}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 px-5 py-4">
        <p className="text-xs font-medium text-slate-700">Internal prototype</p>
        <p className="mt-0.5 text-xs text-slate-500">For ATLAS SkillTech University staff.</p>
      </div>
    </nav>
  );
}
