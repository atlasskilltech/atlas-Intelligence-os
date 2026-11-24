"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { PRIMARY_NAV, SECONDARY_NAV, activeHref } from "./navigation";

/** CRM-style brand block: emerald rounded square with navy initial. */
export function Logo({ onDark = true }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-brand-500 text-sm font-bold text-navy-800">
        A
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn("block truncate text-sm font-bold tracking-tight", onDark ? "text-white" : "text-navy-800")}>
          ATLAS IntelligenceOS
        </span>
        <span className={cn("block truncate text-[10px]", onDark ? "text-white/50" : "text-slate-500")}>
          AI Agent Builder
        </span>
      </span>
    </Link>
  );
}

function NavLink({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
        // CRM: active = emerald fill + navy text; idle = white/65, hover white/8
        active ? "bg-brand-500 font-semibold text-navy-800" : "text-white/65 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon name={item.icon} className={cn("size-[18px] shrink-0", active ? "opacity-100" : "opacity-80")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Dark navy sidebar in the style of ChatGPT / Claude, coloured like the ATLAS CRM.
 * `onCollapse` shows the collapse button (desktop); `onNavigate` closes the mobile drawer.
 */
export default function Sidebar({ aiConfigured, onNavigate, onCollapse }) {
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-navy-800 text-white">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <Logo />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/8 hover:text-white"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <Icon name="panel" className="size-[18px]" />
          </button>
        )}
      </div>

      <div className="px-3 pt-3">
        <Link
          href="/agents/new"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors",
            current === "/agents/new"
              ? "border-brand-500 bg-brand-500 text-navy-800"
              : "border-white/15 text-white hover:border-brand-500/60 hover:bg-white/5",
          )}
        >
          <Icon name="edit" className="size-[18px]" />
          New agent
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgba(255,255,255,.25)_transparent] [scrollbar-width:thin]">
        <ul className="space-y-px">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <p className="mt-6 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Recent agents</p>
        <p className="px-3 text-xs text-white/45">Agents you create will appear here.</p>
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <ul className="space-y-px">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80">
            <Icon name="user" className="size-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">ATLAS Employee</p>
            <p className="flex items-center gap-1.5 text-[11px] text-white/50">
              <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-brand-400" : "bg-amber-400")} />
              {aiConfigured ? "OpenAI configured" : "AI not configured"}
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
}
