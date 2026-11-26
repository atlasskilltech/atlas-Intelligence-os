"use client";

import { useEffect, useRef, useState } from "react";
import { settingsHref } from "@/components/settings/SettingsDialog";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

// Both open the Settings popup on top of the current page (Account is a tab inside it).
const MENU_ITEMS = [
  { tab: "settings", label: "Settings", icon: "settings" },
  { tab: "usage", label: "Usage", icon: "chart" },
];

const itemClass = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-white/85 hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:outline-none";

/**
 * Claude-style account menu: the profile row at the bottom of the sidebar opens
 * a small menu with Settings, Usage and Log out. Settings and Usage open the
 * Settings popup (#settings/<tab>) over the current page.
 */
export default function UserMenu({ user, aiConfigured, onNavigate }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={rootRef} className="relative mt-3">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute inset-x-0 bottom-full z-50 mb-2 rounded-xl border border-white/10 bg-navy-900 p-1.5 shadow-2xl"
        >
          {user?.email && <p className="truncate px-2.5 pb-1.5 pt-1 text-xs text-white/50">{user.email}</p>}
          {MENU_ITEMS.map((item) => (
            <a key={item.tab} href={settingsHref(item.tab)} role="menuitem" onClick={go} className={itemClass}>
              <Icon name={item.icon} className="size-4 shrink-0 opacity-80" />
              {item.label}
            </a>
          ))}
          {user && !user.local && (
            <>
              <div className="my-1.5 border-t border-white/10" />
              <form action="/api/auth/logout" method="post">
                <button type="submit" role="menuitem" className={itemClass}>
                  <Icon name="logout" className="size-4 shrink-0 opacity-80" />
                  Log out
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/8",
          open && "bg-white/8",
        )}
      >
        {user?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80">
            <Icon name="user" className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium" title={user?.email || undefined}>
            {user?.name || "ATLAS Employee"}
            {user?.role === "admin" && !user?.local && <span className="ml-1.5 text-[10px] font-semibold uppercase text-brand-400">Admin</span>}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[11px] whitespace-nowrap text-white/50">
            <span className={cn("size-1.5 rounded-full", aiConfigured ? "bg-brand-400" : "bg-amber-400")} />
            {aiConfigured ? "OpenAI configured" : "AI not configured"}
          </span>
        </span>
        <Icon name="chevronsUpDown" className="size-4 shrink-0 text-white/40" />
      </button>
    </div>
  );
}
