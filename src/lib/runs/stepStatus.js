/**
 * Per-step status for the flow diagram on a run page, derived from the run's
 * event log. The engine logs tool activity (not plan-step ids), so a step's
 * status comes from the latest event for its tool; AI-only steps have none.
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

/** Returns { [stepId]: "done" | "simulated" | "failed" | "rejected" | "waiting" | "approved" }. */
export function stepStatusesFromRun(run) {
  const byTool = {};
  for (const e of run?.events ?? []) {
    const status = e?.toolId && EVENT_STATUS[e.type];
    if (status) byTool[e.toolId] = status;
  }
  // An approval request only counts while the run is actually waiting on it.
  for (const [toolId, status] of Object.entries(byTool)) {
    if (status === "waiting" && !(run.status === "waiting_approval" && run.pendingApproval?.toolId === toolId)) delete byTool[toolId];
  }
  const out = {};
  for (const s of run?.config?.steps ?? []) if (s.tool && byTool[s.tool]) out[s.id] = byTool[s.tool];
  return out;
}

/** Status of the flow's end node for a run. */
export function endStatusFromRun(run) {
  if (run?.status === "succeeded") return "done";
  if (run?.status === "failed" || run?.status === "timed_out") return "failed";
  if (run?.status === "cancelled") return "rejected";
  return null;
}
