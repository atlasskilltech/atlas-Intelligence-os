// Agent storage, approvals and status workflow (Milestone 4). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-agents-"));

const { normalizeAgentConfig, draftErrors, canPreApprove } = await import("../src/lib/agents/agentConfig.js");
const repo = await import("../src/lib/agents/agentRepo.js");
const { updateJson, readJson } = await import("../src/lib/storage/jsonFile.js");

const admin = { id: "local-user", name: "Admin", role: "admin" };
const alice = { id: "alice", name: "Alice", role: "employee" };
const bob = { id: "bob", name: "Bob", role: "employee" };

const draft = (over = {}) => ({
  name: "Daily Lead Report",
  description: "Reports new leads.",
  instructions: "You review new admission leads.",
  steps: [
    { title: "Fetch leads", details: "", tool: "atlas_project.read", successCriteria: "" },
    { title: "Update status", details: "", tool: "atlas_project.write", successCriteria: "" },
  ],
  trigger: { type: "manual", schedule: null },
  ...over,
});

// ---------- approvals ----------
test("approvals are computed from tool risk; pre-approval only for write/send tools the agent uses", () => {
  const { config } = normalizeAgentConfig(
    draft({ permissions: { preApproved: ["atlas_project.write", "atlas_project.read", "unknown.tool", "nope"] } }),
  );
  assert.deepEqual(config.permissions.preApproved, ["atlas_project.write"]); // read tool, unused tool, unknown tool dropped
  assert.deepEqual(config.permissions.toolsRequiringApproval, []);
  assert.deepEqual(config.steps.map((s) => s.requiresApproval), [false, false]);
  // A client cannot shrink the approval list directly.
  const forged = normalizeAgentConfig(draft({ permissions: { toolsRequiringApproval: [] } })).config;
  assert.deepEqual(forged.permissions.toolsRequiringApproval, ["atlas_project.write"]);
  assert.equal(canPreApprove("atlas_project.write"), true);
  assert.equal(canPreApprove("atlas_project.read"), false);
});

test("draftErrors reports missing name, instructions and steps", () => {
  assert.deepEqual(draftErrors(draft()), {});
  const e = draftErrors(draft({ name: " ", instructions: "", steps: [] }));
  assert.ok(e.name && e.instructions && e.steps);
  assert.ok(draftErrors(draft({ steps: [{ title: "" }] })).steps);
});

// ---------- repository ----------
test("create → get → list → update → status → delete", async () => {
  const rec = await repo.createAgent(alice, draft());
  assert.match(rec.id, /^ag_[a-f0-9]{12}$/);
  assert.equal(rec.status, "draft");
  assert.equal(rec.ownerId, "alice");
  assert.equal(rec.config.version, 1);
  assert.equal(rec.config.steps[0].id, "s1");

  assert.equal((await repo.getAgent(alice, rec.id)).config.name, "Daily Lead Report");
  assert.equal((await repo.listAgents(alice)).length, 1);

  const updated = await repo.updateAgent(alice, rec.id, { ...rec.config, name: "Renamed" }, { expectedUpdatedAt: rec.updatedAt });
  assert.equal(updated.config.name, "Renamed");
  assert.equal(updated.createdAt, rec.createdAt);

  // Stale write is refused.
  await assert.rejects(repo.updateAgent(alice, rec.id, rec.config, { expectedUpdatedAt: rec.updatedAt }), (e) => e.status === 409);

  const active = await repo.setAgentStatus(alice, rec.id, "activate");
  assert.equal(active.status, "active");
  const paused = await repo.setAgentStatus(alice, rec.id, "pause");
  assert.equal(paused.status, "paused");
  assert.equal((await repo.setAgentStatus(alice, rec.id, "pause")).status, "paused"); // already paused: no-op
  const resumed = await repo.setAgentStatus(alice, rec.id, "resume");
  assert.equal(resumed.status, "active");
  // Same status again is a no-op, not an error.
  assert.equal((await repo.setAgentStatus(alice, rec.id, "activate")).status, "active");
  await assert.rejects(repo.setAgentStatus(alice, rec.id, "explode"), (e) => e.status === 400);

  await repo.deleteAgent(alice, rec.id);
  await assert.rejects(repo.getAgent(alice, rec.id), (e) => e.status === 404);
});

test("invalid status transitions are refused", async () => {
  const rec = await repo.createAgent(alice, draft());
  await assert.rejects(repo.setAgentStatus(alice, rec.id, "pause"), (e) => e.status === 409); // draft can't pause
  await assert.rejects(repo.setAgentStatus(alice, rec.id, "resume"), (e) => e.status === 409);
  await repo.deleteAgent(alice, rec.id);
});

test("createAgent with activate starts active; invalid drafts are rejected with field errors", async () => {
  const rec = await repo.createAgent(alice, draft(), { activate: true });
  assert.equal(rec.status, "active");
  await assert.rejects(repo.createAgent(alice, draft({ name: "" })), (e) => e.status === 400 && !!e.fields.name);
  await assert.rejects(repo.createAgent(alice, draft({ steps: [] })), (e) => e.status === 400 && !!e.fields.steps);
  await repo.deleteAgent(alice, rec.id);
});

