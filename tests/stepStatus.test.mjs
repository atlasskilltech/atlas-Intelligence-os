// Flow diagram run statuses. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

const { stepStatusesFromRun, endStatusFromRun } = await import("../src/lib/runs/stepStatus.js");

const config = {
  steps: [
    { id: "s1", title: "Fetch", tool: "atlas_project.read" },
    { id: "s2", title: "Think", tool: null },
    { id: "s3", title: "Report", tool: "report.create_report" },
    { id: "s4", title: "Update", tool: "atlas_project.write" },
  ],
};

test("step status comes from the latest event for its tool; AI steps have none", () => {
  const run = {
    status: "running",
    config,
    events: [
      { type: "tool_error", toolId: "atlas_project.read" },
      { type: "tool_call", toolId: "atlas_project.read" },
      { type: "tool_simulated", toolId: "report.create_report" },
      { type: "model_call" },
    ],
  };
  assert.deepEqual(stepStatusesFromRun(run), { s1: "done", s3: "simulated" });
});

test("an approval request counts only while the run is waiting on it", () => {
  const events = [{ type: "approval_requested", toolId: "atlas_project.write" }];
  const waiting = { status: "waiting_approval", pendingApproval: { toolId: "atlas_project.write" }, config, events };
  assert.equal(stepStatusesFromRun(waiting).s4, "waiting");
  assert.equal(stepStatusesFromRun({ ...waiting, status: "failed", pendingApproval: null }).s4, undefined);
  const rejected = { ...waiting, events: [...events, { type: "approval_rejected", toolId: "atlas_project.write" }] };
  assert.equal(stepStatusesFromRun(rejected).s4, "rejected");
});

test("end status follows the run outcome", () => {
  assert.equal(endStatusFromRun({ status: "succeeded" }), "done");
  assert.equal(endStatusFromRun({ status: "timed_out" }), "failed");
  assert.equal(endStatusFromRun({ status: "running" }), null);
  assert.deepEqual(stepStatusesFromRun({}), {});
});
