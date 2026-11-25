// Two-way ATLAS projects (CRM, Career Services): event registration, signed
// event intake, the agent mirror and agent controls. A fake project speaks the
// IntelligenceOS connector contract (atlas-agent-api/1 + events.register).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-events-"));
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONNECTOR_ENCRYPTION_KEY = "test-master-key-0123456789abcdef";

const manifest = await import("../src/lib/connectors/projects/manifest.js");
const repo = await import("../src/lib/connectors/projects/projectRepo.js");
const ev = await import("../src/lib/connectors/projects/projectEvents.js");

const KEY = "intos_fakeprojectkey_0123456789abcdef";
const admin = { id: "local-user", name: "Admin", email: "admin@atlasuniversity.edu.in", role: "admin" };
const member = { id: "u2", name: "Staff", role: "member" };

const agent = (id, extra = {}) => ({ id, kind: "routine", name: `Agent ${id}`, active: true, status: "active", capabilities: { activate: true, deactivate: true, run: true }, ...extra });

// ---- Fake Career Services ---------------------------------------------------
const seen = { connect: [], calls: [] };
const fake = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "bad key" });
    const p = req.url.replace(/^\/api\/intos\/v1/, "").split("?")[0];
    seen.calls.push(`${req.method} ${p}`);
    if (req.method === "GET" && p === "/manifest") {
      return send(200, {
        spec: "atlas-agent-api/1",
        project: { name: "ATLAS Career Services", version: "1.0" },
        key: { name: "IntelligenceOS connector key" },
        events: { register: "/connect", types: ["agent.created", "agent.run.completed"] },
        actions: [
          { id: "list_agents", name: "List agents", method: "GET", path: "/agents", risk: "read", params: [] },
          { id: "activate_agent", name: "Activate", method: "POST", path: "/agents/{agentId}/activate", params: [] },
          { id: "deactivate_agent", name: "Deactivate", method: "POST", path: "/agents/{agentId}/deactivate", params: [] },
          { id: "run_agent", name: "Run", method: "POST", path: "/agents/{agentId}/run", params: [] },
        ],
      });
    }
    if (req.method === "POST" && p === "/connect") {
      seen.connect.push(JSON.parse(raw));
      return send(200, { success: true });
    }
    if (req.method === "GET" && p === "/agents") return send(200, { success: true, agents: [agent("routine_1"), agent("automation_7", { kind: "automation", active: false, status: "paused" })] });
    const m = p.match(/^\/agents\/([^/]+)\/(activate|deactivate|run)$/);
    if (req.method === "POST" && m) {
      if (m[2] === "run") return send(200, { success: true, run: { status: "ok" }, answer: "12 interviews tomorrow." });
      return send(200, { success: true, agent: agent(decodeURIComponent(m[1]), { active: m[2] === "activate", status: m[2] === "activate" ? "active" : "paused" }), warnings: [] });
    }
    return send(404, { error: "no route" });
  });
});
let base;
let project;
before(async () => {
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${fake.address().port}/api/intos/v1`;
});
after(() => fake.close());

const headersOf = (o) => ({ get: (k) => o[String(k).toLowerCase()] ?? null });
function signed(secret, payload, extraHeaders = {}) {
  const raw = JSON.stringify(payload);
  return { raw, headers: headersOf({ "x-atlas-signature": ev.sign(secret, raw), ...extraHeaders }) };
}
const evt = (event, data, extra = {}) => ({ id: `evt_${crypto.randomBytes(6).toString("hex")}`, event, platform: "atlas-career-services", origin: "portal", occurredAt: new Date().toISOString(), data, ...extra });

// ---------------------------------------------------------------------------
test("manifest: events.register is kept; anything malformed is ignored, not fatal", () => {
  const doc = { spec: manifest.SPEC_VERSION, project: { name: "X" }, actions: [] };
  assert.deepEqual(manifest.parseManifest({ ...doc, events: { register: "/connect", types: ["agent.created", "BAD TYPE"] } }).events, { register: "/connect", types: ["agent.created"] });
  for (const bad of [{ register: "https://evil.test/x" }, { register: "/../x" }, { register: "/a/{id}" }, "nope", { types: [] }]) {
    const m = manifest.parseManifest({ ...doc, events: bad });
    assert.equal(m.events, undefined, JSON.stringify(bad));
  }
  assert.equal(manifest.parseManifest(doc).events, undefined, "one-way projects are unchanged");
});

test("connect + register: the project gets our callback and a secret; the browser never does", async () => {
  project = await repo.connectProject(admin, { name: "ATLAS Career Services", baseUrl: base, key: KEY });
  assert.deepEqual(project.manifest.events.register, "/connect");
  const out = await ev.registerEvents(project.id, { appUrl: "https://ios.atlas.test/" });
  assert.equal(out.registered, true, out.error);
  assert.equal(seen.connect.length, 1);
  const reg = seen.connect[0];
  assert.equal(reg.callbackUrl, `https://ios.atlas.test/api/connectors/projects/${project.id}/events`);
  assert.match(reg.webhookSecret, /^whsec_/);
  assert.equal(reg.platformName, "ATLAS IntelligenceOS");

  const stored = await repo.getProject(project.id);
  assert.ok(stored.eventsBox && !stored.eventsBox.includes(reg.webhookSecret), "secret stored encrypted");
  const pub = repo.publicProject(stored);
  assert.equal(pub.eventsBox, undefined);
  assert.ok(!JSON.stringify(pub).includes(reg.webhookSecret));
  const file = await readFile(path.join(process.env.DATA_DIR, "project-connections.json"), "utf8");
  assert.ok(!file.includes(reg.webhookSecret), "no plaintext secret on disk");

  await ev.registerEvents(project.id, { appUrl: "https://ios.atlas.test" });
  assert.equal(seen.connect[1].webhookSecret, reg.webhookSecret, "re-registering keeps the same secret");
});

