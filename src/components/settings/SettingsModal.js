"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { USER_MENU_ITEMS } from "@/components/layout/UserMenu";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

/**
 * Claude-style Settings popup: tabs on the left (Settings, Usage), content on
 * the right. Opened from the account menu; the URL changes, so refresh shows the
 * full page and Back / Escape / the X / a click outside close it.
 */
export default function SettingsModal({ active, children }) {
  const router = useRouter();
  const panelRef = useRef(null);
  const close = () => router.back();

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && router.back();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="relative flex h-[min(85vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl focus:outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <h2 id="settings-modal-title" className="text-[15px] font-semibold text-ink">
            Settings
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink"
            aria-label="Close settings"
            title="Close (Esc)"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Settings sections" className="shrink-0 border-b border-slate-200 p-2 sm:w-52 sm:border-b-0 sm:border-r sm:p-3">
            <ul className="flex gap-1 sm:flex-col">
              {USER_MENU_ITEMS.map((item) => {
                const on = item.href === active;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      replace
                      scroll={false}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        on ? "bg-slate-100 font-semibold text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
                      )}
                    >
                      <Icon name={item.icon} className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
