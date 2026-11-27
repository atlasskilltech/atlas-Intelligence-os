"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { Alert, EmptyState, Spinner } from "@/components/ui/States";
import { pluginLogo } from "./pluginLogos";

export async function api(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed."), { fields: data?.error?.fields });
  return data;
}

/** Status badge shared by the card and the detail page. */
export function ProjectStatus({ project }) {
  if (!project.enabled) return <Badge>Disabled</Badge>;
  if (project.status === "connected")
    return (
      <Badge tone="success">
        <Icon name="check" className="size-3" /> Connected
      </Badge>
    );
  return <Badge tone="danger">Needs attention</Badge>;
}

/** The plugin's logo (see pluginLogos.js); a placeholder until its own logo is added. */
export function ProjectAvatar({ name, baseUrl = "", className = "size-11" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static logo
    <img
      src={pluginLogo({ name, baseUrl })}
      alt=""
      className={`shrink-0 rounded-xl object-cover ring-1 ring-slate-200 ${className}`}
    />
  );
}

export const counts = (p) => {
  const read = p.manifest.actions.filter((a) => a.risk === "read").length;
  return { read, write: p.manifest.actions.length - read };
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "off", label: "Disabled" },
];

/** One line under the plugin's name: type, maker and what its key allows. */
function pluginSummary(p) {
  const c = counts(p);
  const parts = ["Connector", "By ATLAS", p.manifest.key.access || "Custom access"];
  if (c.write > 0) parts.push(`${c.write} change data`);
  return parts.join(" · ");
}

