"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { Card, CardBody } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { Alert, Spinner } from "@/components/ui/States";
import RunTable from "@/components/runs/RunTable";
import AgentWorkspace, { agentApi, downloadAgentJson, toDraft, toPayload, workspaceErrors } from "./AgentWorkspace";
import AgentConnectors, { usesProjects } from "./AgentConnectors";
import { StatusBadge } from "./AgentStatus";

const SAVED_MSG = {
  active: "Agent saved and activated.",
  draft: "Agent saved as a draft. Activate it when you are ready.",
};

/** Comparable form of a draft (ignores editor-only step keys). */
const fingerprint = (d) => JSON.stringify(toPayload(d));

/** View / edit one saved agent: status actions, editing, AI refine, delete. */
export default function AgentDetail({ initial, justSaved, runs = [], schedule = null, projects = [] }) {
  const router = useRouter();
  const [rec, setRec] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial.config));
  const [baseline, setBaseline] = useState(() => fingerprint(toDraft(initial.config)));
  const [warnings, setWarnings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(null); // save | activate | pause | resume | delete
  const [notice, setNotice] = useState(justSaved ? { tone: "success", text: SAVED_MSG[justSaved] } : null);
  const [error, setError] = useState(null);
  const [serverErrors, setServerErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runMode, setRunMode] = useState(null); // null | "test" | "live"
  const [runInput, setRunInput] = useState("");

  const dirty = useMemo(() => fingerprint(draft) !== baseline, [draft, baseline]);
  const blocking = Object.keys(workspaceErrors(draft)).length > 0;

  // Drop ?saved= from the URL so a refresh doesn't repeat the message.
  useEffect(() => {
    if (justSaved) router.replace(`/agents/${initial.id}`, { scroll: false });
  }, [justSaved, initial.id, router]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function adopt(next, message) {
    setRec(next);
    const d = toDraft(next.config);
    setDraft(d);
    setBaseline(fingerprint(d));
    setNotice(message ? { tone: "success", text: message } : null);
    setError(null);
    setServerErrors({});
    router.refresh(); // sidebar + lists
  }

  async function saveChanges() {
    setBusy("save");
    setError(null);
    try {
      const { agent } = await agentApi(`/api/agents/${rec.id}`, "PUT", { agent: toPayload(draft), expectedUpdatedAt: rec.updatedAt });
      setWarnings([]);
      adopt(agent, "Changes saved.");
    } catch (err) {
      setError(err.message);
      setServerErrors(err.fields || {});
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(action) {
    setBusy(action);
    setError(null);
    try {
      const { agent } = await agentApi(`/api/agents/${rec.id}/status`, "POST", { action });
      setRec(agent);
      setNotice({ tone: "success", text: { activate: "Agent activated.", pause: "Agent paused — it won't run until you resume it.", resume: "Agent resumed." }[action] });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await agentApi(`/api/agents/${rec.id}`, "DELETE");
      setBaseline(fingerprint(draft)); // nothing to protect any more
      router.push("/agents?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
      setBusy(null);
    }
  }

  async function startRun() {
    setBusy("run");
    setError(null);
    try {
      const { run } = await agentApi(`/api/agents/${rec.id}/runs`, "POST", { mode: runMode, input: runInput });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setRunMode(null);
      setBusy(null);
    }
  }

  const runBlocked = dirty ? "Save or discard your changes first — runs use the saved version." : null;

  function discard() {
    const d = toDraft(rec.config);
    setDraft(d);
    setBaseline(fingerprint(d));
    setWarnings([]);
    setServerErrors({});
  }

  const statusButton =
    rec.status === "active" ? (
      <Button variant="secondary" onClick={() => changeStatus("pause")} disabled={!!busy}>
        <Icon name="pause" className="size-4" />
        {busy === "pause" ? "Pausing…" : "Pause"}
      </Button>
    ) : rec.status === "paused" ? (
      <Button onClick={() => changeStatus("resume")} disabled={!!busy || dirty} title={dirty ? "Save or discard your changes first" : undefined}>
        <Icon name="play" className="size-4" />
        {busy === "resume" ? "Resuming…" : "Resume"}
      </Button>
    ) : (
      <Button onClick={() => changeStatus("activate")} disabled={!!busy || dirty} title={dirty ? "Save or discard your changes first" : undefined}>
        <Icon name="check" className="size-4" />
        {busy === "activate" ? "Activating…" : "Activate"}
      </Button>
    );

  return (
    <div>
      <div className="mb-2">
        <Link href="/agents" className="text-sm text-slate-500 hover:text-ink">
          ← My Agents
        </Link>
      </div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-brand-500">{rec.config.name}</h1>
            <StatusBadge status={rec.status} />
            {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Created {fmtDateTime(rec.createdAt)} · Last saved {fmtDateTime(rec.updatedAt)}
          </p>
          {usesProjects(rec.config.tools) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Connectors:</span>
              <AgentConnectors ids={rec.config.connectors?.projects || []} projects={projects} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRunMode("test")} disabled={!!busy || !!runBlocked} title={runBlocked || "Try the agent safely: changes and messages are simulated"}>
            <Icon name="play" className="size-4" />
            Run test
          </Button>
          {rec.status === "active" && (
            <Button onClick={() => setRunMode("live")} disabled={!!busy || !!runBlocked} title={runBlocked || "Run the agent for real now"}>
              <Icon name="play" className="size-4" />
              Run now
            </Button>
          )}
          {statusButton}
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={!!busy} className="text-red-600 hover:bg-red-50 hover:text-red-700">
            <Icon name="trash" className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {notice && !error && (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mb-4" title="Something went wrong">
          {error}
        </Alert>
      )}
      {rec.status === "active" && dirty && (
        <Alert tone="info" className="mb-4">
          This agent is active. Saved changes apply from its next run.
        </Alert>
      )}

      {schedule && <ScheduleStatus status={rec.status} schedule={schedule} />}

      <AgentWorkspace
        draft={draft}
        setDraft={(fn) => {
          setNotice(null);
          setDraft(fn);
        }}
        prompt={rec.config.source?.prompt}
        projects={projects}
        warnings={warnings}
        meta={meta}
        onAIResult={(data) => {
          setDraft(toDraft(data.agent));
          setMeta(data.meta);
          setWarnings(data.warnings || []);
        }}
        history={history}
        setHistory={setHistory}
        serverErrors={serverErrors}
        actions={
          <>
            <Button className="w-full" onClick={saveChanges} disabled={!dirty || blocking || !!busy}>
              {busy === "save" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="check" className="size-4" />}
              {busy === "save" ? "Saving…" : dirty ? "Save changes" : "All changes saved"}
            </Button>
            {dirty && (
              <Button variant="secondary" className="w-full" onClick={discard} disabled={!!busy}>
                Discard changes
              </Button>
            )}
            {blocking && <p className="text-center text-xs text-slate-500">Fix the highlighted fields to save.</p>}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => downloadAgentJson(toPayload(draft))}>
              Download JSON
            </Button>
          </>
        }
      />

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Recent runs</h2>
          {runs.length > 0 && (
            <Link href="/runs" className="text-sm font-medium text-brand-600 hover:underline">
              All runs
            </Link>
          )}
        </div>
        {runs.length ? (
          <RunTable runs={runs} showAgent={false} projects={projects} />
        ) : (
          <Card>
            <CardBody className="text-sm text-slate-500">No runs yet. Press Run test to see the agent work — nothing is changed or sent in a test run.</CardBody>
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={!!runMode}
        tone="primary"
        title={runMode === "live" ? `Run "${rec.config.name}" now?` : `Test "${rec.config.name}"`}
        confirmLabel={runMode === "live" ? "Run now" : "Start test run"}
        busy={busy === "run"}
        onConfirm={startRun}
        onCancel={() => setRunMode(null)}
      >
        <p>
          {runMode === "live"
            ? "The agent runs for real. Actions that need approval will pause and wait for you."
            : "The agent runs its plan with real AI and read-only tools. Actions that change data or send messages are simulated."}
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="run-input">
          Extra instructions for this run <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <Textarea id="run-input" rows={3} maxLength={2000} value={runInput} onChange={(e) => setRunInput(e.target.value)} className="mt-1.5" placeholder="e.g. Only look at leads from the B.Tech programme" />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${rec.config.name}"?`}
        confirmLabel="Delete agent"
        busy={busy === "delete"}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        The agent and its configuration are removed permanently. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

const LAST_RESULT = { started: "Started", skipped: "Skipped", missed: "Missed" };

/** Next / last scheduled run, and a warning when no scheduler is running. */
function ScheduleStatus({ status, schedule }) {
  if (status !== "active") {
    return (
      <Alert tone="info" className="mb-4" title="Scheduled">
        Scheduled runs start once the agent is active. {status === "paused" ? "Resume it to continue." : "Activate it to start."}
      </Alert>
    );
  }
  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-surface px-5 py-4 text-sm sm:grid-cols-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Next run</p>
        <p className="mt-1 font-medium text-ink">
          {fmtDateTime(schedule.nextRunAt)}
          {schedule.estimated && <span className="ml-1 text-xs font-normal text-slate-500">(expected)</span>}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Last scheduled run</p>
        <p className="mt-1 text-ink">
          {schedule.lastFiredAt || schedule.lastResult ? (
            <>
              {LAST_RESULT[schedule.lastResult] || "—"}
              {schedule.lastFiredAt && ` · ${fmtDateTime(schedule.lastFiredAt)}`}
              {schedule.lastRunId && (
                <Link href={`/runs/${schedule.lastRunId}`} className="ml-2 text-brand-600 hover:underline">
                  View
                </Link>
              )}
            </>
          ) : (
            "Not yet"
          )}
        </p>
        {schedule.lastError && <p className="mt-1 text-xs text-amber-700">{schedule.lastError}</p>}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Scheduler</p>
        {schedule.schedulerRunning ? (
          <p className="mt-1 flex items-center gap-2 text-emerald-700">
            <span className="size-2 rounded-full bg-emerald-500" /> Running
          </p>
        ) : (
          <p className="mt-1 text-amber-700">
            Not running on this server — scheduled runs won&apos;t start. Use the always-on server, or a cron calling /api/scheduler/tick.
          </p>
        )}
      </div>
    </div>
  );
}
