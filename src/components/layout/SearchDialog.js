"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/agents/AgentStatus";
import { fmtDateTime } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/States";
import { useHomeMode } from "./HomeMode";

export const OPEN_SEARCH_EVENT = "atlas:open-search";
/** Opens the search popup from anywhere (the sidebar's Search item uses this). */
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

const TYPES = [
  { id: "all", label: "All" },
  { id: "chats", label: "Chats" },
  { id: "agents", label: "Agents" },
];

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function Kbd({ children }) {
  return <kbd className="rounded border border-slate-200 px-1.5 py-0.5 font-sans text-[10px] text-slate-500">{children}</kbd>;
}

/**
 * Claude-style search popup (Ctrl/⌘+K or Search in the sidebar): find your
 * chats (by title or anything said in them) and agents (by name or
 * description), filter by type, move with ↑ ↓, open with Enter, close with Esc.
 */
export default function SearchDialog() {
  const router = useRouter();
  const { setMode, startNewChat } = useHomeMode();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [result, setResult] = useState({ chats: [], agents: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const show = useCallback(() => {
    setQ("");
    setType("all");
    setActive(0);
    setOpen(true);
  }, []);

  // Ctrl/⌘+K anywhere, or the sidebar's Search item.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, [show]);

  // Search as you type (short pause so every key press isn't a request).
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?${new URLSearchParams({ q, type })}`, { signal: ctl.signal, cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setResult({ chats: body.chats || [], agents: body.agents || [] });
          setActive(0);
        }
      } catch {
        // aborted or offline: keep the previous results
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, q, type]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => setOpen(false);
  const go = (href, before) => {
    before?.();
    setOpen(false);
    router.push(href);
  };

  // One flat list of everything shown, so ↑ ↓ and Enter walk across sections.
  const sections = [];
  if (type !== "agents" && result.chats.length)
    sections.push({
      title: q.trim() ? "Chats" : "Recent chats",
      items: result.chats.map((c) => ({
        key: `c:${c.id}`,
        icon: "chat",
        label: c.title,
        detail: c.snippet,
        meta: fmtDateTime(c.updatedAt),
        run: () => go(`/chat/${c.id}`, () => setMode("ask")),
      })),
    });
  if (type !== "chats" && result.agents.length)
    sections.push({
      title: q.trim() ? "Agents" : "Recent agents",
      items: result.agents.map((a) => ({
        key: `a:${a.id}`,
        icon: "bot",
        label: a.name,
        detail: a.ownerEmail ? `by ${a.ownerEmail}` : a.description,
        badge: <StatusBadge status={a.status} />,
        run: () => go(`/agents/${a.id}`),
      })),
    });
  sections.push({
    title: "Actions",
    items: [
      {
        key: "x:chat",
        icon: "chatSearch",
        label: "New chat",
        run: () =>
          go("/", () => {
            setMode("ask");
            startNewChat();
          }),
      },
      {
        key: "x:agent",
        icon: "code",
        label: "New agent",
        run: () =>
          go("/", () => {
            setMode("agent");
            startNewChat();
          }),
      },
    ],
  });
  const flat = sections.flatMap((s) => s.items);
  const current = Math.min(active, flat.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[current]?.run();
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.altKey) {
      e.preventDefault();
      const i = TYPES.findIndex((t) => t.id === type);
      setType(TYPES[(i + (e.key === "ArrowRight" ? 1 : TYPES.length - 1)) % TYPES.length].id);
    }
  };

  if (!open) return null;
  let n = -1;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-3 pt-[12vh] sm:p-6 sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Icon name="search" className="size-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats and agents…"
            aria-label="Search chats and agents"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Spinner className="size-4" />}
          <button type="button" onClick={close} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label="Close search">
            <Icon name="close" className="size-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-3 py-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setType(t.id);
                inputRef.current?.focus();
              }}
              aria-pressed={type === t.id}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                type === t.id ? "bg-slate-100 font-medium text-ink" : "text-slate-500 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div ref={listRef} id="search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {q.trim() && !loading && sections.length === 1 && (
            <p className="px-3 py-4 text-sm text-slate-500">Nothing found for “{q.trim()}”.</p>
          )}
          {sections.map((s) => (
            <div key={s.title} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-slate-500">{s.title}</p>
              {s.items.map((it) => {
                n += 1;
                const i = n;
                const on = i === current;
                return (
                  <button
                    key={it.key}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-active={on}
                    onMouseMove={() => setActive(i)}
                    onClick={it.run}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", on ? "bg-slate-100" : "hover:bg-slate-50")}
                  >
                    <Icon name={it.icon} className="size-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{it.label}</span>
                      {it.detail && <span className="block truncate text-xs text-slate-500">{it.detail}</span>}
                    </span>
                    {it.badge}
                    {it.meta && <span className="shrink-0 text-xs text-slate-400">{it.meta}</span>}
                    {on && <Icon name="arrowUp" className="size-3.5 shrink-0 rotate-90 text-slate-400" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span className="flex items-center gap-1.5">
            Close <Kbd>Esc</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            Move <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            Open <Kbd>Enter</Kbd>
          </span>
          <span className="flex items-center gap-1.5">
            Change type <Kbd>Alt</Kbd>
            <Kbd>← →</Kbd>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            Open search <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
