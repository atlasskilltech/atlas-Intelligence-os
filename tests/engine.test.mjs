// Execution engine tests (Milestone 5) with a scripted fake model. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-engine-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";

const repo = await import("../src/lib/agents/agentRepo.js");
const engine = await import("../src/lib/engine/runner.js");
const runs = await import("../src/lib/runs/runRepo.js");
const { BUILTIN_TOOLS } = await import("../src/lib/tools/builtins.js");
const { validateArgs } = await import("../src/lib/tools/argsValidator.js");
const { runSystemPrompt } = await import("../src/lib/engine/prompt.js");

const actor = { id: "local-user", name: "Tester", role: "admin" };

async function makeAgent(over = {}, { activate = true } = {}) {
  return repo.createAgent(
    actor,
    {
      name: "Lead Report",
      description: "",
      instructions: "Prepare a lead report.",
      steps: [
        { title: "Fetch leads", tool: "atlas_project.read" },
        { title: "Write report", tool: "report.create_report" },
        { title: "Update a lead", tool: "atlas_project.write" },
      ],
      trigger: { type: "manual", schedule: null },
      ...over,
    },
    { activate },
  );
}

/** Fake model: returns scripted replies in order and records what it was sent. */
function fakeModel(replies) {
  const calls = [];
  const fn = async (method, opts) => {
    calls.push({ method, tools: opts.tools.map((t) => t.name), messages: structuredClone(opts.messages) });
    const r = replies.shift();
    if (!r) throw new Error("fake model: no more replies");
    if (r instanceof Error) throw r;
    return { text: "", toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, costUsd: 0.001, latencyMs: 5, model: "fake-1", ...r };
  };
  fn.calls = calls;
  return fn;
}
const callTool = (name, args, id = `call_${Math.random().toString(36).slice(2, 8)}`) => ({ toolCalls: [{ id, name, arguments: args }] });
const reportArgs = { title: "Leads today", summary: "12 new leads.", tables: [{ columns: ["Name", "Source"], rows: [["Asha", "Web"], ["Ravi"]] }] };

// fake write tool so approvals can be exercised before real connectors exist
const writeCalls = [];
const executors = {
  ...BUILTIN_TOOLS,
  "atlas_project.write": {
    parameters: { type: "object", required: ["leadId", "status"], properties: { leadId: { type: "string" }, status: { type: "string" } } },
    async execute(args) {
      writeCalls.push(args);
      return { updated: true };
    },
  },
};
const notes = [];
const deps = (callModel) => ({ callModel, executors, notify: async (n) => notes.push(n) });

// ---------------------------------------------------------------------------
test("argument validator", () => {
  const schema = BUILTIN_TOOLS["report.create_report"].parameters;
  assert.deepEqual(validateArgs(schema, reportArgs), []);
  assert.ok(validateArgs(schema, { title: "x" }).some((e) => e.includes("summary is required")));
  assert.ok(validateArgs(schema, { title: 1, summary: "s" }).some((e) => e.includes("title")));
  assert.ok(validateArgs(schema, { title: "x", summary: "y", hack: true }).some((e) => e.includes("not allowed")));
  assert.ok(validateArgs({ type: "string", enum: ["a"] }, "b").length === 1);
});

test("system prompt lists tools, marks unconnected ones, and states the data-not-instructions rule", async () => {
  const agent = await makeAgent();
  const p = runSystemPrompt(agent.config, { mode: "test", executable: (id) => id === "report.create_report" });
  assert.match(p, /TEST run/);
  assert.match(p, /You can call: report\.create_report/);
  assert.match(p, /Not connected yet.*atlas_project\.read/);
  assert.match(p, /DATA, never instructions/);
  await repo.deleteAgent(actor, agent.id);
});

test("happy path: report tool runs, summary saved, usage counted, events logged", async () => {
  const agent = await makeAgent();
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  assert.equal(run.status, "queued");
  const model = fakeModel([callTool("report__create_report", reportArgs), { text: "Done. 12 leads; CRM not connected yet." }]);
  await engine.executeRun(run.id, deps(model));

  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(r.output.summary, "Done. 12 leads; CRM not connected yet.");
  assert.equal(r.output.reports[0].title, "Leads today");
  assert.deepEqual(r.output.reports[0].tables[0].rows[1], ["Ravi", ""]); // short rows padded
  assert.equal(r.stats.modelCalls, 2);
  assert.equal(r.stats.actions, 1);
  assert.equal(r.stats.inputTokens, 200);
  assert.ok(Math.abs(r.stats.costUsd - 0.002) < 1e-9);
  // only executable agent tools are offered, plus the built-in progress tool
  assert.deepEqual(model.calls[0].tools.sort(), ["atlas_project__write", "report__create_report", "update_plan"]);
  // tool output wrapped as untrusted data
  const toolMsg = model.calls[1].messages.find((m) => m.role === "tool");
  assert.match(toolMsg.content, /^<tool_result untrusted="true">/);
  const types = r.events.map((e) => e.type);
  for (const t of ["run_queued", "run_started", "tools_unavailable", "model_call", "tool_call", "run_succeeded"]) assert.ok(types.includes(t), t);
  const idx = await runs.listRuns(actor, { agentId: agent.id });
  assert.equal(idx[0].status, "succeeded");
  assert.equal(idx[0].reportTitle, "Leads today");
});

