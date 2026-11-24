"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { Alert, EmptyState, Spinner } from "@/components/ui/States";

async function api(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Request failed."), { fields: data?.error?.fields });
  return data;
}

const pathParams = (path) => [...String(path || "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]{0,39})\}/g)].map((m) => m[1]);
const AUTH_LABELS = { none: "No authentication", bearer: "Bearer token", header: "API key header", basic: "Basic (user:password)" };

const blankEndpoint = () => ({ id: "", name: "", method: "GET", path: "/", description: "", queryParams: [] });
const blankConnection = () => ({
  id: "",
  name: "",
  description: "",
  baseUrl: "https://",
  enabled: true,
  auth: { type: "none", headerName: "", secretEnv: "" },
  endpoints: [blankEndpoint()],
});

/** Turns "HR Portal" into "hr_portal" for the id suggestion. */
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);

export default function ApiConnectionsManager({ initialConnections, internalHosts, isAdmin }) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [editing, setEditing] = useState(null); // { mode: "new" | "edit", draft }
  const [testing, setTesting] = useState(null); // connection id
  const [deleting, setDeleting] = useState(null); // { connection, busy, error }

  // Also refresh the server-rendered connector cards above (Ready / Needs setup).
  const upsert = (c) => {
    setConnections((list) => [...list.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
    router.refresh();
  };

  async function confirmDelete() {
    setDeleting((d) => ({ ...d, busy: true, error: null }));
    try {
      await api(`/api/connectors/http-api/${deleting.connection.id}`, { method: "DELETE" });
      setConnections((list) => list.filter((x) => x.id !== deleting.connection.id));
      setDeleting(null);
      router.refresh();
    } catch (err) {
      setDeleting((d) => ({ ...d, busy: false, error: err.message }));
    }
  }

  return (
    <section className="mt-10" aria-labelledby="apis-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="apis-title" className="text-lg font-bold text-ink">
            Custom REST APIs
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Agents can call only the endpoints you list here — never other URLs. GET endpoints run automatically; POST
            endpoints ask the agent&apos;s owner for approval and are only simulated in test runs.
          </p>
        </div>
        {isAdmin && !editing && (
          <Button onClick={() => setEditing({ mode: "new", draft: blankConnection() })}>
            <Icon name="plus" className="size-4" /> Add API
          </Button>
        )}
      </div>

      <Alert tone="info" className="mb-6" title="Secrets stay on the server">
        For an API that needs a key, set it as a server environment variable named{" "}
        <code className="font-mono">CONNECTOR_SECRET_…</code> (for example{" "}
        <code className="font-mono">CONNECTOR_SECRET_HR_PORTAL</code>), restart the app, and enter only the variable&apos;s
        name here. Internal hosts allowed by the server:{" "}
        {internalHosts.length ? (
          <code className="font-mono">{internalHosts.join(", ")}</code>
        ) : (
          <>none — set <code className="font-mono">INTERNAL_ALLOWED_HOSTS</code> to reach APIs on the private network</>
        )}
        .
      </Alert>

      {!isAdmin && (
        <Alert tone="warning" className="mb-6" title="View only">
          Only administrators can add or change API connections.
        </Alert>
      )}

      {editing && (
        <ConnectionEditor
          key={editing.draft.id || "new"}
          mode={editing.mode}
          initial={editing.draft}
          onCancel={() => setEditing(null)}
          onSaved={(c) => {
            upsert(c);
            setEditing(null);
          }}
        />
      )}

      {connections.length === 0 && !editing ? (
        <EmptyState
          icon="plug"
          title="No APIs added yet"
          description="Add an API your agents may use, with the exact endpoints they are allowed to call."
          action={
            isAdmin && (
              <Button onClick={() => setEditing({ mode: "new", draft: blankConnection() })}>
                <Icon name="plus" className="size-4" /> Add API
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {connections
            .filter((c) => !(editing?.mode === "edit" && editing.draft.id === c.id))
            .map((c) => (
              <Card key={c.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {c.name}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-normal text-slate-600">{c.id}</code>
                      {c.enabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>}
                      {c.auth.type !== "none" &&
                        (c.secretConfigured ? (
                          <Badge tone="success">Secret set</Badge>
                        ) : (
                          <Badge tone="danger">Secret missing: {c.auth.secretEnv}</Badge>
                        ))}
                    </span>
                  }
                  description={c.description || null}
                  action={
                    isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setTesting(testing === c.id ? null : c.id)}>
                          <Icon name="play" className="size-3.5" /> Test
                        </Button>
                        <Button size="sm" variant="secondary" disabled={!!editing} onClick={() => setEditing({ mode: "edit", draft: structuredClone(c) })}>
                          <Icon name="edit" className="size-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting({ connection: c })} aria-label={`Delete ${c.name}`}>
                          <Icon name="trash" className="size-3.5" />
                        </Button>
                      </div>
                    )
                  }
                />
                <CardBody className="space-y-3">
                  <p className="text-sm text-slate-600">
                    <span className="font-mono text-xs break-all">{c.baseUrl}</span>
                    <span className="text-slate-400"> · </span>
                    {AUTH_LABELS[c.auth.type]}
                    {c.auth.type === "header" && <span className="font-mono text-xs"> ({c.auth.headerName})</span>}
                  </p>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {c.endpoints.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                        <Badge tone={e.method === "GET" ? "success" : "warning"} className="font-mono">
                          {e.method}
                        </Badge>
                        <span className="font-mono text-xs break-all text-ink">
                          {e.path}
                          {e.queryParams.length ? `?${e.queryParams.join("&")}` : ""}
                        </span>
                        <span className="text-slate-500">
                          {e.name} <code className="font-mono text-xs text-slate-400">({e.id})</code>
                        </span>
                        {e.method === "POST" && <span className="text-xs text-amber-700">needs approval</span>}
                      </li>
                    ))}
                  </ul>
                  {testing === c.id && <EndpointTester connection={c} />}
                </CardBody>
              </Card>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.connection.name}”?`}
        confirmLabel="Delete API"
        busy={deleting?.busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      >
        Agents that use this API will skip those steps until it is added again. The server env var holding its secret is
        not changed.
        {deleting?.error && <p className="mt-2 text-red-600">{deleting.error}</p>}
      </ConfirmDialog>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ConnectionEditor({ mode, initial, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [idTouched, setIdTouched] = useState(mode === "edit");
  const [errors, setErrors] = useState({});
  const [save, setSave] = useState({ state: "idle" });

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setAuth = (key, value) => setForm((f) => ({ ...f, auth: { ...f.auth, [key]: value } }));
  const setEp = (i, key, value) =>
    setForm((f) => ({ ...f, endpoints: f.endpoints.map((e, j) => (j === i ? { ...e, [key]: value } : e)) }));
  const err = (k) => errors[k];

  async function onSubmit(e) {
    e.preventDefault();
    setSave({ state: "saving" });
    setErrors({});
    const { secretConfigured, createdAt, updatedAt, createdBy, updatedBy, ...rest } = form;
    const connection = { ...rest, endpoints: rest.endpoints.map((ep) => ({ ...ep, queryParams: ep.queryParams.filter(Boolean) })) };
    try {
      const data =
        mode === "new"
          ? await api("/api/connectors/http-api", { method: "POST", body: JSON.stringify({ connection }) })
          : await api(`/api/connectors/http-api/${form.id}`, { method: "PUT", body: JSON.stringify({ connection }) });
      onSaved(data.connection);
    } catch (e2) {
      setErrors(e2.fields || {});
      setSave({ state: "error", message: e2.message });
    }
  }

  return (
    <Card className="mb-6 ring-2 ring-brand-500/20">
      <form onSubmit={onSubmit} noValidate>
        <CardHeader
          title={mode === "new" ? "Add an API" : `Edit ${initial.name}`}
          description="Only the endpoints listed below can be called by agents."
        />
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="api-name" error={err("name")}>
              <Input
                id="api-name"
                value={form.name}
                placeholder="HR Portal"
                invalid={!!err("name")}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!idTouched) set("id", slug(e.target.value));
                }}
              />
            </Field>
            <Field
              label="API id"
              htmlFor="api-id"
              error={err("id")}
              hint={mode === "edit" ? "The id can't change — agents refer to it." : "Used by agents, e.g. hr_portal."}
            >
              <Input
                id="api-id"
                value={form.id}
                disabled={mode === "edit"}
                className="font-mono"
                invalid={!!err("id")}
                onChange={(e) => {
                  setIdTouched(true);
                  set("id", e.target.value);
                }}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="api-desc" hint="What the API is for. Agents and the planner read this." error={err("description")}>
            <Textarea id="api-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Base URL" htmlFor="api-url" error={err("baseUrl")} hint="https:// only (http:// is allowed for internal hosts the server allows).">
            <Input
              id="api-url"
              value={form.baseUrl}
              className="font-mono"
              placeholder="https://api.example.com/v1"
              invalid={!!err("baseUrl")}
              onChange={(e) => set("baseUrl", e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Authentication" htmlFor="api-auth">
              <Select id="api-auth" value={form.auth.type} onChange={(e) => setAuth("type", e.target.value)}>
                {Object.entries(AUTH_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {form.auth.type === "header" && (
              <Field label="Header name" htmlFor="api-header" error={err("auth.headerName")}>
                <Input
                  id="api-header"
                  value={form.auth.headerName}
                  placeholder="X-API-Key"
                  className="font-mono"
                  invalid={!!err("auth.headerName")}
                  onChange={(e) => setAuth("headerName", e.target.value)}
                />
              </Field>
            )}
            {form.auth.type !== "none" && (
              <Field
                label="Secret env var"
                htmlFor="api-secret"
                error={err("auth.secretEnv")}
                hint={form.auth.type === "basic" ? "Its value must be user:password." : "Its name, not the secret itself."}
                className={form.auth.type === "header" ? "" : "sm:col-span-2"}
              >
                <Input
                  id="api-secret"
                  value={form.auth.secretEnv}
                  placeholder="CONNECTOR_SECRET_HR_PORTAL"
                  className="font-mono"
                  invalid={!!err("auth.secretEnv")}
                  onChange={(e) => setAuth("secretEnv", e.target.value.toUpperCase())}
                />
              </Field>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Enabled — agents may use this API
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Endpoints</h3>
              <Button size="sm" variant="secondary" onClick={() => set("endpoints", [...form.endpoints, blankEndpoint()])} disabled={form.endpoints.length >= 30}>
                <Icon name="plus" className="size-3.5" /> Add endpoint
              </Button>
            </div>
            {err("endpoints") && <p className="mb-2 text-xs text-red-600">{err("endpoints")}</p>}
            <div className="space-y-3">
              {form.endpoints.map((ep, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-4">
                  <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr_1fr]">
                    <Field label="Method" htmlFor={`ep-${i}-method`}>
                      <Select id={`ep-${i}-method`} value={ep.method} onChange={(e) => setEp(i, "method", e.target.value)}>
                        <option value="GET">GET (read)</option>
                        <option value="POST">POST (write)</option>
                      </Select>
                    </Field>
                    <Field label="Name" htmlFor={`ep-${i}-name`} error={err(`endpoints.${i}.name`)}>
                      <Input
                        id={`ep-${i}-name`}
                        value={ep.name}
                        placeholder="List staff"
                        invalid={!!err(`endpoints.${i}.name`)}
                        onChange={(e) => {
                          const wasAuto = !ep.id || ep.id === slug(ep.name);
                          setEp(i, "name", e.target.value);
                          if (wasAuto) setEp(i, "id", slug(e.target.value));
                        }}
                      />
                    </Field>
                    <Field label="Endpoint id" htmlFor={`ep-${i}-id`} error={err(`endpoints.${i}.id`)}>
                      <Input
                        id={`ep-${i}-id`}
                        value={ep.id}
                        className="font-mono"
                        placeholder="list_staff"
                        invalid={!!err(`endpoints.${i}.id`)}
                        onChange={(e) => setEp(i, "id", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Path"
                      htmlFor={`ep-${i}-path`}
                      error={err(`endpoints.${i}.path`)}
                      hint="Use {name} for values the agent fills in, e.g. /staff/{id}"
                    >
                      <Input
                        id={`ep-${i}-path`}
                        value={ep.path}
                        className="font-mono"
                        invalid={!!err(`endpoints.${i}.path`)}
                        onChange={(e) => setEp(i, "path", e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Allowed query parameters"
                      htmlFor={`ep-${i}-query`}
                      error={err(`endpoints.${i}.queryParams`)}
                      hint="Comma-separated, e.g. department, page"
                    >
                      <Input
                        id={`ep-${i}-query`}
                        value={ep.queryParams.join(", ")}
                        className="font-mono"
                        invalid={!!err(`endpoints.${i}.queryParams`)}
                        onChange={(e) =>
                          setEp(
                            i,
                            "queryParams",
                            e.target.value.split(",").map((s) => s.trim()).filter((s, k, a) => s || k === a.length - 1),
                          )
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Description" htmlFor={`ep-${i}-desc`} className="mt-3" hint="What it returns or does — helps the agent pick the right endpoint.">
                    <Input id={`ep-${i}-desc`} value={ep.description} onChange={(e) => setEp(i, "description", e.target.value)} />
                  </Field>
                  {form.endpoints.length > 1 && (
                    <div className="mt-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => set("endpoints", form.endpoints.filter((_, j) => j !== i))}>
                        <Icon name="trash" className="size-3.5" /> Remove endpoint
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {save.state === "error" && (
            <Alert tone="error" title="Not saved">
              {save.message}
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={save.state === "saving"}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.state === "saving"}>
              {save.state === "saving" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="check" className="size-4" />}
              {mode === "new" ? "Add API" : "Save changes"}
            </Button>
          </div>
        </CardBody>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EndpointTester({ connection }) {
  const gets = connection.endpoints.filter((e) => e.method === "GET");
  const [endpointId, setEndpointId] = useState(gets[0]?.id || "");
  const [values, setValues] = useState({});
  const [state, setState] = useState({ state: "idle" });
  const endpoint = gets.find((e) => e.id === endpointId);

  if (!gets.length) {
    return (
      <Alert tone="info" title="Nothing to test here">
        This API has only POST endpoints. They change data, so they can only run inside an agent, with approval.
      </Alert>
    );
  }

  const required = endpoint ? pathParams(endpoint.path) : [];
  const optional = endpoint ? endpoint.queryParams : [];

  async function run(e) {
    e.preventDefault();
    setState({ state: "running" });
    try {
      const data = await api(`/api/connectors/http-api/${connection.id}/test`, {
        method: "POST",
        body: JSON.stringify({ endpoint: endpointId, params: values }),
      });
      setState({ state: "done", result: data.result });
    } catch (err) {
      setState({ state: "done", result: { ok: false, error: err.message } });
    }
  }

  return (
    <form onSubmit={run} className="rounded-lg bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Endpoint" htmlFor={`t-${connection.id}`}>
          <Select
            id={`t-${connection.id}`}
            value={endpointId}
            onChange={(e) => {
              setEndpointId(e.target.value);
              setValues({});
              setState({ state: "idle" });
            }}
          >
            {gets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        {[...required, ...optional].map((p) => (
          <Field key={p} label={`${p}${required.includes(p) ? " *" : ""}`} htmlFor={`t-${connection.id}-${p}`}>
            <Input
              id={`t-${connection.id}-${p}`}
              value={values[p] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={state.state === "running"}>
          {state.state === "running" ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : <Icon name="play" className="size-3.5" />}
          Send test request
        </Button>
        <span className="text-xs text-slate-500">Read-only: sends one GET request with the values above.</span>
      </div>
      {state.state === "done" &&
        (state.result.ok ? (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-sm text-emerald-700">
              <Icon name="check" className="size-4" /> HTTP {state.result.status} in {(state.result.durationMs / 1000).toFixed(2)}s
              {state.result.truncated && <span className="text-xs text-slate-500">(preview shortened)</span>}
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-surface p-3 font-mono text-xs whitespace-pre-wrap break-all text-ink">
              {state.result.preview || "(empty response)"}
            </pre>
          </div>
        ) : (
          <Alert tone="error" className="mt-4" title="Test failed">
            {state.result.error}
          </Alert>
        ))}
    </form>
  );
}
