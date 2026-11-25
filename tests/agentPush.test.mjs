// §2c: IntelligenceOS agents pushed to the ATLAS projects that list them.
// A fake project speaks atlas-agent-api/1 + intosAgents.push.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-push-"));
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONNECTOR_ENCRYPTION_KEY = "test-master-key-0123456789abcdef";
process.env.APP_URL = "https://ios.atlas.test";

const manifest = await import("../src/lib/connectors/projects/manifest.js");
const repo = await import("../src/lib/connectors/projects/projectRepo.js");
const agents = await import("../src/lib/agents/agentRepo.js");
const push = await import("../src/lib/connectors/projects/agentPush.js");

const KEY = "intos_fakeprojectkey_0123456789abcdef";
const admin = { id: "local-user", name: "Admin", email: "admin@atlasuniversity.edu.in", role: "admin" };
const alice = { id: "alice", name: "Alice", role: "user" };

const draft = (over = {}) => ({
  name: "Daily PR digest",
  description: "Summarises purchase requests.",
  instructions: "Read open purchase requests.",
  steps: [{ title: "Read requests", details: "", tool: "atlas_project.read", successCriteria: "" }],
  trigger: { type: "manual", schedule: null },
  ...over,
});

let fail = false;
const received = [];
const fake = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "bad key" });
    assert.equal(req.headers["x-intelligenceos-user"], undefined, "pushes never act as a user");
    const p = req.url.replace(/^\/agent-api/, "");
    if (req.method === "GET" && p === "/manifest") {
      return send(200, {
        spec: "atlas-agent-api/1",
        project: { name: "ATLAS Procurement" },
        intosAgents: { push: "/intos-agents" },
        actions: [{ id: "list_requests", name: "List requests", method: "GET", path: "/requests", risk: "read", params: [] }],
      });
    }
    if (req.method === "POST" && p === "/intos-agents") {
      if (fail) return send(503, { error: "maintenance" });
      received.push(JSON.parse(raw));
      return send(200, { ok: true });
    }
    return send(404, { error: "no route" });
  });
});
let base;
let project;
before(async () => {
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${fake.address().port}/agent-api`;
  project = await repo.connectProject(admin, { name: "ATLAS Procurement", baseUrl: base, key: KEY });
});
after(() => fake.close());

test("manifest: intosAgents.push is kept; malformed values are ignored, not fatal", () => {
  const doc = { spec: manifest.SPEC_VERSION, project: { name: "X" }, actions: [] };
  assert.deepEqual(manifest.parseManifest({ ...doc, intosAgents: { push: "/intos-agents" } }).intosAgents, { push: "/intos-agents" });
  for (const bad of [{ push: "https://evil.test/x" }, { push: "/../x" }, { push: "/a/{id}" }, "nope", {}]) {
    assert.equal(manifest.parseManifest({ ...doc, intosAgents: bad }).intosAgents, undefined, JSON.stringify(bad));
  }
  assert.equal(project.manifest.intosAgents.push, "/intos-agents");
});

test("usesProject: needs an ATLAS-project tool, and an empty list means every project", async () => {
  const any = await agents.createAgent(alice, draft());
  const other = await agents.createAgent(alice, draft({ connectors: { projects: ["atlas_crm"] } }));
  const mine = await agents.createAgent(alice, draft({ connectors: { projects: [project.id] } }));
  const none = await agents.createAgent(alice, draft({ steps: [{ title: "Report", tool: "report.create_report" }] }));
  assert.equal(push.usesProject(any, project.id), true);
  assert.equal(push.usesProject(other, project.id), false);
  assert.equal(push.usesProject(mine, project.id), true);
  assert.equal(push.usesProject(none, project.id), false);
  for (const a of [any, other, mine, none]) await agents.deleteAgent(admin, a.id);
});

test("toIntosAgent: the spec's shape, bounded, with a link back", async () => {
  const rec = await agents.createAgent(alice, draft({ name: "x".repeat(140), steps: [{ title: "Change", tool: "atlas_project.write" }] }), { activate: true });
  const a = push.toIntosAgent(rec, { owner: { name: "Alice", email: "alice@atlas.test" }, appUrl: "https://ios.atlas.test" });
  assert.equal(a.id, rec.id);
  assert.equal(a.status, "active");
  assert.equal(a.trigger, "manual");
  assert.equal(a.scheduleText, "Run manually");
  assert.equal(a.writes, true);
  assert.deepEqual(a.owner, { name: "Alice", email: "alice@atlas.test" });
  assert.equal(a.url, `https://ios.atlas.test/agents/${rec.id}`);
  assert.ok(a.name.length <= 150);
  await agents.deleteAgent(admin, rec.id);
});