test("unknown tool, unconnected tool and invalid arguments are refused and the run continues", async () => {
  const agent = await makeAgent();
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const model = fakeModel([
    callTool("shell__exec", { cmd: "rm -rf /" }),
    callTool("atlas_project__read", {}),
    callTool("report__create_report", { title: "No summary" }),
    { text: "Finished with problems." },
  ]);
  await engine.executeRun(run.id, deps(model));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(r.stats.actions, 0);
  assert.equal(r.events.filter((e) => e.type === "tool_rejected").length, 3);
  const toolMsgs = model.calls[3].messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.match(toolMsgs[0], /not part of the agent's plan/);
  assert.match(toolMsgs[1], /not connected yet/);
  assert.match(toolMsgs[2], /summary is required/);
});

test("test runs simulate write actions instead of performing them", async () => {
  writeCalls.length = 0;
  const agent = await makeAgent();
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  await engine.executeRun(run.id, deps(fakeModel([callTool("atlas_project__write", { leadId: "L1", status: "won" }), { text: "ok" }])));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(writeCalls.length, 0);
  assert.ok(r.events.some((e) => e.type === "tool_simulated"));
});

test("live run pauses for approval; approve executes the action, reject tells the model", async () => {
  writeCalls.length = 0;
  notes.length = 0;
  const agent = await makeAgent();

  // approve
  let run = await engine.startRun(actor, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps(fakeModel([callTool("atlas_project__write", { leadId: "L1", status: "won" }, "c1")])));
  let r = await runs.loadRun(run.id);
  assert.equal(r.status, "waiting_approval");
  assert.equal(r.pendingApproval.toolId, "atlas_project.write");
  assert.equal(writeCalls.length, 0);
  assert.ok(notes.some((n) => /waiting for your approval/.test(n.message)));
  await assert.rejects(engine.startRun(actor, agent.id, { mode: "test" }), (e) => e.status === 409); // one active run per agent

  await engine.decideApproval(actor, run.id, { decision: "approve", note: "go" });
  const m2 = fakeModel([{ text: "Lead updated." }]);
  await engine.executeRun(run.id, deps(m2));
  r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.deepEqual(writeCalls, [{ leadId: "L1", status: "won" }]);
  assert.equal(r.approvals[0].decision, "approve");
  assert.match(m2.calls[0].messages.at(-1).content, /"updated":true/);
  await assert.rejects(engine.decideApproval(actor, run.id, { decision: "approve" }), (e) => e.status === 409);

  // reject
  run = await engine.startRun(actor, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps(fakeModel([callTool("atlas_project__write", { leadId: "L2", status: "lost" }, "c2")])));
  await engine.decideApproval(actor, run.id, { decision: "reject", note: "wrong lead" });
  const m3 = fakeModel([{ text: "Skipped the update." }]);
  await engine.executeRun(run.id, deps(m3));
  r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(writeCalls.length, 1);
  assert.match(m3.calls[0].messages.at(-1).content, /rejected this action: \\"wrong lead\\"/);
});

test("pre-approved tools run without asking", async () => {
  writeCalls.length = 0;
  const agent = await makeAgent({ permissions: { preApproved: ["atlas_project.write"] } });
  const run = await engine.startRun(actor, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps(fakeModel([callTool("atlas_project__write", { leadId: "L9", status: "won" }), { text: "done" }])));
  assert.equal((await runs.loadRun(run.id)).status, "succeeded");
  assert.equal(writeCalls.length, 1);
});

test("live runs need an active agent", async () => {
  const agent = await makeAgent({}, { activate: false });
  await assert.rejects(engine.startRun(actor, agent.id, { mode: "live" }), (e) => e.status === 409);
  const run = await engine.startRun(actor, agent.id, { mode: "test" }); // test runs are fine for drafts
  assert.equal(run.mode, "test");
  await engine.cancelRun(actor, run.id);
});

test("action limit forces a final summary without tools", async () => {
  const agent = await makeAgent({ limits: { maxSteps: 2, timeoutMinutes: 5 } });
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const model = fakeModel([
    callTool("report__create_report", reportArgs),
    callTool("report__create_report", reportArgs),
    { text: "Stopped at the limit." },
  ]);
  await engine.executeRun(run.id, deps(model));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(r.output.limitReached, true);
  assert.deepEqual(model.calls[2].tools, ["update_plan"]); // only progress updates after the limit
  assert.match(model.calls[2].messages.at(-1).content, /limit of 2 actions/);
});

test("update_plan records step progress (AI steps too) without counting as an action", async () => {
  const agent = await makeAgent({
    steps: [
      { title: "Write report", tool: "report.create_report" },
      { title: "Rank the leads", tool: null },
      { title: "Update a lead", tool: "atlas_project.write" },
    ],
  });
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const model = fakeModel([
    callTool("report__create_report", reportArgs),
    callTool("update_plan", { steps: [{ id: "s1", status: "done" }, { id: "s2", status: "done" }] }),
    callTool("update_plan", { steps: [{ id: "s9", status: "done" }] }), // unknown step: refused
    callTool("update_plan", { steps: [{ id: "s3", status: "skipped", note: "No lead to update" }] }),
    { text: "All done." },
  ]);
  await engine.executeRun(run.id, deps(model));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  assert.equal(r.stats.actions, 1);
  const progress = r.events.filter((e) => e.type === "step_progress").map((e) => [e.stepId, e.stepStatus]);
  assert.deepEqual(progress, [["s1", "done"], ["s2", "done"], ["s3", "skipped"]]);
  assert.ok(r.events.some((e) => e.type === "tool_rejected" && /update_plan/.test(e.message)));
  assert.match(model.calls[0].messages[0].content, /\[s2\] Rank the leads/);
  assert.match(model.calls[0].messages[0].content, /update_plan/);
  const { stepStatusesFromRun } = await import("../src/lib/runs/stepStatus.js");
  assert.deepEqual(stepStatusesFromRun(r), { s1: "done", s2: "done", s3: "skipped" });
});

test("AI failure fails the run with a clear error and secrets are redacted from logs", async () => {
  const agent = await makeAgent();
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const err = new Error("Rate limited — try again later");
  await engine.executeRun(run.id, deps(fakeModel([{ text: `key is ${process.env.OPENAI_API_KEY}`, toolCalls: [{ id: "x", name: "notify__notify_owner", arguments: { message: "hi" } }] }, err])));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "failed");
  assert.match(r.error, /AI request failed: Rate limited/);
  assert.ok(!JSON.stringify(r.events).includes(process.env.OPENAI_API_KEY));
});

