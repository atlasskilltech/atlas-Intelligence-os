"use client";

import Link from "next/link";
import { useState } from "react";
import { ProjectAvatar, RowMenu, api, pluginSummary } from "@/components/connectors/ProjectsSection";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { Alert } from "@/components/ui/States";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "off", label: "Not active" },
];

/** A plugin agents can use right now. */
const isActive = (p) => p.enabled && p.status === "connected";

function Row({ p, isAdmin, busy, onToggle }) {
  return (
    <li className={`group relative flex items-center gap-3 py-3 ${!p.enabled ? "opacity-60" : ""}`}>
      <ProjectAvatar name={p.name} baseUrl={p.baseUrl} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Link href={`/connectors/projects/${p.id}`} className="truncate after:absolute after:inset-0 group-hover:text-brand-600">
            {p.name}
          </Link>
          {isActive(p) && (
            <span title="Connected" className="shrink-0">
              <Icon name="verified" className="size-4 text-slate-400" />
              <span className="sr-only">Connected</span>
            </span>
          )}
          {!p.enabled && <Badge>Disabled</Badge>}
          {p.enabled && p.status !== "connected" && <Badge tone="danger">Needs attention</Badge>}
        </p>
        <p className="truncate text-xs text-slate-500">{pluginSummary(p)}</p>
      </div>
      <div className="relative z-10 flex items-center gap-2">
        {isAdmin && !p.enabled && (
          <button
            type="button"
            onClick={() => onToggle(p)}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-200 disabled:opacity-60"
          >
            Enable
          </button>
        )}
        <RowMenu p={p} isAdmin={isAdmin} busy={busy} onToggle={onToggle} />
      </div>
    </li>
  );
}

/**
 * Plugins tab of the Settings popup, like Claude's: filter, the plugins agents
 * can use ("Active") and the rest ("Not active"), with "Browse plugins" to the
 * full Plugins page (where admins add new ones). Data: /api/settings/panel/plugins.
 */
export default function PluginsView({ projects: initial = [], isAdmin, canStoreKeys }) {
  const [projects, setProjects] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function toggle(p) {
    setBusyId(p.id);
    setError(null);
    try {
      const data = await api(`/api/connectors/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ enabled: !p.enabled }) });
      setProjects((list) => list.map((x) => (x.id === p.id ? data.project : x)));
    } catch (err) {
      setError(`${p.name}: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const matches = projects.filter((p) => !q || `${p.name} ${p.baseUrl} ${p.manifest.key.access || ""}`.toLowerCase().includes(q));
  const groups = [
    { id: "active", title: "Active", items: matches.filter(isActive) },
    { id: "off", title: "Not active", items: matches.filter((p) => !isActive(p)) },
  ].filter((g) => (filter === "all" || filter === g.id) && g.items.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Filter your plugins</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter your plugins"
            className="h-9 w-full rounded-lg border border-slate-200 bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg border border-slate-200 bg-surface p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                filter === f.id ? "bg-slate-100 font-medium text-ink" : "text-slate-500 hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!canStoreKeys && isAdmin && (
        <Alert tone="warning" className="mt-4" title="Keys can't be saved yet">
          Set <code className="font-mono">CONNECTOR_ENCRYPTION_KEY</code> on the server and restart the app.
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mt-4" title="Couldn't change the plugin">
          {error}
        </Alert>
      )}

      {projects.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No plugins yet.</p>
      ) : groups.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No plugins match.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="mt-6">
            <h2 className="text-sm font-semibold text-ink">{g.title}</h2>
            <ul className="mt-1 divide-y divide-slate-200">
              {g.items.map((p) => (
                <Row key={p.id} p={p} isAdmin={isAdmin} busy={busyId === p.id} onToggle={toggle} />
              ))}
            </ul>
          </section>
        ))
      )}

      <Link href="/connectors" className="mt-6 inline-block text-sm font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
        Browse plugins{isAdmin ? " and add new ones" : ""}
      </Link>
    </>
  );
}
