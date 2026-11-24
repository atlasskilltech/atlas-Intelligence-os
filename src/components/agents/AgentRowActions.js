"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { agentApi } from "./AgentWorkspace";

const iconBtn = "grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-800 disabled:opacity-40";

/** Quick pause / resume / activate / delete for one row of My Agents. */
export default function AgentRowActions({ id, name, status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);

  async function run(label, fn) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      setConfirm(false);
    }
  }

  const statusAction = status === "active" ? "pause" : status === "paused" ? "resume" : "activate";
  const label = { pause: "Pause", resume: "Resume", activate: "Activate" }[statusAction];

  return (
    <div className="flex items-center justify-end gap-1">
      {error && (
        <span role="alert" className="mr-1 max-w-48 truncate text-xs text-red-600" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        className={iconBtn}
        disabled={!!busy}
        title={label}
        aria-label={`${label} ${name}`}
        onClick={() => run(statusAction, () => agentApi(`/api/agents/${id}/status`, "POST", { action: statusAction }))}
      >
        <Icon name={statusAction === "pause" ? "pause" : statusAction === "resume" ? "play" : "check"} className="size-4" />
      </button>
      <button type="button" className={cn(iconBtn, "hover:bg-red-50 hover:text-red-600")} disabled={!!busy} title="Delete" aria-label={`Delete ${name}`} onClick={() => setConfirm(true)}>
        <Icon name="trash" className="size-4" />
      </button>
      <ConfirmDialog
        open={confirm}
        title={`Delete "${name}"?`}
        confirmLabel="Delete agent"
        busy={busy === "delete"}
        onConfirm={() => run("delete", () => agentApi(`/api/agents/${id}`, "DELETE"))}
        onCancel={() => setConfirm(false)}
      >
        The agent and its configuration are removed permanently. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