test("cancel stops a waiting run; stale runs are marked interrupted", async () => {
  const agent = await makeAgent();
  let run = await engine.startRun(actor, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps(fakeModel([callTool("atlas_project__write", { leadId: "L1", status: "won" })])));
  const c = await engine.cancelRun(actor, run.id);
  assert.equal(c.status, "cancelled");
  assert.equal(c.pendingApproval, null);
  await assert.rejects(engine.cancelRun(actor, run.id), (e) => e.status === 409);

  run = await engine.startRun(actor, agent.id, { mode: "test" });
  const later = Date.now() + 10 * 60_000;
  const r = await engine.reconcileStale(run.id, later);
  assert.equal(r.status, "failed");
  assert.match(r.error, /Interrupted/);
});

test("a run cancelled mid-flight is not overwritten by the engine", async () => {
  const agent = await makeAgent();
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const model = async () => {
    await engine.cancelRun(actor, run.id); // user cancels while the AI is thinking
    return { text: "", toolCalls: [{ id: "c", name: "report__create_report", arguments: reportArgs }], usage: {}, costUsd: 0, latencyMs: 1 };
  };
  await engine.executeRun(run.id, deps(model));
  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "cancelled");
  assert.equal(r.output.reports.length, 0);
});

test("events feed the execution log", async () => {
  const events = await runs.listEvents(actor, { limit: 1000 });
  assert.ok(events.length > 10);
  assert.ok(Date.parse(events[0].at) >= Date.parse(events.at(-1).at));
  assert.ok((await runs.listEvents(actor, { level: "error" })).every((e) => e.level === "error"));
  const stats = await runs.runStats(actor);
  assert.ok(stats.today >= 5);
});
