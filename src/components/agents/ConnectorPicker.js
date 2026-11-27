"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pluginLogo } from "@/components/connectors/pluginLogos";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

const STORE_KEY = "atlas.selectedConnectors.v1";

/** Remembered connector selection (per browser). */
export function loadSelectedConnectors() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function storeSelected(ids) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {}
}

/**
 * "Plugins" button for the prompt box: pick which connected ATLAS apps to chat
 * with or build an agent from. Nothing selected = all connected ones. The
 * dropdown looks like Claude's repository picker: search, your picks on top
 * (✓, × to remove), then the rest.
 * Controlled: `value` = selected project ids, `onChange(ids)`.
 */
export default function ConnectorPicker({ value = [], onChange, disabled = false, remember = true, placement = "up" }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const box = useRef(null);
  const search = useRef(null);

  const load = useCallback((signal) => {
    return fetch("/api/connectors/projects", { signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load plugins"))))
      .then((d) => setProjects((d.projects || []).filter((p) => p.usable)))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setError(e.message);
        setProjects([]);
      });
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  // On the prompt box, drop remembered selections that are no longer connected.
  // (Not for a saved agent: dropping its last project would silently unlock it to all.)
  useEffect(() => {
    if (!projects || !remember) return;
    const ids = new Set(projects.map((p) => p.id));
    const kept = value.filter((id) => ids.has(id));
    if (kept.length !== value.length) onChange?.(kept);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    search.current?.focus();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const set = (ids) => {
    onChange?.(ids);
    if (remember) storeSelected(ids);
  };
  const toggle = (id) => set(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const byId = new Map((projects || []).map((p) => [p.id, p]));
  const selected = remember ? value.filter((id) => byId.has(id)) : value;
  const nameOf = (id) => byId.get(id)?.name || (projects ? `${id} (not connected)` : id);

  // Picker rows: "All connected", then your picks (✓, removable), a divider, then the rest.
  const q = query.trim().toLowerCase();
  const hit = (p) => !q || p.name.toLowerCase().includes(q);
  const picked = (projects || []).filter((p) => value.includes(p.id) && hit(p));
  const others = (projects || []).filter((p) => !value.includes(p.id) && hit(p));
  const rows = [
    ...(!q || "all connected".includes(q)
      ? [{ key: "all", label: "All connected", checked: selected.length === 0, pick: () => set([]), hint: projects ? `${projects.length}` : "" }]
      : []),
    ...picked.map((p) => ({
      key: p.id,
      id: p.id,
      label: p.name,
      logo: pluginLogo(p),
      checked: true,
      removable: true,
      pick: () => toggle(p.id),
    })),
    ...others.map((p, i) => ({
      key: p.id,
      id: p.id,
      label: p.name,
      logo: pluginLogo(p),
      hint: p.delegated ? "as you" : "",
      checked: false,
      divider: i === 0,
      pick: () => toggle(p.id),
    })),
  ];

  return (
    <div ref={box} className="relative flex min-w-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-500/50 hover:text-brand-700 disabled:opacity-50"
      >
        <Icon name="plug" className="size-3.5" />
        {selected.length ? "Plugins" : "All plugins"}
      </button>
      {selected.map((id) => (
        <span key={id} className="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
          <span className="truncate">{nameOf(id)}</span>
          <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => toggle(id)} className="hover:text-brand-900">
            <Icon name="close" className="size-3" />
          </button>
        </span>
      ))}

      {open && (
        <div
          role="dialog"
          aria-label="Choose plugins"
          className={cn(
            "absolute left-0 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-xl",
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {/* search, like Claude's repository picker */}
          <div className="p-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
              <Icon name="search" className="size-4 shrink-0 text-slate-400" />
              <input
                ref={search}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, Math.min(rows.length - 1, c + (e.key === "ArrowDown" ? 1 : -1))));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    rows[cursor]?.pick();
                  }
                }}
                placeholder="Search plugins…"
                aria-label="Search plugins"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setProjects(null);
                  load();
                }}
                title="Reload plugins"
                aria-label="Reload plugins"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
              >
                <Icon name="refresh" className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto px-2 pb-2" role="listbox" aria-multiselectable="true">
            {projects === null && <p className="px-2 py-2 text-sm text-slate-500">Loading…</p>}
            {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}
            {projects?.length === 0 && !error && <p className="px-2 py-2 text-sm text-slate-500">No plugins are connected yet.</p>}
            {projects?.length > 0 &&
              rows.map((row, i) => (
                <div key={row.key}>
                  {row.divider && <div className="mx-2 my-1.5 border-t border-slate-200" />}
                  <div
                    role="option"
                    aria-selected={row.checked}
                    onMouseMove={() => setCursor(i)}
                    onMouseDown={(e) => e.preventDefault()} // keep typing in the search box
                    onClick={row.pick}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                      i === cursor ? "bg-slate-100" : "hover:bg-slate-50",
                    )}
                  >
                    {row.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small static logo
                      <img src={row.logo} alt="" className="size-5 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
                        <Icon name="plug" className="size-3" />
                      </span>
                    )}
                    <span className={cn("min-w-0 flex-1 truncate", row.checked ? "font-medium text-ink" : "text-slate-700")}>{row.label}</span>
                    {row.hint && <span className="shrink-0 text-[10px] text-slate-400">{row.hint}</span>}
                    {row.removable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.id);
                        }}
                        aria-label={`Remove ${row.label}`}
                        title="Remove"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-ink"
                      >
                        <Icon name="close" className="size-3.5" />
                      </button>
                    )}
                    <Icon name="check" className={cn("size-4 shrink-0 text-brand-600", row.checked ? "opacity-100" : "opacity-0")} />
                  </div>
                </div>
              ))}
            {projects?.length > 0 && rows.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No plugins match “{query}”.</p>}
          </div>

          <Link
            href="/connectors"
            className="flex items-center gap-1.5 border-t border-slate-200 px-4 py-2.5 text-sm font-medium text-brand-600 hover:bg-slate-50 hover:text-brand-700"
          >
            <Icon name="plus" className="size-4" /> Add a plugin
          </Link>
        </div>
      )}
    </div>
  );
}