test("owners only see their own agents; admins see all; bad ids are 404", async () => {
  const a = await repo.createAgent(alice, draft());
  const b = await repo.createAgent(bob, draft({ name: "Bob's agent" }));
  assert.deepEqual((await repo.listAgents(alice)).map((x) => x.id), [a.id]);
  await assert.rejects(repo.getAgent(bob, a.id), (e) => e.status === 404);
  await assert.rejects(repo.updateAgent(bob, a.id, draft()), (e) => e.status === 404);
  await assert.rejects(repo.deleteAgent(bob, a.id), (e) => e.status === 404);
  await assert.rejects(repo.setAgentStatus(bob, a.id, "activate"), (e) => e.status === 404);
  assert.equal((await repo.listAgents(admin)).length >= 2, true);
  await assert.rejects(repo.getAgent(admin, "../../etc/passwd"), (e) => e.status === 404);
  const counts = await repo.countAgents(admin);
  assert.equal(counts.total, counts.draft + counts.active + counts.paused);
  await repo.deleteAgent(admin, a.id);
  await repo.deleteAgent(admin, b.id);
});

test("summaries exclude instructions and the list is newest first", async () => {
  const one = await repo.createAgent(alice, draft({ name: "One" }));
  await new Promise((r) => setTimeout(r, 5));
  const two = await repo.createAgent(alice, draft({ name: "Two" }));
  const list = (await repo.listAgents(alice)).map(repo.summarize);
  assert.deepEqual(list.map((x) => x.name), ["Two", "One"]);
  assert.equal(list[0].instructions, undefined);
  assert.equal(list[0].stepCount, 2);
  await repo.deleteAgent(alice, one.id);
  await repo.deleteAgent(alice, two.id);
});

test("concurrent writes never lose an agent", async () => {
  const made = await Promise.all(Array.from({ length: 20 }, (_, i) => repo.createAgent(alice, draft({ name: `Agent ${i}` }))));
  const stored = JSON.parse(await readFile(path.join(process.env.DATA_DIR, "agents.json"), "utf8"));
  for (const m of made) assert.ok(stored.agents.some((a) => a.id === m.id), `${m.id} kept`);
  await Promise.all(made.map((m) => repo.deleteAgent(alice, m.id)));
  assert.equal((await repo.listAgents(alice)).length, 0);
});

test("updateJson releases the lock when the mutator throws", async () => {
  await assert.rejects(updateJson("lock-test.json", { n: 0 }, () => { throw new Error("boom"); }), /boom/);
  await updateJson("lock-test.json", { n: 0 }, (cur) => ({ value: { n: cur.n + 1 }, result: null }));
  assert.equal((await readJson("lock-test.json", null)).n, 1);
});

test("a corrupt agents file reads as empty but is never overwritten", async () => {
  const { writeFile } = await import("node:fs/promises");
  const file = path.join(process.env.DATA_DIR, "agents.json");
  await writeFile(file, "{not json", "utf8");
  assert.deepEqual(await repo.listAgents(admin), []);
  await assert.rejects(repo.createAgent(alice, draft()), (e) => e.status === 503);
  assert.equal(await readFile(file, "utf8"), "{not json"); // data left for an admin to recover
});

test("withEmailStep: one-click email for agents planned before email existed", async () => {
  const { normalizeAgentConfig, agentWantsEmail, withEmailStep } = await import("../src/lib/agents/agentConfig.js");
  const { config: old } = normalizeAgentConfig({
    name: "Faculty Free Report",
    instructions: "You prepare a report.",
    steps: [
      { title: "Fetch", details: "", tool: "atlas_project.read", successCriteria: "" },
      { title: "Report", details: "", tool: "report.create_report", successCriteria: "" },
      { title: "Notify", details: "", tool: "notify.notify_owner", successCriteria: "" },
    ],
    notes: {
      missingCapabilities: ["Email sending to the owner's inbox"],
      assumptions: ["Use today's date.", "The dashboard notification will be used instead of email delivery."],
      clarifyingQuestions: [],
    },
  });
  assert.equal(agentWantsEmail(old), true);
  const { config: upgraded } = normalizeAgentConfig(withEmailStep(old));
  assert.deepEqual(upgraded.steps.map((s) => s.tool), ["atlas_project.read", "report.create_report", "email.email_owner", "notify.notify_owner"]);
  assert.deepEqual(upgraded.notes.missingCapabilities, []);
  assert.deepEqual(upgraded.notes.assumptions, ["Use today's date."]);
  assert.deepEqual(upgraded.permissions.toolsRequiringApproval, [], "sends without pausing");
  assert.match(upgraded.instructions, /email\.email_owner/);
  assert.equal(agentWantsEmail(upgraded), false);
  assert.equal(withEmailStep(upgraded), upgraded, "adding twice changes nothing");
});
