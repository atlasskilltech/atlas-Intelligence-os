/**
 * Per-step status for the flow diagram on a run page, derived from the run's
 * event log. Two sources, in order of trust:
 *  1. `step_progress` events — the agent records each plan step (AI-only steps
 *     included) as done / skipped / failed with the built-in update_plan tool.
 *  2. Tool events — the latest event for a step's tool (a fallback for steps
 *     the agent has not recorded yet, and the live "waiting for approval").
 * While a run is in progress, the first step without a status is "running".
 * Pure module — safe on client and server.
 */

const EVENT_STATUS = {
  tool_call: "done",
  tool_simulated: "simulated",
  tool_error: "failed",
  tool_rejected: "rejected",
  approval_rejected: "rejected",
  approval_requested: "waiting",
  approval_granted: "approved",
};

const PROGRESS = new Set(["done", "skipped", "failed"]);

/** Returns { [stepId]: "done" | "skipped" | "simulated" | "failed" | "rejected" | "waiting" | "approved" | "running" }. */
export function stepStatusesFromRun(run) {
  const steps = run?.config?.steps ?? [];
  const byTool = {};
  const recorded = {};
  for (const e of run?.events ?? []) {
    if (e?.type === "step_progress" && PROGRESS.has(e.stepStatus)) recorded[e.stepId] = e.stepStatus;
    const status = e?.toolId && EVENT_STATUS[e.type];
    if (status) byTool[e.toolId] = status;
  }
  // An approval request only counts while the run is actually waiting on it.
  const waitingOn = run?.status === "waiting_approval" ? run.pendingApproval?.toolId : null;
  for (const [toolId, status] of Object.entries(byTool)) if (status === "waiting" && toolId !== waitingOn) delete byTool[toolId];

  const out = {};
  for (const s of steps) {
    if (s.tool && s.tool === waitingOn && !recorded[s.id]) out[s.id] = "waiting";
    else if (recorded[s.id]) out[s.id] = recorded[s.id];
    else if (s.tool && byTool[s.tool]) out[s.id] = byTool[s.tool];
  }
  if (run?.status === "running") {
    const next = steps.find((s) => !out[s.id]);
    if (next) out[next.id] = "running";
  }
  return out;
}

/** Status of the flow's end node for a run. */
export function endStatusFromRun(run) {
  if (run?.status === "succeeded") return "done";
  if (run?.status === "failed" || run?.status === "timed_out") return "failed";
  if (run?.status === "cancelled") return "rejected";
  return null;
}
