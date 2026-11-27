"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { HomeModeProvider, useHomeMode } from "./HomeMode";
import SearchDialog from "./SearchDialog";
import Sidebar, { Logo } from "./Sidebar";
import SettingsDialog, { settingsHref } from "@/components/settings/SettingsDialog";
import ThemeToggle from "./ThemeToggle";
import { titleFor } from "./navigation";

const COLLAPSE_KEY = "atlas.sidebarCollapsed";
const WIDTH_KEY = "atlas.sidebarWidth";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 208;
const MAX_WIDTH = 420;
/** Dragging the edge narrower than this closes the sidebar (like Claude). */
const CLOSE_BELOW = 150;
const clampWidth = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));

/**
 * ChatGPT/Claude-style frame: navy sidebar on desktop that is resized by
 * dragging its right edge (drag it far enough left to close it, drag from the
 * screen edge or press Ctrl/Cmd+B to bring it back), slide-out drawer on
 * mobile/tablet, slim header above the page. Page content (server components)
 * is passed through as children. Also holds the Home Chat / Agent mode.
 */
export default function AppShell(props) {
  return (
    <HomeModeProvider initialChats={props.recentChats}>
      <Shell {...props} />
    </HomeModeProvider>
  );
}

function Shell({ aiConfigured = false, recentAgents = [], user = null, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(DEFAULT_WIDTH);
  const pathname = usePathname();
  const isHome = pathname === "/" || pathname.startsWith("/chat/");

  // Remember the desktop collapse choice (per browser only; safe if storage is blocked).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      if (saved) {
        widthRef.current = clampWidth(saved);
        setWidth(widthRef.current);
      }
    } catch {}
  }, []);
  const saveWidth = (w) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(w));
    } catch {}
  };
  const setCollapsedSaved = (v) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {}
  };

  // Ctrl/Cmd+B opens or closes the desktop sidebar.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => {
          try {
            localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
          } catch {}
          return !c;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Drag the sidebar edge: follow the pointer, close it when dragged far enough left. */
  function startResize(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = collapsed ? 0 : widthRef.current;
    let closed = collapsed;
    let moved = false;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev) => {
      const w = startW + ev.clientX - startX;
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (w < CLOSE_BELOW) {
        if (!closed) setCollapsed(true);
        closed = true;
        // Reopening brings back the width it had before this drag.
        if (startW) {
          widthRef.current = startW;
          setWidth(startW);
        }
      } else {
        if (closed) setCollapsed(false);
        closed = false;
        widthRef.current = clampWidth(w);
        setWidth(widthRef.current);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      // A plain click on the edge (no drag) toggles the sidebar, like Claude.
      if (!moved) closed = !collapsed;
      setCollapsedSaved(closed);
      if (!closed) saveWidth(widthRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function onHandleKey(e) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const w = clampWidth(widthRef.current + (e.key === "ArrowRight" ? 16 : -16));
      widthRef.current = w;
      setWidth(w);
      saveWidth(w);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCollapsedSaved(!collapsed);
    }
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen" style={{ "--sbw": `${width}px` }}>
      {/* Desktop sidebar: drag the right edge to resize or close */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-[var(--sbw)] lg:block",
          !dragging && "transition-transform duration-200",
          collapsed && "-translate-x-full",
        )}
        aria-hidden={collapsed || undefined}
        inert={collapsed || undefined}
      >
        <Sidebar aiConfigured={aiConfigured} recentAgents={recentAgents} user={user} />
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={collapsed ? "Open sidebar (drag or click)" : "Resize sidebar (drag), click to close"}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={collapsed ? 0 : width}
        tabIndex={0}
        title={collapsed ? "Drag or click to open the sidebar (Ctrl+B)" : "Drag to resize, drag left or click to close (Ctrl+B)"}
        onPointerDown={startResize}
        onKeyDown={onHandleKey}
        style={{ left: collapsed ? 0 : "calc(var(--sbw) - 4px)" }}
        className={cn("group fixed inset-y-0 z-40 hidden w-2 cursor-col-resize lg:block", !dragging && "transition-[left] duration-200")}
      >
        <span
          className={cn(
            "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors",
            dragging ? "bg-brand-500" : "bg-transparent group-hover:bg-brand-500/70 group-focus-visible:bg-brand-500",
          )}
        />
      </div>

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
            user={user}
            onNavigate={() => setDrawerOpen(false)}
          />
        </aside>
      </div>

      <div
        className={cn(
          "flex min-h-screen flex-col",
          !dragging && "transition-[padding] duration-200",
          !collapsed && "lg:pl-[var(--sbw)]",
        )}
      >
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
                title="Open sidebar (Ctrl+B)"
              >
                <Icon name="panel" />
              </button>
              <NewLink
                className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink lg:block"
                aria-label="New"
                title="New chat or agent"
              >
                <Icon name="plus" />
              </NewLink>
            </>
          )}
          <div className={cn("lg:hidden", isHome && "hidden")}>
            <Logo onDark={false} className="h-8" />
          </div>
          {!isHome && <p className="hidden text-sm font-semibold text-ink lg:block">{titleFor(pathname)}</p>}

          <a
            href={settingsHref("settings")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-brand-500" : "bg-amber-500")} />
            <span className="hidden sm:inline">{aiConfigured ? "OpenAI configured" : "AI not configured"}</span>
            <span className="sm:hidden">AI</span>
          </a>
          <ThemeToggle />
        </header>

        <main className={cn("flex w-full flex-1 flex-col", !isHome && "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8")}>
          {children}
        </main>
        <SettingsDialog isAdmin={user?.role === "admin"} />
        <SearchDialog />
      </div>
    </div>
  );
}

/** Link to Home that also clears the current chat (Home may already be open). */
function NewLink(props) {
  const { startNewChat } = useHomeMode();
  return <Link href="/" onClick={startNewChat} {...props} />;
}
