"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
 * "Connectors" button for the prompt box: pick which connected ATLAS projects
 * to chat with or build an agent from. Nothing selected = all connected ones.
 * Controlled: `value` = selected project ids, `onChange(ids)`.
 */
export default function ConnectorPicker({ value = [], onChange, disabled = false, remember = true, placement = "up" }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/connectors/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load connectors"))))
      .then((d) => alive && setProjects((d.projects || []).filter((p) => p.usable)))
      .catch((e) => alive && (setError(e.message), setProjects([])));
    return () => {
      alive = false;
    };
  }, []);

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
        {selected.length ? "Connectors" : "All connectors"}
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
          aria-label="Choose connectors"
          className={cn(
            "absolute left-0 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-surface p-2 shadow-lg",
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Use data from</p>
          {projects === null && <p className="px-2 py-2 text-sm text-slate-500">Loading…</p>}
          {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}
          {projects?.length === 0 && !error && <p className="px-2 py-2 text-sm text-slate-500">No connectors are connected yet.</p>}
          {projects?.length > 0 && (
            <ul className="max-h-60 overflow-y-auto">
              <li>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="accent-brand-500" checked={selected.length === 0} onChange={() => set([])} />
                  <span className="text-ink">All connected</span>
                </label>
              </li>
              {projects.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="accent-brand-500" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                    {p.delegated && <span className="text-[10px] text-slate-400">as you</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/connectors"
            className={cn("mt-1 flex items-center gap-1.5 border-t border-slate-100 px-2 pt-2 pb-1 text-xs font-medium text-brand-600 hover:text-brand-700")}
          >
            <Icon name="plus" className="size-3.5" /> Connect a new connector
          </Link>
        </div>
      )}
    </div>
  );
}
