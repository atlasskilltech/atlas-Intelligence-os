"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { api } from "./ProjectsSection";
import { portalAgentFor } from "@/lib/portals/portalAgents";

const when = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—";

const KIND_LABEL = { routine: "Routine", mission: "Mission", automation: "Workflow" };

/**
 * A two-way project's own agents (Career Services routines, CRM missions,
 * workflows …) as the project last reported them through signed events, with
 * Activate / Deactivate / Run buttons for administrators. Every button goes
 * through the project's own manifest action, so the key's scopes still apply.
 */
export default function ProjectAgents({ project, isAdmin }) {
  const [mirror, setMirror] = useState(null);
  const [busy, setBusy] = useState(null); // "refresh" | `${agentId}:${op}`
  const [message, setMessage] = useState(null);
  const ids = new Set(project.manifest.actions.map((a) => a.id));
  const can = { activate: ids.has("activate_agent"), deactivate: ids.has("deactivate_agent"), run: ids.has("run_agent") };
  const ev = project.events || null;
  const persona = portalAgentFor(project);

  useEffect(() => {
    let live = true;
    api(`/api/connectors/projects/${project.id}/agents`)
      .then((d) => live && setMirror(d.mirror))
      .catch((err) => live && setMessage({ tone: "error", text: err.message }));
    return () => {
      live = false;
    };
  }, [project.id]);

  async function refresh() {
    setBusy("refresh");
    setMessage(null);
    try {
      const d = await api(`/api/connectors/projects/${project.id}/agents?refresh=1`);
      setMirror(d.mirror);
      setMessage({ tone: "success", text: `${d.mirror.agents.length} agent${d.mirror.agents.length === 1 ? "" : "s"} read from ${project.name}.` });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function op(agent, which) {
    setBusy(`${agent.id}:${which}`);
    setMessage(null);
    try {
      const d = await api(`/api/connectors/projects/${project.id}/agents`, { method: "POST", body: JSON.stringify({ agentId: agent.id, op: which }) });
      if (d.agent) setMirror((m) => ({ ...m, agents: m.agents.map((a) => (a.id === d.agent.id ? d.agent : a)) }));
      const text =
        which === "run"
          ? `${agent.name} ran${d.run?.status ? ` (${d.run.status})` : ""}.${d.answer ? ` ${d.answer.slice(0, 400)}${d.answer.length > 400 ? "…" : ""}` : ""}`
          : `${agent.name} ${which === "activate" ? "activated" : "deactivated"}.${d.warnings?.length ? ` ${d.warnings.join(" ")}` : ""}`;
      setMessage({ tone: d.run?.status === "failed" ? "error" : "success", text });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  const agents = mirror?.agents || [];
  return (
    <Card>
      <CardHeader
        title={`Agents in ${project.name}`}
        description={`${persona ? `${persona.persona} is ${project.name}'s own AI agent. ` : ""}${project.name} reports every change to its own agents here as a signed event, so this list stays in sync without polling.`}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ev?.registered ? (
            <Badge tone="success">Two-way sync on</Badge>
          ) : (
            <Badge tone="warning">{ev ? "Sync not registered" : "Sync not set up yet"}</Badge>
          )}
          <span className="text-xs text-slate-500">
            Last event: {when(ev?.lastEventAt || mirror?.lastEventAt)}
            {ev?.lastEvent ? ` (${ev.lastEvent})` : ""}
          </span>
          {isAdmin && (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={refresh} disabled={!!busy || !ids.has("list_agents")}>
              {busy === "refresh" ? <Spinner className="size-3.5" /> : <Icon name="history" className="size-3.5" />} Refresh from {project.name}
            </Button>
          )}
        </div>
        {ev && !ev.registered && ev.error && (
          <Alert tone="warning" title="Events can't reach IntelligenceOS yet">
            {ev.error} “Re-check access” tries again.
          </Alert>
        )}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {!mirror ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="size-4" /> Loading…
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No agents reported yet. {isAdmin ? `Use “Refresh from ${project.name}”, or press “Sync all agents now” on ${project.name}'s IntelligenceOS Connector page.` : ""}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {agents.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{a.name}</span>
                    <Badge tone="neutral">{KIND_LABEL[a.kind] || a.kind || "Agent"}</Badge>
                    <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : a.status || "Off"}</Badge>
                    {a.source === "intos" && <Badge tone="brand">Made in IntelligenceOS</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[a.scheduleText, a.owner?.name && `Owner: ${a.owner.name}`, a.lastRunAt && `Last run ${when(a.lastRunAt)}${a.lastStatus ? ` · ${a.lastStatus}` : ""}`]
                      .filter(Boolean)
                      .join(" · ") || a.description}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1.5">
                    {a.active
                      ? can.deactivate &&
                        a.capabilities?.deactivate !== false && (
                          <Button size="sm" variant="secondary" onClick={() => op(a, "deactivate")} disabled={!!busy}>
                            {busy === `${a.id}:deactivate` ? <Spinner className="size-3.5" /> : <Icon name="pause" className="size-3.5" />} Deactivate
                          </Button>
                        )
                      : can.activate &&
                        a.capabilities?.activate !== false && (
                          <Button size="sm" variant="secondary" onClick={() => op(a, "activate")} disabled={!!busy}>
                            {busy === `${a.id}:activate` ? <Spinner className="size-3.5" /> : <Icon name="play" className="size-3.5" />} Activate
                          </Button>
                        )}
                    {can.run && a.capabilities?.run && (
                      <Button size="sm" variant="ghost" onClick={() => op(a, "run")} disabled={!!busy} aria-label={`Run ${a.name} now`}>
                        {busy === `${a.id}:run` ? <Spinner className="size-3.5" /> : <Icon name="terminal" className="size-3.5" />} Run
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {mirror?.runs?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink">Recent runs</h3>
            <ul className="mt-2 space-y-2">
              {mirror.runs.slice(0, 8).map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.agentName || r.agentId}</span>
                    <Badge tone={r.status === "failed" ? "danger" : "success"}>{r.status || "done"}</Badge>
                    <span className="text-xs text-slate-500">{when(r.at)}</span>
                  </div>
                  {(r.error || r.summary) && <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-slate-600">{r.error || r.summary}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
