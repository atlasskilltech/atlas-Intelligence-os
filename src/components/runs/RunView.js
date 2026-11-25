"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Textarea } from "@/components/ui/Field";
import { fmtDateTime, fmtDuration, fmtInt, fmtTime, fmtUsd, runDuration } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { getTool } from "@/lib/catalog/toolCatalog";
import { RiskBadge } from "@/components/agents/ToolBadges";
import StepsFlow from "@/components/agents/StepsFlow";
import { describeTrigger } from "@/lib/agents/schedule";
import { endStatusFromRun, stepStatusesFromRun } from "@/lib/runs/stepStatus";
import AgentConnectors from "@/components/agents/AgentConnectors";
import ProjectCalls from "./ProjectCalls";
import ReportView from "./ReportView";
import { ModeBadge, RUN_STATUS, RunStatusBadge } from "./RunStatus";

const LEVEL_DOT = { info: "bg-slate-300", warning: "bg-amber-500", error: "bg-red-500" };
const POLL_MS = 1500;

async function api(url, body) {
  const res = await fetch(url, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Request failed.");
  return data;
}

function ApprovalCard({ run, onDecided }) {
  const p = run.pendingApproval;
  const tool = getTool(p.toolId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function decide(decision) {
    setBusy(decision);
    setError(null);
    try {
      const { run: next } = await api(`/api/runs/${run.id}/approval`, { decision, note });
      onDecided(next);
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  }

  return (
    <Card className="border-amber-300 ring-2 ring-amber-200">
      <CardHeader title="Approval needed" description={`Requested ${fmtDateTime(p.requestedAt)}`} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">
            {tool?.connectorName} · {tool?.name}
          </span>
          {tool && <RiskBadge risk={tool.risk} />}
        </div>
        {p.reason && <p className="text-sm text-slate-600">{p.reason}</p>}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">What it wants to do</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{JSON.stringify(p.args, null, 2)}</pre>
        </div>
        <Textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the agent (e.g. why you rejected it)" />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("approve")} disabled={!!busy}>
            <Icon name="check" className="size-4" />
            {busy === "approve" ? "Approving…" : "Approve & continue"}
          </Button>
          <Button variant="secondary" onClick={() => decide("reject")} disabled={!!busy}>
            <Icon name="close" className="size-4" />
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Timeline({ events, live }) {
  const end = useRef(null);
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: "nearest" });
  }, [events.length, live]);
  return (
    <ol className="max-h-[32rem] space-y-0.5 overflow-y-auto">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
          <span className="w-16 shrink-0 font-mono text-xs leading-5 text-slate-400">{fmtTime(e.at)}</span>
          <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", LEVEL_DOT[e.level] || LEVEL_DOT.info)} />
          <div className="min-w-0 flex-1">
            <p className={cn("break-words", e.level === "error" ? "text-red-700" : e.level === "warning" ? "text-amber-800" : "text-slate-700")}>{e.message}</p>
            {e.args && Object.keys(e.args).length > 0 && (
              <details className="mt-0.5">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">Arguments</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 font-mono text-xs text-slate-600">{JSON.stringify(e.args, null, 2)}</pre>
              </details>
            )}
          </div>
        </li>
      ))}
      {live && (
        <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-500">
          <Spinner className="size-3.5" /> Working…
        </li>
      )}
      <li ref={end} />
    </ol>
  );
}

