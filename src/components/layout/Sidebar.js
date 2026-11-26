"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { HomeModeToggle, useHomeMode } from "./HomeMode";
import SidebarHistory from "./SidebarHistory";
import { NEW_HREF, PRIMARY_NAV, SECONDARY_NAV, activeHref } from "./navigation";

/**
 * ATLAS IntelligenceOS logo. `onDark` = always the white-text logo (navy sidebar);
 * otherwise it follows the theme: dark text in light mode, white text in dark mode.
 */
export function Logo({ onDark = true, className = "h-9" }) {
  return (
    <Link href="/" aria-label="ATLAS IntelligenceOS — Home" className="flex min-w-0 shrink-0 items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
      <img src="/brand/logo-dark.svg" alt="ATLAS IntelligenceOS" className={cn("w-auto", className, !onDark && "hidden dark:block")} />
      {!onDark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/logo-light.svg" alt="ATLAS IntelligenceOS" className={cn("w-auto dark:hidden", className)} />
      )}
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
 * The Chat / Agent switch sits top-right (like Claude); the desktop sidebar is
 * resized or closed by dragging its edge. `onNavigate` closes the mobile drawer.
 */
export default function Sidebar({ aiConfigured, recentAgents = [], user = null, onNavigate }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  const { startNewChat } = useHomeMode();

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-navy-800 text-white">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <Logo />
        <HomeModeToggle onNavigate={onNavigate} />
      </div>

      <div className="px-3 pt-3">
        <Link
          href={NEW_HREF}
          onClick={() => {
            startNewChat();
            onNavigate?.();
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors",
            current === NEW_HREF || current === "/agents/new"
              ? "border-brand-500 bg-brand-500 text-navy-800"
              : "border-white/15 text-white hover:border-brand-500/60 hover:bg-white/5",
          )}
        >
          <Icon name="plus" className="size-[18px]" />
          New
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

        <SidebarHistory recentAgents={recentAgents} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <ul className="space-y-px">
          {SECONDARY_NAV.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2">
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
            <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full" />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80">
              <Icon name="user" className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium" title={user?.email || undefined}>
              {user?.name || "ATLAS Employee"}
              {user?.role === "admin" && !user?.local && <span className="ml-1.5 text-[10px] font-semibold uppercase text-brand-400">Admin</span>}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] whitespace-nowrap text-white/50">
              <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-brand-400" : "bg-amber-400")} />
              {aiConfigured ? "OpenAI configured" : "AI not configured"}
            </p>
          </div>
          {user && !user.local && (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-white/60 hover:bg-white/8 hover:text-white"
                title="Sign out"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}