test("registration without APP_URL is reported, not thrown", async () => {
  const out = await ev.registerEvents(project.id, { appUrl: "" });
  assert.equal(out.registered, false);
  assert.match(out.error, /APP_URL/);
  await ev.registerEvents(project.id, { appUrl: "https://ios.atlas.test" });
});

test("events: signed ones update the mirror; bad, stale and replayed ones don't", async () => {
  const secret = seen.connect.at(-1).webhookSecret;

  const created = evt("agent.created", { change: "created", agent: agent("routine_5", { name: "Morning brief", source: "intos", owner: { name: "Super", email: "s@x" } }) });
  const a = signed(secret, created);
  assert.deepEqual(await ev.receiveEvent(project.id, a.raw, a.headers), { accepted: true, event: "agent.created" });
  let m = await ev.getMirror(project.id);
  assert.deepEqual(m.agents.map((x) => x.id), ["routine_5"]);
  assert.equal(m.agents[0].source, "intos");

  // Replay of the same delivery: accepted, nothing applied twice.
  const again = await ev.receiveEvent(project.id, a.raw, a.headers);
  assert.equal(again.duplicate, true);
  assert.equal((await ev.getMirror(project.id)).log.length, 1);

  // Wrong secret / tampered body / no signature → 401.
  const forged = signed("whsec_wrong", evt("agent.deleted", { agent: agent("routine_5") }));
  await assert.rejects(ev.receiveEvent(project.id, forged.raw, forged.headers), (e) => e.status === 401);
  await assert.rejects(ev.receiveEvent(project.id, a.raw.replace("Morning", "Evening"), a.headers), (e) => e.status === 401);
  await assert.rejects(ev.receiveEvent(project.id, a.raw, headersOf({})), (e) => e.status === 401);
  await assert.rejects(ev.receiveEvent("nope", a.raw, a.headers), (e) => e.status === 404);

  // Stale event → refused.
  const old = signed(secret, evt("agent.deactivated", { agent: agent("routine_5", { active: false }) }, { occurredAt: new Date(Date.now() - 60 * 60_000).toISOString() }));
  await assert.rejects(ev.receiveEvent(project.id, old.raw, old.headers), (e) => e.status === 400);

  // Run completed → agent updated + run recorded.
  const run = signed(secret, evt("agent.run.completed", { agent: agent("routine_5", { lastStatus: "ok" }), run: { status: "ok", summary: "3 jobs close tomorrow", manual: true }, answer: "full report" }));
  await ev.receiveEvent(project.id, run.raw, run.headers);
  m = await ev.getMirror(project.id);
  assert.equal(m.runs[0].summary, "3 jobs close tomorrow");
  assert.equal(m.runs[0].agentId, "routine_5");

  // Snapshot replaces the list; delete removes one.
  const snap = signed(secret, evt("agents.snapshot", { count: 2, agents: [agent("routine_8"), agent("automation_2", { kind: "automation" }), { no: "id" }] }));
  await ev.receiveEvent(project.id, snap.raw, snap.headers);
  assert.deepEqual((await ev.getMirror(project.id)).agents.map((x) => x.id).sort(), ["automation_2", "routine_8"]);
  const del = signed(secret, evt("agent.deleted", { agent: agent("routine_8") }));
  await ev.receiveEvent(project.id, del.raw, del.headers);
  assert.deepEqual((await ev.getMirror(project.id)).agents.map((x) => x.id), ["automation_2"]);

  const p = await repo.getProject(project.id);
  assert.equal(p.events.lastEvent, "agent.deleted", "the project card shows the last event");
});