/** Live view of one run: polls while it is active. */
export default function RunView({ initial, projects = [] }) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  const [pollError, setPollError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [, tick] = useState(0);
  const live = !!RUN_STATUS[run.status]?.live;

  useEffect(() => {
    if (!live) return;
    let stop = false;
    let timer;
    const poll = async () => {
      try {
        const { run: next } = await api(`/api/runs/${run.id}`);
        if (stop) return;
        setRun(next);
        setPollError(null);
        if (!RUN_STATUS[next.status]?.live) router.refresh(); // update sidebar/home counts once finished
      } catch (err) {
        if (!stop) setPollError(err.message);
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    const clock = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [live, run.id, router]);

  async function cancel() {
    setCancelling(true);
    try {
      const { run: next } = await api(`/api/runs/${run.id}/cancel`, {});
      setRun(next);
      router.refresh();
    } catch (err) {
      setPollError(err.message);
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  const report = run.output.reports.at(-1);
  const s = run.stats;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 text-sm text-slate-500">
        <Link href="/runs" className="hover:text-ink">
          ← Execution History
        </Link>
        <Link href={`/agents/${run.agentId}`} className="hover:text-ink">
          Agent: {run.agentName}
        </Link>
        <Link href={`/logs?agent=${encodeURIComponent(run.agentId)}`} className="hover:text-ink">
          Agent logs
        </Link>
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-brand-500">{run.agentName}</h1>
            <RunStatusBadge status={run.status} />
            <ModeBadge mode={run.mode} />
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {run.id} · started {fmtDateTime(run.createdAt)}
          </p>
        </div>
        {live && (
          <Button variant="secondary" onClick={() => setConfirmCancel(true)} disabled={cancelling}>
            <Icon name="close" className="size-4" />
            Cancel run
          </Button>
        )}
      </div>

      {pollError && (
        <Alert tone="error" className="mb-4">
          {pollError}
        </Alert>
      )}
      {run.error && (
        <Alert tone="error" className="mb-4" title={RUN_STATUS[run.status]?.label || "Error"}>
          {run.error}
        </Alert>
      )}
      {run.mode === "test" && (
        <Alert tone="info" className="mb-4">
          Test run — actions that change data or send messages are simulated, not performed.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {run.status === "waiting_approval" && run.pendingApproval && <ApprovalCard run={run} onDecided={setRun} />}

          {run.output.links?.length > 0 && <NextSteps links={run.output.links} />}

          {(run.output.summary || report) && (
            <Card>
              <CardHeader title="Result" />
              <CardBody className="space-y-6">
                {run.output.summary && <p className="whitespace-pre-line text-sm text-slate-700">{run.output.summary}</p>}
                {run.output.limitReached && (
                  <Alert tone="warning">The agent stopped at its action limit ({run.config.limits.maxSteps}). Some steps may be unfinished.</Alert>
                )}
                {report && (
                  <div className="rounded-lg border border-slate-200 p-4 sm:p-5">
                    <ReportView report={report} />
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {run.config?.steps?.length > 0 && (
            <Card>
              <CardHeader title="Plan" description="Each step's status in this run, as the agent recorded it." />
              <CardBody>
                <StepsFlow
                  readOnly
                  steps={run.config.steps}
                  triggerLabel={describeTrigger(run.config.trigger)}
                  preApproved={run.config.permissions?.preApproved ?? []}
                  statuses={stepStatusesFromRun(run)}
                  endStatus={endStatusFromRun(run)}
                  title={`${run.agentName} · run`}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Step-by-step log" description="Everything the agent did in this run." />
            <CardBody className="px-3 sm:px-4">
              <Timeline events={run.events} live={live && run.status !== "waiting_approval"} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Status", RUN_STATUS[run.status]?.label || run.status],
                  ["Duration", fmtDuration(runDuration(run))],
                  ["Actions", `${s.actions} / ${run.config.limits.maxSteps}`],
                  ["AI calls", fmtInt(s.modelCalls)],
                  ["Tokens", fmtInt(s.inputTokens + s.outputTokens)],
                  ["Cost", s.priced ? fmtUsd(s.costUsd) : s.costUsd ? `${fmtUsd(s.costUsd)}+` : "Price not set"],
                  ["Started by", { manual: "You (manual)", schedule: "Schedule", schedule_retry: "Schedule (automatic retry)" }[run.trigger] || run.trigger],
                  ["Finished", run.finishedAt ? fmtTime(run.finishedAt) : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">{k}</dt>
                    <dd className="mt-0.5 text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          {(run.output.projectCalls?.length > 0 || run.config?.tools?.some((t) => t.startsWith("atlas_project."))) && (
            <Card>
              <CardHeader title="Projects called" description="The ATLAS projects this run actually used." />
              <CardBody className="space-y-4">
                {run.output.projectCalls?.length > 0 ? (
                  <ProjectCalls calls={run.output.projectCalls} projects={projects} />
                ) : (
                  <p className="text-sm text-slate-500">{live ? "No project called yet." : "No project was called in this run."}</p>
                )}
                {run.config?.connectors && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="mb-1.5 text-xs uppercase tracking-wider text-slate-400">Allowed connectors</p>
                    <AgentConnectors compact ids={run.config.connectors.projects} projects={projects} />
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          {run.input && (
            <Card>
              <CardHeader title="Extra instructions" />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-slate-600">{run.input}</p>
              </CardBody>
            </Card>
          )}
          {run.approvals.length > 0 && (
            <Card>
              <CardHeader title="Approvals" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {run.approvals.map((a) => (
                    <li key={a.id}>
                      <span className={a.decision === "approve" ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
                        {a.decision === "approve" ? "Approved" : "Rejected"}
                      </span>{" "}
                      <span className="text-ink">{getTool(a.toolId)?.name}</span>
                      <span className="text-slate-500">
                        {" "}
                        by {a.decidedByName}, {fmtTime(a.decidedAt)}
                      </span>
                      {a.note && <p className="text-xs text-slate-500">“{a.note}”</p>}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this run?"
        confirmLabel="Cancel run"
        busy={cancelling}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      >
        The agent stops after its current step. Anything it already did is not undone.
      </ConfirmDialog>
    </div>
  );
}

/** Draft / confirm links returned by connected projects: nothing is final until the owner opens them. */
function NextSteps({ links }) {
  return (
    <Card className="ring-2 ring-amber-400/40">
      <CardHeader
        title="Finish in the other app"
        description="Nothing has been submitted or approved yet. Open each link, check it, and complete it there."
      />
      <CardBody className="space-y-3">
        {links.map((l) => (
          <div key={l.url} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-ink">
                {l.kind === "confirm" ? "Waiting for your confirmation" : "Draft ready for you to check and submit"}
              </p>
              <p className="text-xs text-slate-500">
                {l.projectName} · {fmtDateTime(l.createdAt)}
                {l.kind === "confirm" && " · confirmation links expire after a short time"}
              </p>
            </div>
            <Button href={l.url} target="_blank" rel="noopener noreferrer" size="sm" variant={l.kind === "confirm" ? "primary" : "secondary"}>
              {l.kind === "confirm" ? `Confirm in ${l.projectName}` : `Open draft in ${l.projectName}`} ↗
            </Button>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
