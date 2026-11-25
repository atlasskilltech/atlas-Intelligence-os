// Scheduler (Milestone 9): next-run maths, firing as the owner, no duplicates,
// missed runs, overlap, retry after a temporary failure. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-sched-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";

const { nextRunAfter, scheduleSignature } = await import("../src/lib/scheduler/nextRun.js");
const sched = await import("../src/lib/scheduler/scheduler.js");
const agents = await import("../src/lib/agents/agentRepo.js");
const runs = await import("../src/lib/runs/runRepo.js");
const engine = await import("../src/lib/engine/runner.js");

const owner = { id: "u_7", uid: 7, name: "Owner", email: "owner@example.edu", role: "user" };
const iso = (d) => new Date(d).toISOString();
const IST = "Asia/Kolkata";

// ---------------------------------------------------------------------------
test("next run: daily, hourly, weekly, monthly in the schedule's time zone", () => {
  const at = Date.parse("2026-11-25T05:00:00Z"); // Wed 10:30 IST
  assert.equal(iso(nextRunAfter({ frequency: "daily", time: "09:00", timezone: IST }, at)), "2026-11-26T03:30:00.000Z");
  assert.equal(iso(nextRunAfter({ frequency: "daily", time: "11:00", timezone: IST }, at)), "2026-11-25T05:30:00.000Z");
  assert.equal(iso(nextRunAfter({ frequency: "hourly", time: "00:15", timezone: IST }, at)), "2026-11-25T05:45:00.000Z");
  assert.equal(iso(nextRunAfter({ frequency: "weekly", time: "09:00", daysOfWeek: ["mon", "fri"], timezone: IST }, at)), "2026-11-27T03:30:00.000Z");
  assert.equal(iso(nextRunAfter({ frequency: "monthly", time: "08:30", dayOfMonth: 1, timezone: IST }, at)), "2026-12-01T03:00:00.000Z");
  // exactly at the fire time → the NEXT one (strictly after)
  assert.equal(iso(nextRunAfter({ frequency: "daily", time: "11:00", timezone: IST }, Date.parse("2026-11-25T05:30:00Z"))), "2026-11-26T05:30:00.000Z");
  // a zone with daylight saving: 09:00 New York is 13:00 UTC in summer, 14:00 in winter
  assert.equal(iso(nextRunAfter({ frequency: "daily", time: "09:00", timezone: "America/New_York" }, Date.parse("2027-03-14T05:00:00Z"))), "2027-03-14T13:00:00.000Z");
  assert.equal(iso(nextRunAfter({ frequency: "daily", time: "09:00", timezone: "America/New_York" }, Date.parse("2027-01-10T05:00:00Z"))), "2027-01-10T14:00:00.000Z");
});

// ---------------------------------------------------------------------------
async function makeScheduled(name, schedule = { frequency: "daily", time: "09:00", timezone: IST }) {
  return agents.createAgent(
    owner,
    {
      name,
      description: "",
      instructions: "Write a report.",
      steps: [{ title: "Report", tool: "report.create_report" }],
      trigger: { type: "schedule", schedule },
    },
    { activate: true },
  );
}
const recorder = () => {
  const calls = [];
  const start = async (actor, agentId, opts) => {
    calls.push({ actor, agentId, opts });
    return engine.startRun(actor, agentId, opts);
  };
  return { calls, start, execute: async () => {} }; // runs stay queued: lets us test overlap
};

test("first pass only plans; the run starts at its time, as the owner, once", async () => {
  const agent = await makeScheduled("Morning report");
  const t0 = Date.parse("2026-11-25T05:00:00Z"); // 10:30 IST
  const r = recorder();
  let res = await sched.tick({ now: t0, ...r });
  assert.equal(res.started.length, 0, "no surprise run when a schedule is first seen");
  let info = await sched.scheduleInfo(agent.id);
  assert.equal(info.nextRunAt, "2026-11-26T03:30:00.000Z");

  const due = Date.parse("2026-11-26T03:30:20Z");
  res = await sched.tick({ now: due, ...r });
  assert.equal(res.started.length, 1);
  assert.equal(r.calls[0].actor.id, owner.id, "runs as the agent's owner");
  assert.equal(r.calls[0].opts.mode, "live");
  assert.equal(r.calls[0].opts.trigger, "schedule");
  const run = await runs.loadRun(res.started[0].runId);
  assert.equal(run.trigger, "schedule");
  info = await sched.scheduleInfo(agent.id);
  assert.equal(info.nextRunAt, "2026-11-27T03:30:00.000Z");
  assert.equal(info.lastResult, "started");

  res = await sched.tick({ now: due + 10_000, ...r });
  assert.equal(res.started.length, 0, "never twice for the same time");
  await engine.cancelRun({ ...owner }, run.id);
});

test("two processes ticking at once start the run only once", async () => {
  const agent = await makeScheduled("Twin check", { frequency: "daily", time: "07:00", timezone: IST });
  await sched.tick({ now: Date.parse("2026-11-25T00:00:00Z"), ...recorder() }); // plan: 01:30Z
  const due = Date.parse("2026-11-25T01:30:05Z");
  const a = recorder();
  const b = recorder();
  const [ra, rb] = await Promise.all([sched.tick({ now: due, ...a }), sched.tick({ now: due, ...b })]);
  const started = [...ra.started, ...rb.started].filter((s) => s.agentId === agent.id);
  assert.equal(started.length, 1);
  await engine.cancelRun(owner, started[0].runId);
});