test("snapshot, upsert, delete-when-unused and delete are sent; the outcome is kept on the project", async () => {
  received.length = 0;
  const a = await agents.createAgent(alice, draft());
  const b = await agents.createAgent(alice, draft({ name: "CRM only", connectors: { projects: ["atlas_crm"] } }));

  const out = await push.pushSnapshot(project.id);
  assert.equal(out.ok, true);
  assert.equal(out.count, 1);
  assert.equal(received[0].event, "agents.snapshot");
  assert.deepEqual(received[0].agents.map((x) => x.id), [a.id]);
  assert.equal(received[0].platformName, "ATLAS IntelligenceOS");
  assert.deepEqual((await repo.getProject(project.id)).agentPush.ids, [a.id]);

  // An agent that does not use the project and was never sent: nothing to send.
  await push.pushAgentChange(b);
  assert.equal(received.length, 1);

  // Paused → upsert with the new status.
  const paused = await agents.setAgentStatus(alice, a.id, "activate").then(() => agents.setAgentStatus(alice, a.id, "pause"));
  await push.pushAgentChange(paused);
  assert.equal(received[1].event, "agent.upserted");
  assert.equal(received[1].agent.status, "paused");

  // No longer uses the project → the project is told to forget it.
  const moved = await agents.updateAgent(alice, a.id, draft({ connectors: { projects: ["atlas_crm"] } }));
  await push.pushAgentChange(moved);
  assert.deepEqual(received[2], { ...received[2], event: "agent.deleted", agentId: a.id });
  assert.deepEqual((await repo.getProject(project.id)).agentPush.ids, []);

  // Deleted while not held → nothing sent.
  await agents.deleteAgent(admin, a.id);
  await push.pushAgentChange({ id: a.id }, { deleted: true });
  assert.equal(received.length, 3);
  await agents.deleteAgent(admin, b.id);
});

test("a failing project is recorded, never thrown; held ids only move on success", async () => {
  received.length = 0;
  const a = await agents.createAgent(alice, draft());
  await push.pushSnapshot(project.id);
  fail = true;
  await push.pushAgentChange({ id: a.id }, { deleted: true });
  let p = await repo.getProject(project.id);
  assert.equal(p.agentPush.ok, false);
  assert.match(p.agentPush.error, /HTTP 503: maintenance/);
  assert.deepEqual(p.agentPush.ids, [a.id], "still held: the delete did not land");
  fail = false;
  await agents.deleteAgent(admin, a.id);
  await push.pushAgentChange({ id: a.id }, { deleted: true });
  p = await repo.getProject(project.id);
  assert.equal(p.agentPush.ok, true);
  assert.deepEqual(p.agentPush.ids, []);
  assert.ok(!JSON.stringify(repo.publicProject(p)).includes(KEY));
});

test("disabled projects get nothing", async () => {
  await repo.updateProject(admin, project.id, { enabled: false });
  received.length = 0;
  const a = await agents.createAgent(alice, draft());
  await push.pushAgentChange(a);
  assert.equal(await push.pushSnapshot(project.id), null);
  assert.equal(received.length, 0);
  await repo.updateProject(admin, project.id, { enabled: true });
});
