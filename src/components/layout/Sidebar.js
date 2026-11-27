"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { HomeModeToggle, useHomeMode } from "./HomeMode";
import { openSearch } from "./SearchDialog";
import SidebarHistory from "./SidebarHistory";
import UserMenu from "./UserMenu";
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
          <li>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                openSearch();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-white/65 transition-colors hover:bg-white/8 hover:text-white"
            >
              <Icon name="search" className="size-[18px] shrink-0 opacity-80" />
              <span className="flex-1 truncate">Search</span>
              <kbd className="hidden rounded border border-white/15 px-1 font-sans text-[10px] text-white/40 lg:inline">Ctrl K</kbd>
            </button>
          </li>
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <SidebarHistory recentAgents={recentAgents} onNavigate={onNavigate} />
      </div>

      <div className="border-t border-white/10 px-3 pb-3">
        {SECONDARY_NAV.length > 0 && (
          <ul className="space-y-px pt-3">
            {SECONDARY_NAV.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={item.href === current} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
        <UserMenu user={user} aiConfigured={aiConfigured} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
