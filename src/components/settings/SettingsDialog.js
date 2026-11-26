"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AccountView from "@/components/settings/panels/AccountView";
import EmailView from "@/components/settings/panels/EmailView";
import SettingsView from "@/components/settings/panels/SettingsView";
import UsageView from "@/components/settings/panels/UsageView";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { Alert, Spinner } from "@/components/ui/States";

/** Tabs of the Settings popup. The URL hash says which one is open: #settings/<id>. */
export const SETTINGS_TABS = [
  { id: "account", label: "Account", icon: "user", adminOnly: true },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "email", label: "Email sender", icon: "mail" },
  { id: "usage", label: "Usage", icon: "chart" },
];

export const settingsHref = (tab) => `#settings/${tab}`;

const VIEWS = { account: AccountView, settings: SettingsView, email: EmailView, usage: UsageView };

/** "#settings/usage" → "usage"; anything else → null. */
function tabFromHash(hash, isAdmin) {
  const m = /^#settings\/([a-z]+)$/.exec(hash || "");
  if (!m) return null;
  const tab = SETTINGS_TABS.find((t) => t.id === m[1]);
  if (!tab) return "settings";
  return tab.adminOnly && !isAdmin ? "settings" : tab.id;
}

/**
 * Claude-style Settings popup. It is driven by the URL hash (like
 * claude.ai/…#settings/claude-code), so the page behind it never changes:
 * opening adds "#settings/<tab>", closing removes it. Back, Escape, the X and
 * a click outside close it; a refresh keeps it open over the same page.
 */
export default function SettingsDialog({ isAdmin = false }) {
  const [tab, setTab] = useState(null);
  const [data, setData] = useState({}); // tab → { loading, error, value }
  const openedHere = useRef(false); // opened by a click on this page (so Back can close it)
  const panelRef = useRef(null);

  // Follow the hash: on load, on link clicks and on Back / Forward.
  useEffect(() => {
    const sync = (e) => {
      const next = tabFromHash(window.location.hash, isAdmin);
      if (e && next) openedHere.current = true;
      setTab(next);
    };
    sync();
    // Next.js <Link> changes the hash with pushState (no "hashchange"), so also follow popstate.
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [isAdmin]);

  const load = useCallback(async (id) => {
    setData((d) => ({ ...d, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/settings/panel/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || "Couldn't load this section.");
      setData((d) => ({ ...d, [id]: { value: body } }));
    } catch (err) {
      setData((d) => ({ ...d, [id]: { error: err.message } }));
    }
  }, []);

  // Fresh data each time a tab is shown.
  useEffect(() => {
    if (tab) load(tab);
  }, [tab, load]);

  const close = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back(); // removes the hash entry the click added
    } else {
      // Opened by a refresh or a link: drop the hash without leaving the page.
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setTab(null);
    }
  }, []);

  const pick = (id) => {
    // Switching tabs replaces the hash, so Back still closes the popup in one step.
    window.history.replaceState(window.history.state, "", settingsHref(id));
    setTab(id);
  };

  // Links inside a tab that point at another tab (e.g. "Go to Settings") switch
  // tabs here; a Next.js <Link> would otherwise append a second hash.
  const onClickCapture = (e) => {
    const a = e.target.closest?.('a[href*="#settings/"]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const next = tabFromHash(a.getAttribute("href").slice(a.getAttribute("href").indexOf("#")), isAdmin);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    pick(next);
  };

  useEffect(() => {
    if (!tab) return;
    panelRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [tab, close]);

  if (!tab) return null;
  const state = data[tab] || { loading: true };
  const View = VIEWS[tab];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" onClickCapture={onClickCapture}>
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        className="relative flex h-[min(88vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl focus:outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <h2 id="settings-dialog-title" className="text-[15px] font-semibold text-ink">
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
          <nav aria-label="Settings sections" className="shrink-0 overflow-x-auto border-b border-slate-200 p-2 sm:w-52 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
            <ul className="flex gap-1 sm:flex-col">
              {SETTINGS_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => pick(t.id)}
                    ref={t.id === tab ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
                    aria-current={t.id === tab ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      t.id === tab ? "bg-slate-100 font-semibold text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink",
                    )}
                  >
                    <Icon name={t.icon} className="size-4 shrink-0" />
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="@container min-h-0 min-w-0 flex-1 overflow-y-auto p-5 sm:px-8 sm:py-6">
            {state.loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner /> Loading…
              </div>
            ) : state.error ? (
              <Alert tone="error" title="Couldn't load this section">
                {state.error}{" "}
                <button type="button" onClick={() => load(tab)} className="font-medium underline">
                  Try again
                </button>
              </Alert>
            ) : (
              <View key={tab} {...state.value} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