test("refresh + agent controls go through the project's own manifest actions (admin only)", async () => {
  await assert.rejects(ev.refreshMirror(member, project.id), (e) => e.status === 403);
  const m = await ev.refreshMirror(admin, project.id);
  assert.deepEqual(m.agents.map((x) => x.id).sort(), ["automation_7", "routine_1"]);

  const off = await ev.agentOp(admin, project.id, "routine_1", "deactivate");
  assert.equal(off.agent.active, false);
  assert.equal((await ev.getMirror(project.id)).agents.find((x) => x.id === "routine_1").active, false);
  const run = await ev.agentOp(admin, project.id, "routine_1", "run");
  assert.equal(run.run.status, "ok");
  assert.equal(run.answer, "12 interviews tomorrow.");
  assert.ok(seen.calls.includes("POST /agents/routine_1/deactivate"));

  await assert.rejects(ev.agentOp(admin, project.id, "routine_1", "delete"), (e) => e.status === 400);
  await assert.rejects(ev.agentOp(admin, project.id, "../x", "run"), (e) => e.status === 400);
  await assert.rejects(ev.agentOp(member, project.id, "routine_1", "run"), (e) => e.status === 403);
});

test("removing a project forgets its mirror; the callback route is public only for events", async () => {
  await ev.dropMirror(project.id);
  assert.deepEqual((await ev.getMirror(project.id)).agents, []);
  const proxy = await readFile(path.join(process.cwd(), "src/proxy.js"), "utf8");
  const line = proxy.split("\n").find((l) => l.startsWith("const PUBLIC"));
  const PUBLIC = eval(`(${line.replace(/^const PUBLIC = /, "").replace(/;$/, "")})`);
  const isPublic = (p) => PUBLIC.some((re) => re.test(p));
  assert.equal(isPublic(`/api/connectors/projects/${project.id}/events`), true);
  for (const p of [`/api/connectors/projects/${project.id}`, `/api/connectors/projects/${project.id}/agents`, `/api/connectors/projects/${project.id}/sync`, "/api/connectors/projects/x/events/y"]) {
    assert.equal(isPublic(p), false, p);
  }
});
