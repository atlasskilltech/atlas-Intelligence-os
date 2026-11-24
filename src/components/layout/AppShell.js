"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import Sidebar, { Logo } from "./Sidebar";
import { titleFor } from "./navigation";

/**
 * Dashboard frame: fixed sidebar on desktop (lg+), slide-out drawer on
 * mobile/tablet. Page content (server components) is passed as children.
 */
export default function AppShell({ aiConfigured = false, children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={cn("lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "fixed inset-0 z-40 bg-slate-900/40 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl transition-transform",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
          >
            <Icon name="close" />
          </button>
          <Sidebar onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Icon name="menu" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <p className="hidden text-sm font-medium text-slate-500 lg:block">{titleFor(pathname)}</p>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/settings/models"
              className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 sm:inline-flex"
            >
              <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-emerald-500" : "bg-amber-500")} />
              {aiConfigured ? "OpenAI configured" : "AI provider not configured"}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
