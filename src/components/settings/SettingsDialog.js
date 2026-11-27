"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AccountView from "@/components/settings/panels/AccountView";
import AgentsView from "@/components/settings/panels/AgentsView";
import EmailView from "@/components/settings/panels/EmailView";
import ExecutionView from "@/components/settings/panels/ExecutionView";
import PluginsView from "@/components/settings/panels/PluginsView";
import SettingsView from "@/components/settings/panels/SettingsView";
import UsageView from "@/components/settings/panels/UsageView";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { Alert, Spinner } from "@/components/ui/States";

/**
 * Tabs of the Settings popup; the URL hash says which one is open: #settings/<id>.
 * All Agents is a popup of its own (#agents), with no Settings tabs around it.
 */
export const SETTINGS_TABS = [
  { id: "account", label: "Account", icon: "user", adminOnly: true },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "email", label: "Email sender", icon: "mail" },
  { id: "usage", label: "Usage", icon: "chart" },
  { id: "execution", label: "Execution", icon: "history" },
  { id: "plugins", label: "Plugins", icon: "plug", divider: true },
];
const OWN_POPUPS = { agents: "All Agents" };

export const settingsHref = (tab) => (OWN_POPUPS[tab] ? `#${tab}` : `#settings/${tab}`);
const POPUP_LINK = 'a[href*="#settings/"], a[href$="#agents"]';

const VIEWS = { account: AccountView, settings: SettingsView, email: EmailView, usage: UsageView, execution: ExecutionView, plugins: PluginsView, agents: AgentsView };

/** "#settings/usage" → "usage", "#agents" → "agents"; anything else → null. */
function tabFromHash(hash, isAdmin) {
  if (hash === "#agents") return "agents";
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
  const pathname = usePathname();

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
    // Re-check whenever the page changes, e.g. after opening an agent from the
    // All Agents tab: the new URL has no hash, so the popup closes.
  }, [isAdmin, pathname]);

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

  // Any link to "#settings/<tab>", anywhere in the app, opens (or switches) the
  // popup here. A Next.js <Link> would otherwise change the hash silently or
  // append a second one.
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest?.(POPUP_LINK);
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const href = a.getAttribute("href");
      const next = tabFromHash(href.slice(href.indexOf("#")), isAdmin);
      if (!next) return;
      e.preventDefault();
      // No stopPropagation: the link's own onClick (e.g. closing the account menu) still runs.
      if (tab) {
        window.history.replaceState(window.history.state, "", settingsHref(next)); // switch tabs
      } else {
        window.history.pushState(window.history.state, "", settingsHref(next)); // open: Back closes it
        openedHere.current = true;
      }
      setTab(next);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [tab, isAdmin]);

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
  const ownTitle = OWN_POPUPS[tab]; // a popup of its own: its title, no Settings tabs

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
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
            {ownTitle || "Settings"}
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink"
            aria-label={`Close ${(ownTitle || "settings").toLowerCase()}`}
            title="Close (Esc)"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {!ownTitle && (
            <nav aria-label="Settings sections" className="shrink-0 overflow-x-auto border-b border-slate-200 p-2 sm:w-52 sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
              <ul className="flex gap-1 sm:flex-col">
                {SETTINGS_TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
                  <li key={t.id} className={t.divider ? "sm:mt-2 sm:border-t sm:border-slate-200 sm:pt-2" : undefined}>
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
          )}
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
