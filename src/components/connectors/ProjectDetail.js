"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { ProjectAvatar, ProjectStatus, api, counts } from "./ProjectsSection";

const when = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—";

export default function ProjectDetail({ initialProject, isAdmin }) {
  const router = useRouter();
  const [p, setP] = useState(initialProject);
  const [busy, setBusy] = useState(null); // "sync" | "toggle"
  const [message, setMessage] = useState(null); // { tone, text }
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(null); // { busy, error }

  const reads = p.manifest.actions.filter((a) => a.risk === "read");
  const writes = p.manifest.actions.filter((a) => a.risk !== "read");
  const c = counts(p);

  async function act(kind, fn, okText) {
    setBusy(kind);
    setMessage(null);
    try {
      const data = await fn();
      setP(data.project);
      setMessage(data.project.status === "connected" || kind === "toggle" ? { tone: "success", text: okText } : null);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  const sync = () => act("sync", () => api(`/api/connectors/projects/${p.id}/sync`, { method: "POST" }), "Access re-checked with the project.");
  const toggleDelegated = () =>
    act(
      "toggle",
      () => api(`/api/connectors/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ delegated: !p.delegated }) }),
      p.delegated ? "Calls no longer send the user's email." : "Calls now act as the agent's owner.",
    );
  const toggle = () =>
    act(
      "toggle",
      () => api(`/api/connectors/projects/${p.id}`, { method: "PUT", body: JSON.stringify({ enabled: !p.enabled }) }),
      p.enabled ? "Disabled — agents can't use this project now." : "Enabled — agents can use this project again.",
    );

  async function remove() {
    setRemoving({ busy: true });
    try {
      await api(`/api/connectors/projects/${p.id}`, { method: "DELETE" });
      router.push("/connectors");
      router.refresh();
    } catch (err) {
      setRemoving({ busy: false, error: err.message });
    }
  }

  return (
    <>
      <Link href="/connectors" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        ← Connectors
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ProjectAvatar name={p.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-brand-600">{p.name}</h1>
              <ProjectStatus project={p} />
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-500">{p.baseUrl}</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={sync} disabled={!!busy}>
              {busy === "sync" ? <Spinner className="size-4" /> : <Icon name="history" className="size-4" />} Re-check access
            </Button>
            <Button variant="secondary" onClick={() => setReplacing((v) => !v)} disabled={!!busy}>
              <Icon name="shield" className="size-4" /> Replace key
            </Button>
            <Button variant="secondary" onClick={toggle} disabled={!!busy}>
              <Icon name={p.enabled ? "pause" : "play"} className="size-4" /> {p.enabled ? "Disable" : "Enable"}
            </Button>
            <Button variant="ghost" onClick={() => setRemoving({})} aria-label="Remove project">
              <Icon name="trash" className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {p.status !== "connected" && p.lastError && (
        <Alert tone="error" className="mb-6" title="Agents can't use this project right now">
          {p.lastError} Create a new key in the project and use “Replace key”, or “Re-check access” once it is fixed.
        </Alert>
      )}
      {message && (
        <Alert tone={message.tone} className="mb-6">
          {message.text}
        </Alert>
      )}
      {replacing && <ReplaceKey project={p} onDone={(np) => { setP(np); setReplacing(false); setMessage({ tone: "success", text: "Key replaced and access re-checked." }); router.refresh(); }} onCancel={() => setReplacing(false)} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="What this key allows"
              description={
                p.delegated
                  ? `Up to ${c.read} read action${c.read === 1 ? "" : "s"} and ${c.write} that change${c.write === 1 ? "s" : ""} data. Each person gets only the ones ${p.name} allows them.`
                  : `${c.read} read action${c.read === 1 ? "" : "s"} and ${c.write} that change${c.write === 1 ? "s" : ""} data. Agents can use nothing else in this project.`
              }
            />
            <CardBody className="space-y-6">
              <ActionGroup
                title="Can read"
                note="Runs automatically."
                tone="success"
                actions={reads}
                empty="This key can't read anything."
              />
              <ActionGroup
                title="Can change data"
                note="Always asks the agent's owner for approval first. Only simulated in test runs."
                tone="warning"
                actions={writes}
                empty="This key can't change anything — read only."
              />
              {p.manifest.skipped?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-ink">Offered by the project but blocked here</h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-500">
                    {p.manifest.skipped.map((s, i) => (
                      <li key={i}>
                        <code className="font-mono text-xs">{s.id}</code> — {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
          {isAdmin && reads.length > 0 && <ActionTester project={p} actions={reads} />}
        </div>

        <Card className="h-fit">
          <CardHeader title="Connection" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              {[
                ["Project says", `${p.manifest.project.name}${p.manifest.project.version ? ` · v${p.manifest.project.version}` : ""}`],
                ["Key", <span key="k" className="font-mono">{p.keyHint}</span>],
                ["Key name", p.manifest.key.name || "—"],
                ["Access level", p.manifest.key.access || "Custom"],
                ["Acts as", p.delegated ? "The agent's owner" : "The project key"],
                ["Key expires", p.manifest.key.expiresAt ? when(p.manifest.key.expiresAt) : "Never"],
                ["Last checked", when(p.syncedAt)],
                ["Connected", when(p.createdAt)],
                ["Used by agents", p.enabled && p.status === "connected" ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
              {p.delegated
                ? `Each call sends the agent owner's email; ${p.name} applies that person's own permissions. Emails must match in both apps.`
                : `To change what agents may do, edit or create the key in ${p.name}, then click “Re-check access” (or “Replace key”).`}
            </p>
            {isAdmin && (
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={toggleDelegated} disabled={!!busy}>
                {p.delegated ? "Stop acting as the user" : "Act as the signed-in user"}
              </Button>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={!!removing}
        title={`Remove “${p.name}”?`}
        confirmLabel="Remove project"
        busy={removing?.busy}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      >
        Agents that use this project will skip those steps. The stored key is deleted here; also revoke it in {p.name}.
        {removing?.error && <p className="mt-2 text-red-600">{removing.error}</p>}
      </ConfirmDialog>
    </>
  );
}

function ActionGroup({ title, note, tone, actions, empty }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="text-xs text-slate-500">{note}</span>
      </div>
      {actions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {actions.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone}>{a.name}</Badge>
                <code className="font-mono text-xs text-slate-400">{a.id}</code>
              </div>
              {a.description && <p className="mt-1 text-sm text-slate-600">{a.description}</p>}
              {a.params.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.params.map((prm) => (
                    <span key={prm.name} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600" title={prm.description || undefined}>
                      {prm.name}
                      {prm.required ? "*" : ""}
                      <span className="text-slate-400">: {prm.enum ? prm.enum.join(" | ") : prm.type}</span>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReplaceKey({ project, onDone, onCancel }) {
  const [key, setKey] = useState("");
  const [state, setState] = useState({ state: "idle" });
  async function submit(e) {
    e.preventDefault();
    setState({ state: "saving" });
    try {
      const data = await api(`/api/connectors/projects/${project.id}`, { method: "PUT", body: JSON.stringify({ key }) });
      onDone(data.project);
    } catch (err) {
      setState({ state: "error", message: err.message });
    }
  }
  return (
    <Card className="mb-6 ring-2 ring-brand-500/20">
      <form onSubmit={submit} noValidate>
        <CardBody className="space-y-3">
          <Field label={`New key from ${project.name}`} htmlFor="new-key" hint="The new key is checked first; if the project rejects it, nothing changes.">
            <Input id="new-key" type="password" autoComplete="off" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          {state.state === "error" && <Alert tone="error">{state.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!key.trim() || state.state === "saving"}>
              {state.state === "saving" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="check" className="size-4" />} Save new key
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

function ActionTester({ project, actions }) {
  const [actionId, setActionId] = useState(actions[0].id);
  const [values, setValues] = useState({});
  const [state, setState] = useState({ state: "idle" });
  const action = actions.find((a) => a.id === actionId) || actions[0];

  async function run(e) {
    e.preventDefault();
    setState({ state: "running" });
    try {
      const data = await api(`/api/connectors/projects/${project.id}/test`, { method: "POST", body: JSON.stringify({ action: actionId, params: values }) });
      setState({ state: "done", result: data.result });
    } catch (err) {
      setState({ state: "done", result: { ok: false, error: err.message } });
    }
  }

  return (
    <Card>
      <CardHeader title="Try a read action" description="Sends one real request with this key. Only read actions can be tried here." />
      <CardBody>
        <form onSubmit={run}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Action" htmlFor="t-action">
              <Select
                id="t-action"
                value={actionId}
                onChange={(e) => {
                  setActionId(e.target.value);
                  setValues({});
                  setState({ state: "idle" });
                }}
              >
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {action.params.map((prm) => (
              <Field key={prm.name} label={`${prm.name}${prm.required ? " *" : ""}`} htmlFor={`t-${prm.name}`}>
                {prm.enum ? (
                  <Select id={`t-${prm.name}`} value={values[prm.name] || ""} onChange={(e) => setValues((v) => ({ ...v, [prm.name]: e.target.value }))}>
                    <option value="">Any</option>
                    {prm.enum.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input id={`t-${prm.name}`} value={values[prm.name] || ""} onChange={(e) => setValues((v) => ({ ...v, [prm.name]: e.target.value }))} />
                )}
              </Field>
            ))}
          </div>
          <Button type="submit" size="sm" className="mt-3" disabled={state.state === "running"}>
            {state.state === "running" ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : <Icon name="play" className="size-3.5" />}
            Run
          </Button>
        </form>
        {state.state === "done" &&
          (state.result.ok ? (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-sm text-emerald-700">
                <Icon name="check" className="size-4" /> HTTP {state.result.status} in {(state.result.durationMs / 1000).toFixed(2)}s
              </p>
              <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs whitespace-pre-wrap break-all text-ink">
                {state.result.preview || "(empty response)"}
              </pre>
            </div>
          ) : (
            <Alert tone="error" className="mt-4" title="Failed">
              {state.result.error}
            </Alert>
          ))}
      </CardBody>
    </Card>
  );
}
