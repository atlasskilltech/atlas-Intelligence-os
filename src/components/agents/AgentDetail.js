"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { fmtDateTime } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import AgentWorkspace, { agentApi, downloadAgentJson, toDraft, toPayload, workspaceErrors } from "./AgentWorkspace";
import { StatusBadge } from "./AgentStatus";

const SAVED_MSG = {
  active: "Agent saved and activated.",
  draft: "Agent saved as a draft. Activate it when you are ready.",
};

/** Comparable form of a draft (ignores editor-only step keys). */
const fingerprint = (d) => JSON.stringify(toPayload(d));

/** View / edit one saved agent: status actions, editing, AI refine, delete. */
export default function AgentDetail({ initial, justSaved }) {
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
        <Link href="/agents" className="text-sm text-slate-500 hover:text-navy-800">
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
        </div>
        <div className="flex flex-wrap gap-2">
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

      <AgentWorkspace
        draft={draft}
        setDraft={(fn) => {
          setNotice(null);
          setDraft(fn);
        }}
        prompt={rec.config.source?.prompt}
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
            <Button variant="secondary" className="w-full" disabled title="Test runs arrive in Milestone 5">
              <Icon name="play" className="size-4" />
              Run test
            </Button>
            <p className="text-center text-xs text-slate-500">{blocking ? "Fix the highlighted fields to save." : "Test runs arrive in Milestone 5"}</p>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => downloadAgentJson(toPayload(draft))}>
              Download JSON
            </Button>
          </>
        }
      />

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