/** The "···" menu on a plugin row: details, and enable / disable for admins. */
function RowMenu({ p, isAdmin, busy, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${p.name}`}
        className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"
      >
        {busy ? <Spinner className="size-4" /> : <Icon name="more" className="size-5" strokeWidth={3} />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-surface p-1.5 shadow-xl">
          <Link href={`/connectors/projects/${p.id}`} role="menuitem" className={item}>
            <Icon name="search" className="size-4 text-slate-500" /> View details
          </Link>
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onToggle(p);
              }}
              className={`${item} ${p.enabled ? "hover:text-red-600" : ""}`}
            >
              <Icon name={p.enabled ? "pause" : "play"} className="size-4 text-slate-500" />
              {p.enabled ? "Disable (agents can't use it)" : "Enable for agents"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Plugins page, in the style of Claude's plugins page: search, filter, Add,
 * and "Your plugins" as a list. Each plugin is an ATLAS app connected with a key
 * from that app; click one to see exactly what its key allows.
 */
export default function ProjectsSection({ initialProjects, isAdmin, canStoreKeys, notice = null }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toggleError, setToggleError] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  async function toggleEnabled(p) {
    setBusyId(p.id);
    setToggleError(null);
    try {
      const data = await api(`/api/connectors/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ enabled: !p.enabled }) });
      setProjects((list) => list.map((x) => (x.id === p.id ? data.project : x)).sort((a, b) => a.name.localeCompare(b.name)));
      router.refresh();
    } catch (err) {
      setToggleError(`${p.name}: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = projects.filter(
    (p) =>
      (filter === "all" || (filter === "active" ? p.enabled : !p.enabled)) &&
      (!q || `${p.name} ${p.baseUrl} ${p.manifest.key.access || ""}`.toLowerCase().includes(q)),
  );

  return (
    <section aria-labelledby="plugins-title">
      <h1 id="plugins-title" className="text-2xl font-semibold tracking-tight text-ink">
        Plugins
      </h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60">
          <span className="sr-only">Search plugins</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
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
        {isAdmin && (
          <Button onClick={() => setAdding(true)} disabled={adding} className="h-9">
            <Icon name="plus" className="size-4" /> Add
          </Button>
        )}
      </div>

      {notice && <div className="mt-4">{notice}</div>}

      {!canStoreKeys && (
        <Alert tone="warning" className="mt-4" title="Keys can't be saved yet">
          Set <code className="font-mono">CONNECTOR_ENCRYPTION_KEY</code> on the server (for example the output of{" "}
          <code className="font-mono">openssl rand -base64 32</code>) and restart the app. Plugin keys are stored encrypted with it.
        </Alert>
      )}

      {adding && (
        <div className="mt-6">
          <ConnectForm
            onCancel={() => setAdding(false)}
            onConnected={(p) => {
              setProjects((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-ink">Your plugins</h2>
        <span className="text-sm text-slate-500">
          {shown.length === projects.length ? `${projects.length}` : `${shown.length} of ${projects.length}`}
        </span>
      </div>

      {toggleError && (
        <Alert tone="error" className="mt-3" title="Couldn't change the plugin">
          {toggleError}
        </Alert>
      )}

      {projects.length === 0 && !adding ? (
        <EmptyState
          className="mt-3"
          icon="plug"
          title="No plugins yet"
          description="In the other ATLAS app, create a key for IntelligenceOS and choose what it may access. Then add it here."
          action={
            isAdmin && (
              <Button onClick={() => setAdding(true)}>
                <Icon name="plus" className="size-4" /> Add plugin
              </Button>
            )
          }
        />
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No plugins match.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
          {shown.map((p) => {
            const busy = busyId === p.id;
            const problem = p.enabled && p.status !== "connected";
            return (
              <li key={p.id} className={`group relative flex items-center gap-3 py-3 ${!p.enabled ? "opacity-60" : ""}`}>
                <ProjectAvatar name={p.name} baseUrl={p.baseUrl} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {/* The name is the row's link: the whole row is clickable. */}
                    <Link href={`/connectors/projects/${p.id}`} className="truncate after:absolute after:inset-0 group-hover:text-brand-600">
                      {p.name}
                    </Link>
                    {p.enabled && p.status === "connected" && (
                      <span title="Connected" className="shrink-0">
                        <Icon name="verified" className="size-4 text-slate-400" />
                        <span className="sr-only">Connected</span>
                      </span>
                    )}
                    {!p.enabled && <Badge>Disabled</Badge>}
                    {problem && <Badge tone="danger">Needs attention</Badge>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{pluginSummary(p)}</p>
                  {problem && p.lastError && <p className="mt-0.5 truncate text-xs text-red-600">{p.lastError}</p>}
                </div>
                <div className="relative z-10">
                  <RowMenu p={p} isAdmin={isAdmin} busy={busy} onToggle={toggleEnabled} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Two-way ATLAS portals that speak the IntelligenceOS connector contract
// (`/api/intos/v1`). Picking one fills the name and URL; the admin edits the
// host if theirs differs and pastes the key generated on that portal's
// IntelligenceOS Connector settings page.
export const PROJECT_PRESETS = [
  {
    id: "career_services",
    label: "ATLAS Career Services",
    name: "ATLAS Career Services",
    baseUrl: "https://uat-careerconnect.atlasskilltech.app/api/intos/v1",
    keyHint: "Career Services → Admin → Settings → IntelligenceOS Connector → Generate API key.",
    delegated: false,
  },
  {
    id: "crm",
    label: "ATLAS CRM",
    name: "ATLAS CRM",
    baseUrl: "https://uat-crm.atlasskilltech.app/api/intos/v1",
    keyHint: "CRM → Settings → IntelligenceOS Connector → Generate API key.",
    delegated: false,
  },
];

function ConnectForm({ onCancel, onConnected }) {
  const [form, setForm] = useState({ name: "", baseUrl: "https://", key: "", delegated: false });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ state: "idle" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [preset, setPreset] = useState(null);
  const pick = (pr) => {
    setPreset(pr);
    setErrors({});
    setForm((f) => ({ ...f, name: pr.name, baseUrl: pr.baseUrl, delegated: pr.delegated }));
  };

  async function submit(e) {
    e.preventDefault();
    setState({ state: "saving" });
    setErrors({});
    try {
      const data = await api("/api/connectors/projects", { method: "POST", body: JSON.stringify(form) });
      onConnected(data.project);
    } catch (err) {
      setErrors(err.fields || {});
      setState({ state: "error", message: err.message });
    }
  }

  return (
    <Card className="mb-6 ring-2 ring-brand-500/20">
      <form onSubmit={submit} noValidate>
        <CardHeader title="Connect a project" description="IntelligenceOS checks the key with the project and shows what it allows." />
        <CardBody className="space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500">ATLAS portals with two-way sync</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PROJECT_PRESETS.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => pick(pr)}
                  aria-pressed={preset?.id === pr.id}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    preset?.id === pr.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-brand-300"
                  }`}
                >
                  {pr.label}
                </button>
              ))}
            </div>
            {preset && (
              <p className="mt-1.5 text-xs text-slate-500">
                Get the key from {preset.keyHint} Change the URL if your {preset.label} lives elsewhere. Its agents will appear on the project page and stay in sync.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" htmlFor="p-name" error={errors.name}>
              <Input id="p-name" value={form.name} placeholder="ATLAS CRM" invalid={!!errors.name} onChange={set("name")} />
            </Field>
            <Field label="Project URL" htmlFor="p-url" error={errors.baseUrl} hint="The project's Agent API address. https:// required (http:// only for internal hosts allowed on the server).">
              <Input
                id="p-url"
                value={form.baseUrl}
                className="font-mono"
                placeholder="https://crm.atlasuniversity.edu.in/agent-api"
                invalid={!!errors.baseUrl}
                onChange={set("baseUrl")}
              />
            </Field>
          </div>
          <Field label="Key from the project" htmlFor="p-key" error={errors.key} hint="Stored encrypted. Only its last 4 characters are shown again.">
            <Input
              id="p-key"
              type="password"
              autoComplete="off"
              value={form.key}
              className="font-mono"
              invalid={!!errors.key}
              onChange={set("key")}
            />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand-500"
              checked={form.delegated}
              onChange={(e) => setForm((f) => ({ ...f, delegated: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-ink">This project acts as the signed-in user</span>
              <span className="block text-xs text-slate-500">
                Every call sends the agent owner&apos;s email, and the project allows only what that person may do there. Use it
                when the project supports it (for example ATLAS Procurement). Emails must be the same in both apps.
              </span>
            </span>
          </label>
          {state.state === "error" && (
            <Alert tone="error" title="Not connected">
              {state.message}
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={state.state === "saving"}>
              Cancel
            </Button>
            <Button type="submit" disabled={state.state === "saving"}>
              {state.state === "saving" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="plug" className="size-4" />}
              {state.state === "saving" ? "Checking key…" : "Connect"}
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}
