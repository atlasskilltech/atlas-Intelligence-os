"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import Sidebar, { Logo } from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import { titleFor } from "./navigation";

const COLLAPSE_KEY = "atlas.sidebarCollapsed";

/**
 * ChatGPT/Claude-style frame: collapsible navy sidebar on desktop, slide-out
 * drawer on mobile/tablet, slim header above the page. Page content (server
 * components) is passed through as children.
 */
export default function AppShell({ aiConfigured = false, recentAgents = [], children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

  // Remember the desktop collapse choice (per browser only; safe if storage is blocked).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  const setCollapsedSaved = (v) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-64 transition-transform duration-200 lg:block",
          collapsed && "-translate-x-full",
        )}
        aria-hidden={collapsed || undefined}
      >
        <Sidebar aiConfigured={aiConfigured} recentAgents={recentAgents} onCollapse={() => setCollapsedSaved(true)} />
      </aside>

      {/* Mobile / tablet drawer */}
      <div className={cn("lg:hidden", !drawerOpen && "pointer-events-none")} aria-hidden={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn("fixed inset-0 z-40 bg-navy-900/50 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0")}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl transition-transform",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar
            aiConfigured={aiConfigured}
            recentAgents={recentAgents}
            onNavigate={() => setDrawerOpen(false)}
            onCollapse={() => setDrawerOpen(false)}
          />
        </aside>
      </div>

      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", !collapsed && "lg:pl-64")}>
        <header
          className={cn(
            "sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-5",
            isHome ? "bg-slate-50/90 backdrop-blur" : "border-b border-slate-200 bg-surface/90 backdrop-blur",
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink lg:hidden"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Icon name="menu" />
          </button>
          {collapsed && (
            <>
              <button
                type="button"
                onClick={() => setCollapsedSaved(false)}
                className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink lg:block"
                aria-label="Open sidebar"
                title="Open sidebar"
              >
                <Icon name="panel" />
              </button>
              <Link
                href="/agents/new"
                className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink lg:block"
                aria-label="New agent"
                title="New agent"
              >
                <Icon name="edit" />
              </Link>
            </>
          )}
          <div className={cn("lg:hidden", isHome && "hidden")}>
            <Logo onDark={false} className="h-8" />
          </div>
          {!isHome && <p className="hidden text-sm font-semibold text-ink lg:block">{titleFor(pathname)}</p>}

          <Link
            href="/settings/models"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-brand-500" : "bg-amber-500")} />
            <span className="hidden sm:inline">{aiConfigured ? "OpenAI configured" : "AI not configured"}</span>
            <span className="sm:hidden">AI</span>
          </Link>
          <ThemeToggle />
        </header>

        <main className={cn("flex w-full flex-1 flex-col", !isHome && "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}>
          {children}
        </main>
      </div>
    </div>
  );
}
