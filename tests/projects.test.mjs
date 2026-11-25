// ATLAS project connections (Milestone 7): key-based connect, manifest, encrypted key, agent use.
// Uses the reference add-on in examples/agent-api-node, so it also checks that the example follows the spec.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-proj-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONNECTOR_ENCRYPTION_KEY = "test-master-key-0123456789abcdef";

const box = await import("../src/lib/security/secretBox.js");
const manifest = await import("../src/lib/connectors/projects/manifest.js");
const repo = await import("../src/lib/connectors/projects/projectRepo.js");
const conn = await import("../src/lib/connectors/projects/projectConnector.js");
const { EXECUTORS } = await import("../src/lib/connectors/index.js");
const { resolveTools } = await import("../src/lib/tools/registry.js");
const agents = await import("../src/lib/agents/agentRepo.js");
const engine = await import("../src/lib/engine/runner.js");
const runs = await import("../src/lib/runs/runRepo.js");
const example = await import("../examples/agent-api-node/agentApi.mjs");

const admin = { id: "local-user", name: "Admin", role: "admin" };
const staff = { id: "u2", name: "Staff", role: "member" };

const ro = example.createKey({ name: "IOS read only", scopes: example.PRESETS.read_only });
const rw = example.createKey({ name: "IOS read write", scopes: example.PRESETS.read_write });
const api = example.createAgentApi({ keys: [ro.record, rw.record] });
let base;
before(async () => {
  await new Promise((r) => api.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${api.server.address().port}/agent-api`;
});
after(() => api.server.close());

// ---------------------------------------------------------------------------
test("secret box: round trip, tamper detection, needs a master key", () => {
  const sealed = box.encryptSecret("atl_my-secret-key");
  assert.ok(!sealed.includes("my-secret"));
  assert.equal(box.decryptSecret(sealed), "atl_my-secret-key");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered!").toString("base64");
  assert.throws(() => box.decryptSecret(parts.join(":")), /can't be decrypted/);
  const saved = process.env.CONNECTOR_ENCRYPTION_KEY;
  delete process.env.CONNECTOR_ENCRYPTION_KEY;
  try {
    assert.throws(() => box.encryptSecret("x"), /CONNECTOR_ENCRYPTION_KEY/);
  } finally {
    process.env.CONNECTOR_ENCRYPTION_KEY = saved;
  }
});

test("manifest: safety rules applied on top of what the project says", () => {
  const doc = {
    spec: manifest.SPEC_VERSION,
    project: { name: "X" },
    actions: [
      { id: "ok_read", name: "Read", method: "GET", path: "/a/{id}", risk: "read" },
      { id: "sneaky", name: "Claims read", method: "POST", path: "/b", risk: "read" },
      { id: "wipe", name: "Delete all", method: "POST", path: "/c", risk: "destructive" },
      { id: "bad_path", name: "Bad", method: "GET", path: "/../admin", risk: "read" },
      { id: "get_body", name: "GET with body", method: "GET", path: "/d", risk: "read", params: [{ name: "x", in: "body" }] },
      { id: "ok_read", name: "Duplicate", method: "GET", path: "/e", risk: "read" },
      { id: "Bad Id", name: "x", method: "GET", path: "/f" },
    ],
  };
  const m = manifest.parseManifest(doc);
  assert.deepEqual(m.actions.map((a) => [a.id, a.risk]), [["ok_read", "read"], ["sneaky", "write"]], "POST is always write");
  assert.deepEqual(m.actions[0].params, [{ name: "id", in: "path", type: "string", required: true, description: "" }], "path placeholder added as required param");
  assert.deepEqual(m.skipped.map((s) => s.id), ["wipe", "bad_path", "get_body", "ok_read", "Bad Id"]);
  assert.throws(() => manifest.parseManifest({ ...doc, spec: "other/2" }), /different Agent API version/);
  assert.throws(() => manifest.parseManifest({ spec: manifest.SPEC_VERSION }), /not valid/);
});

test("params: required, types, enums, unknown names", () => {
  const action = {
    id: "a",
    params: [
      { name: "id", in: "path", type: "string", required: true },
      { name: "limit", in: "query", type: "integer" },
      { name: "status", in: "body", type: "string", enum: ["new", "won"] },
    ],
  };
  assert.deepEqual(manifest.checkParams(action, { id: "L1", limit: "5", status: "won" }), { path: { id: "L1" }, query: { limit: 5 }, body: { status: "won" } });
  assert.throws(() => manifest.checkParams(action, {}), /Missing required parameter "id"/);
  assert.throws(() => manifest.checkParams(action, { id: "1", limit: 1.5 }), /whole number/);
  assert.throws(() => manifest.checkParams(action, { id: "1", status: "deleted" }), /one of: new, won/);
  assert.throws(() => manifest.checkParams(action, { id: "1", url: "x" }), /Unknown parameter "url"/);
  assert.throws(() => manifest.checkParams(action, { id: ".." }), /Invalid value/);
});

test("connect: validation, wrong key, wrong URL, admin only", async () => {
  await assert.rejects(repo.connectProject(staff, { name: "CRM", baseUrl: base, key: ro.key }), (e) => e.status === 403);
  await assert.rejects(repo.connectProject(admin, { name: "", baseUrl: "http://example.com", key: "short" }), (e) => {
    assert.ok(e.fields.name && e.fields.baseUrl && e.fields.key, JSON.stringify(e.fields));
    return true;
  });
  await assert.rejects(repo.connectProject(admin, { name: "CRM", baseUrl: base, key: "atl_wrong-key-0000000000000" }), /rejected this key/);
  await assert.rejects(repo.connectProject(admin, { name: "CRM", baseUrl: `${base}/nope`, key: ro.key }), /No Agent API found/);
  assert.equal((await repo.listProjects()).length, 0, "nothing saved on failure");
});

test("connect with a read-only key: shows exactly what the key allows; key stored encrypted", async () => {
  const p = await repo.connectProject(admin, { name: "ATLAS CRM", baseUrl: `${base}/`, key: ro.key });
  assert.equal(p.id, "atlas_crm");
  assert.equal(p.baseUrl, base);
  assert.equal(p.manifest.key.access, "Read only");
  assert.deepEqual(p.manifest.actions.map((a) => a.id), ["search_leads", "get_lead", "list_followups", "lead_report"]);
  const pub = repo.publicProject(p);
  assert.equal(pub.keyHint, `••••${ro.key.slice(-4)}`);
  assert.equal(pub.keyBox, undefined);
  const file = await readFile(path.join(process.env.DATA_DIR, "project-connections.json"), "utf8");
  assert.ok(!file.includes(ro.key), "the key is never stored in plain text");
  await assert.rejects(repo.connectProject(admin, { name: "CRM again", baseUrl: base, key: ro.key }), /already connected/);

  const { ready, extra } = await resolveTools(["atlas_project.read", "atlas_project.write"], EXECUTORS);
  assert.ok(ready.has("atlas_project.read"));
  assert.ok(!ready.has("atlas_project.write"), "no write actions with a read-only key");
  assert.match(extra["atlas_project.read"], /Project "atlas_crm"[\s\S]*action "search_leads"[\s\S]*status \(string: new\|contacted\|won\|lost\)/);
});

test("calling actions: data comes back, read/write kept apart, key never leaks", async () => {
  const r = await conn.callAction({ projectId: "atlas_crm", actionId: "search_leads", tool: "read", params: { status: "new" }, run: { id: "run_1", agentName: "Lead bot" } });
  assert.equal(r.data.total, 2);
  assert.equal(api.log.at(-1).agent, "Lead bot", "the project can see which agent called");
  assert.ok(!JSON.stringify(r).includes(ro.key));
  await assert.rejects(conn.callAction({ projectId: "atlas_crm", actionId: "add_lead_note", tool: "write", params: { id: "L101", note: "x" } }), /not allowed in ATLAS CRM/);
  await assert.rejects(conn.callAction({ projectId: "atlas_crm", actionId: "get_lead", tool: "read", params: {} }), /Missing required parameter "id"/);
  await assert.rejects(conn.callAction({ projectId: "nope", actionId: "x", tool: "read" }), /Unknown project/);
});

test("agent locked to chosen connectors: other projects are hidden and refused", async () => {
  const other = await resolveTools(["atlas_project.read"], EXECUTORS, { projectIds: ["some_other_project"] });
  assert.equal(other.ready.size, 0, "a locked agent does not fall back to other projects");
  const mine = await resolveTools(["atlas_project.read"], EXECUTORS, { projectIds: ["atlas_crm"] });
  assert.ok(mine.ready.has("atlas_project.read"));
  assert.match(mine.extra["atlas_project.read"], /atlas_crm/);
  const read = EXECUTORS["atlas_project.read"];
  await assert.rejects(
    read.execute({ project: "atlas_crm", action: "search_leads", params: {} }, { run: { id: "r", agentName: "x", projectIds: ["erp"] } }),
    /not one of this agent's connectors/,
  );
  const ok = await read.execute({ project: "atlas_crm", action: "search_leads", params: {} }, { run: { id: "r", agentName: "x", projectIds: ["atlas_crm"] } });
  assert.equal(ok.status, 200);
});

test("replace the key with a read+write key: write actions appear; read tool can't run them", async () => {
  await repo.updateProject(admin, "atlas_crm", { key: rw.key });
  const p = await repo.getProject("atlas_crm");
  assert.equal(p.manifest.key.access, "Read and write");
  assert.ok(p.manifest.actions.some((a) => a.id === "update_lead_status" && a.risk === "write"));
  await assert.rejects(conn.callAction({ projectId: "atlas_crm", actionId: "add_lead_note", tool: "read", params: { id: "L101", note: "x" } }), /Use atlas_project.write/);
  await assert.rejects(conn.callAction({ projectId: "atlas_crm", actionId: "search_leads", tool: "write" }), /Use atlas_project.read/);
  await assert.rejects(repo.updateProject(admin, "atlas_crm", { key: "atl_wrong-key-0000000000000" }), /rejected this key/);
  assert.equal((await repo.getProject("atlas_crm")).keyLast4, rw.key.slice(-4), "a bad replacement key changes nothing");
});

// ---------------------------------------------------------------------------
function fakeModel(replies) {
  const calls = [];
  const fn = async (_m, opts) => {
    calls.push({ tools: opts.tools.map((t) => t.name), descriptions: opts.tools.map((t) => t.description) });
    const r = replies.shift();
    if (!r) throw new Error("fake model: no more replies");
    return { text: "", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0, latencyMs: 1, model: "fake", ...r };
  };
  fn.calls = calls;
  return fn;
}
const call = (name, args) => ({ toolCalls: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args }] });
const deps = (model) => ({ callModel: model, executors: EXECUTORS, notify: async () => {} });

test("engine: agent reads the CRM, then a status change waits for approval and is applied", async () => {
  const agent = await agents.createAgent(
    admin,
    {
      name: "Lead follow-up",
      description: "",
      instructions: "Check new leads and mark L103 contacted.",
      steps: [
        { title: "Find new leads", tool: "atlas_project.read" },
        { title: "Update status", tool: "atlas_project.write" },
      ],
      trigger: { type: "manual", schedule: null },
    },
    { activate: true },
  );
  const model = fakeModel([
    call("atlas_project__read", { project: "atlas_crm", action: "search_leads", params: { status: "new" } }),
    call("atlas_project__write", { project: "atlas_crm", action: "update_lead_status", params: { id: "L103", status: "contacted" } }),
    { text: "2 new leads; L103 marked contacted." },
  ]);
  const run = await engine.startRun(admin, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps(model));
  let r = await runs.loadRun(run.id);
  assert.equal(r.status, "waiting_approval");
  assert.equal(api.db.leads.find((l) => l.id === "L103").status, "new", "nothing changed before approval");
  assert.match(model.calls[0].descriptions.join("\n"), /action "update_lead_status"/);
  await engine.decideApproval(admin, run.id, { decision: "approve" });
  await engine.executeRun(run.id, deps(model));
  r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded", r.error);
  assert.equal(api.db.leads.find((l) => l.id === "L103").status, "contacted");
  assert.ok(!JSON.stringify(r).includes(rw.key), "key never stored in the run");
});

test("revoked key: the run reports it, the project card shows the error, agents stop using it", async () => {
  rw.record.revoked = true;
  const agent = (await agents.listAgents(admin)).find((a) => a.config.name === "Lead follow-up");
  const model = fakeModel([call("atlas_project__read", { project: "atlas_crm", action: "lead_report" }), { text: "Could not read." }]);
  const run = await engine.startRun(admin, agent.id, { mode: "test" });
  await engine.executeRun(run.id, deps(model));
  const r = await runs.loadRun(run.id);
  assert.match(r.messages.filter((m) => m.role === "tool")[0].content, /rejected the key/);
  const p = await repo.getProject("atlas_crm");
  assert.equal(p.status, "error");
  assert.equal(repo.publicProject(p).usable, false);
  assert.equal((await resolveTools(["atlas_project.read"], EXECUTORS)).ready.size, 0);
  const synced = await repo.syncProject(admin, "atlas_crm");
  assert.match(synced.lastError, /rejected this key/);
  rw.record.revoked = false;
  assert.equal((await repo.syncProject(admin, "atlas_crm")).status, "connected", "re-sync recovers once the key works");
});

test("disable and delete", async () => {
  await repo.updateProject(admin, "atlas_crm", { enabled: false });
  await assert.rejects(conn.callAction({ projectId: "atlas_crm", actionId: "lead_report", tool: "read" }), /disabled/);
  await assert.rejects(repo.deleteProject(staff, "atlas_crm"), (e) => e.status === 403);
  await repo.deleteProject(admin, "atlas_crm");
  assert.equal((await repo.listProjects()).length, 0);
});