test("server was down: an old missed run is skipped (owner told), not back-filled", async () => {
  const agent = await makeScheduled("Missed one", { frequency: "daily", time: "06:00", timezone: IST });
  await sched.tick({ now: Date.parse("2026-11-25T00:00:00Z"), ...recorder() }); // plan: 00:30Z
  const r = recorder();
  const res = await sched.tick({ now: Date.parse("2026-11-25T03:00:00Z"), ...r }); // 2.5 h late
  assert.ok(res.missed.some((m) => m.agentId === agent.id));
  assert.equal(r.calls.filter((c) => c.agentId === agent.id).length, 0);
  const info = await sched.scheduleInfo(agent.id);
  assert.equal(info.lastResult, "missed");
  assert.equal(info.nextRunAt, "2026-11-26T00:30:00.000Z");
});

test("a run still in progress → this time is skipped, with a reason", async () => {
  const agent = await makeScheduled("Slow one", { frequency: "hourly", time: "00:00", timezone: IST });
  const t = Date.parse("2026-11-25T05:10:00Z");
  await sched.tick({ now: t, ...recorder() }); // plan 05:30Z (… :00 IST)
  const first = await sched.tick({ now: Date.parse("2026-11-25T05:30:01Z"), ...recorder() });
  const runId = first.started.find((s) => s.agentId === agent.id).runId;
  const second = await sched.tick({ now: Date.parse("2026-11-25T06:30:01Z"), ...recorder() }); // previous still queued
  assert.ok(second.skipped.some((s) => s.agentId === agent.id && /still in progress/.test(s.reason)));
  assert.match((await sched.scheduleInfo(agent.id)).lastError, /still in progress/);
  await engine.cancelRun(owner, runId);
});

test("temporary failure → one retry 5 minutes later; a second failure is not retried again", async () => {
  const agent = await makeScheduled("Flaky one", { frequency: "daily", time: "08:00", timezone: IST });
  await sched.tick({ now: Date.parse("2026-11-25T00:00:00Z"), ...recorder() }); // plan 02:30Z
  const first = await sched.tick({ now: Date.parse("2026-11-25T02:30:01Z"), ...recorder() });
  const runId = first.started.find((s) => s.agentId === agent.id).runId;
  const failedAt = Date.parse("2026-11-25T02:31:00Z");
  await runs.updateRun(runId, async (r) => Object.assign(r, { status: "failed", retryable: true, finishedAt: iso(failedAt), error: "AI request failed: rate limit" }));

  assert.equal((await sched.tick({ now: failedAt + 60_000, ...recorder() })).retried.length, 0, "not before 5 minutes");
  const r = recorder();
  const res = await sched.tick({ now: failedAt + 6 * 60_000, ...r });
  const retry = res.retried.find((x) => x.agentId === agent.id);
  assert.ok(retry, JSON.stringify(res));
  assert.equal(retry.retryOf, runId);
  assert.equal(r.calls.find((c) => c.agentId === agent.id).opts.trigger, "schedule_retry");

  await runs.updateRun(retry.runId, async (x) => Object.assign(x, { status: "failed", retryable: true, finishedAt: iso(failedAt + 7 * 60_000) }));
  const again = await sched.tick({ now: failedAt + 20 * 60_000, ...recorder() });
  assert.equal(again.retried.filter((x) => x.agentId === agent.id).length, 0, "only one retry");
});

test("paused agents don't run; editing the schedule replans without a surprise run", async () => {
  const agent = await makeScheduled("Pausable", { frequency: "daily", time: "10:00", timezone: IST });
  await sched.tick({ now: Date.parse("2026-11-25T00:00:00Z"), ...recorder() }); // plan 04:30Z
  await agents.setAgentStatus(owner, agent.id, "pause");
  let res = await sched.tick({ now: Date.parse("2026-11-25T04:30:05Z"), ...recorder() });
  assert.equal(res.started.filter((s) => s.agentId === agent.id).length, 0);

  await agents.setAgentStatus(owner, agent.id, "resume");
  const rec = await agents.getAgent(owner, agent.id);
  await agents.updateAgent(owner, agent.id, { ...rec.config, trigger: { type: "schedule", schedule: { frequency: "daily", time: "18:00", timezone: IST } } });
  res = await sched.tick({ now: Date.parse("2026-11-25T05:00:00Z"), ...recorder() });
  assert.equal(res.started.filter((s) => s.agentId === agent.id).length, 0);
  const info = await sched.scheduleInfo(agent.id);
  assert.equal(info.nextRunAt, "2026-11-25T12:30:00.000Z", "18:00 IST today");
  assert.equal(scheduleSignature((await agents.getAgent(owner, agent.id)).config.trigger.schedule).includes("18:00"), true);
});

test("engine marks temporary AI failures and interrupted runs as retryable", async () => {
  const agent = await makeScheduled("Retry flags", { frequency: "daily", time: "12:00", timezone: IST });
  const run = await engine.startRun(owner, agent.id, { mode: "live", trigger: "schedule" });
  const err = Object.assign(new Error("Rate limited"), { retryable: true });
  await engine.executeRun(run.id, { callModel: async () => { throw err; }, executors: {}, notify: async () => {} });
  const done = await runs.loadRun(run.id);
  assert.equal(done.status, "failed");
  assert.equal(done.retryable, true);

  const run2 = await engine.startRun(owner, agent.id, { mode: "live" });
  const stale = await engine.reconcileStale(run2.id, Date.now() + 10 * 60_000);
  assert.equal(stale.status, "failed");
  assert.equal(stale.retryable, true, "interrupted runs can be retried");
});
