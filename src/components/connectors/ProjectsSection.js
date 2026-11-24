"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { Alert, EmptyState, Spinner } from "@/components/ui/States";

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

export function ProjectAvatar({ name, className = "size-11 text-base" }) {
  const initials = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return <span className={`grid shrink-0 place-items-center rounded-xl bg-navy-800 font-bold text-white ${className}`}>{initials}</span>;
}

export const counts = (p) => {
  const read = p.manifest.actions.filter((a) => a.risk === "read").length;
  return { read, write: p.manifest.actions.length - read };
};

export default function ProjectsSection({ initialProjects, isAdmin, canStoreKeys }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-10" aria-labelledby="projects-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="projects-title" className="text-lg font-bold text-ink">
            ATLAS projects
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Connect an ATLAS app (CRM, ERP, LMS…) with a key created in that app. The key decides what agents may do there.
            Click a project to see exactly what its key allows.
          </p>
        </div>
        {isAdmin && !adding && (
          <Button onClick={() => setAdding(true)}>
            <Icon name="plus" className="size-4" /> Connect project
          </Button>
        )}
      </div>

      {!canStoreKeys && (
        <Alert tone="warning" className="mb-6" title="Keys can't be saved yet">
          Set <code className="font-mono">CONNECTOR_ENCRYPTION_KEY</code> on the server (for example the output of{" "}
          <code className="font-mono">openssl rand -base64 32</code>) and restart the app. Project keys are stored encrypted with it.
        </Alert>
      )}

      {adding && (
        <ConnectForm
          onCancel={() => setAdding(false)}
          onConnected={(p) => {
            setProjects((list) => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      {projects.length === 0 && !adding ? (
        <EmptyState
          icon="plug"
          title="No projects connected yet"
          description="In the other ATLAS app, create a key for IntelligenceOS and choose what it may access. Then connect it here."
          action={
            isAdmin && (
              <Button onClick={() => setAdding(true)}>
                <Icon name="plus" className="size-4" /> Connect project
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const c = counts(p);
            return (
              <Link
                key={p.id}
                href={`/connectors/projects/${p.id}`}
                className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <Card className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-md group-hover:ring-1 group-hover:ring-brand-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <ProjectAvatar name={p.name} />
                    <ProjectStatus project={p} />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-ink">{p.name}</h3>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{p.baseUrl}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{p.manifest.key.access || "Custom access"}</Badge>
                    <Badge>{c.read} read</Badge>
                    {c.write > 0 && <Badge tone="warning">{c.write} change data</Badge>}
                  </div>
                  {p.status !== "connected" && p.lastError && <p className="mt-3 text-xs text-red-600">{p.lastError}</p>}
                  <p className="mt-auto flex items-center justify-between pt-4 text-xs text-slate-500">
                    <span>Key {p.keyHint}</span>
                    <span className="font-medium text-brand-600 group-hover:underline">View access →</span>
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ConnectForm({ onCancel, onConnected }) {
  const [form, setForm] = useState({ name: "", baseUrl: "https://", key: "" });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ state: "idle" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name" htmlFor="p-name" error={errors.name}>
              <Input id="p-name" value={form.name} placeholder="ATLAS CRM" invalid={!!errors.name} onChange={set("name")} />
            </Field>
            <Field label="Project URL" htmlFor="p-url" error={errors.baseUrl} hint="The project's Agent API address.">
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
