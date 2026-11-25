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

test("step status comes from the latest event for its tool; unrecorded AI steps have none", () => {
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
  assert.deepEqual(stepStatusesFromRun({ ...run, status: "succeeded" }), { s1: "done", s3: "simulated" });
  assert.equal(stepStatusesFromRun(run).s2, "running");
});

test("an approval request counts only while the run is waiting on it", () => {
  const events = [{ type: "approval_requested", toolId: "atlas_project.write" }];
  const waiting = { status: "waiting_approval", pendingApproval: { toolId: "atlas_project.write" }, config, events };
  assert.equal(stepStatusesFromRun(waiting).s4, "waiting");
  assert.equal(stepStatusesFromRun({ ...waiting, status: "failed", pendingApproval: null }).s4, undefined);
  const rejected = { ...waiting, status: "succeeded", pendingApproval: null, events: [...events, { type: "approval_rejected", toolId: "atlas_project.write" }] };
  assert.equal(stepStatusesFromRun(rejected).s4, "rejected");
});

test("recorded progress covers AI steps and wins over tool events; a live run marks the next step running", () => {
  const run = {
    status: "running",
    config,
    events: [
      { type: "tool_call", toolId: "atlas_project.read" },
      { type: "step_progress", stepId: "s1", stepStatus: "failed" },
      { type: "step_progress", stepId: "s2", stepStatus: "done" },
      { type: "step_progress", stepId: "s9", stepStatus: "bogus" },
    ],
  };
  assert.deepEqual(stepStatusesFromRun(run), { s1: "failed", s2: "done", s3: "running" });
  assert.deepEqual(stepStatusesFromRun({ ...run, status: "succeeded" }), { s1: "failed", s2: "done" });
});

test("end status follows the run outcome", () => {
  assert.equal(endStatusFromRun({ status: "succeeded" }), "done");
  assert.equal(endStatusFromRun({ status: "timed_out" }), "failed");
  assert.equal(endStatusFromRun({ status: "running" }), null);
  assert.deepEqual(stepStatusesFromRun({}), {});
});
