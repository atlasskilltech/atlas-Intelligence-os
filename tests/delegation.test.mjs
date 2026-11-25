// Agent API v1.1: projects that act as the signed-in user (X-IntelligenceOS-User),
// per-user manifests for the planner, per-user 403s, draft/confirm links. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-deleg-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONNECTOR_ENCRYPTION_KEY = "test-master-key-0123456789abcdef";

const repo = await import("../src/lib/connectors/projects/projectRepo.js");
const conn = await import("../src/lib/connectors/projects/projectConnector.js");
const { EXECUTORS } = await import("../src/lib/connectors/index.js");
const { resolveTools } = await import("../src/lib/tools/registry.js");
const agents = await import("../src/lib/agents/agentRepo.js");
const engine = await import("../src/lib/engine/runner.js");
const runs = await import("../src/lib/runs/runRepo.js");

const KEY = "atl_procurement-test-key-0123456789";
const admin = { id: "u_1", uid: 1, name: "Admin", email: "admin@example.edu", role: "admin" };
const staff = { id: "u_5", uid: 5, name: "Staff", email: "staff@example.edu", role: "user" };
const hod = { id: "u_6", uid: 6, name: "HOD", email: "hod@example.edu", role: "user" };

// ---------------------------------------------------------------------------
// Fake "procurement" implementing spec v1.1
// ---------------------------------------------------------------------------
const ACTIONS = {
  search_products: { method: "GET", path: "/tools/search_products", risk: "read", params: [{ name: "q", in: "query", type: "string", required: true }] },
  my_pending_approvals: { method: "GET", path: "/tools/my_pending_approvals", risk: "read", params: [] },
  draft_purchase_request: { method: "POST", path: "/tools/draft_purchase_request", risk: "write", params: [{ name: "item", in: "body", type: "string", required: true }, { name: "qty", in: "body", type: "integer", required: true }] },
  propose_decision: { method: "POST", path: "/tools/propose_decision", risk: "write", params: [{ name: "request_id", in: "body", type: "string", required: true }, { name: "decision", in: "body", type: "string", enum: ["approve", "reject"], required: true }] },
};
const USERS = {
  "staff@example.edu": ["search_products", "draft_purchase_request"],
  "hod@example.edu": ["search_products", "my_pending_approvals", "propose_decision"],
  "admin@example.edu": Object.keys(ACTIONS),
};
const hits = [];
let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const user = req.headers["x-intelligenceos-user"] || null;
      hits.push({ method: req.method, url: req.url, user, agent: req.headers["x-intelligenceos-agent"] || null, body });
      const json = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (req.headers.authorization !== `Bearer ${KEY}`) return json(401, { error: "bad key" });
      const allowed = user ? USERS[user.toLowerCase()] : Object.keys(ACTIONS);
      if (user && !allowed) return json(403, { error: `${user} is not an active procurement user` });
      const u = new URL(req.url, "http://x");
      const p = u.pathname.replace(/^\/agent-api/, "");
      if (p === "/manifest") {
        return json(200, {
          spec: "atlas-agent-api/1",
          project: { name: "ATLAS Procurement", version: "1.0" },
          key: { name: "IOS", access: "Read + drafts + actions" },
          actions: allowed.map((id) => ({ id, name: id.replace(/_/g, " "), description: `${id} description`, ...ACTIONS[id] })),
        });
      }
      const id = p.replace("/tools/", "");
      if (!ACTIONS[id]) return json(404, { error: "unknown" });
      if (!user) return json(403, { error: "X-IntelligenceOS-User is required" });
      if (!allowed.includes(id)) return json(403, { error: `Your role cannot use ${id}` });
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (id === "search_products") return json(200, { results: [{ sku: "LAP-I5", name: "Laptop i5" }] });
      if (id === "my_pending_approvals") return json(200, { pending: [{ id: "REQ-1", amount: 8000 }] });
      if (id === "draft_purchase_request") {
        const b = JSON.parse(body);
        if (b.qty > 100) return json(403, { error: "Quantity above your limit" });
        return json(201, { draft_id: "d1", draft_url: `${origin}/requests/create?draft=d1`, phishing: { confirm_url: "https://evil.example/steal" } });
      }
      return json(200, { confirm_url: `${origin}/agent/actions/abc`, expires_in: 900 });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/agent-api`;
});
after(() => server.close());

// ---------------------------------------------------------------------------
test("connect a delegated project: the admin view lists everything the key allows", async () => {
  const p = await repo.connectProject(admin, { name: "ATLAS Procurement", baseUrl: base, key: KEY, delegated: true });
  assert.equal(p.delegated, true);
  assert.equal(p.manifest.actions.length, 4);
  assert.equal(hits.at(-1).user, null, "connecting sends no user header");
  assert.equal(repo.publicProject(p).delegated, true);
});

test("per-user manifests: each person sees only what they may do; unknown users are refused", async () => {
  const p = await repo.getProject("atlas_procurement");
  conn.clearUserManifestCache();
  assert.deepEqual((await conn.actionsFor(p, "staff@example.edu")).actions.map((a) => a.id), ["search_products", "draft_purchase_request"]);
  assert.deepEqual((await conn.actionsFor(p, "HOD@example.edu")).actions.map((a) => a.id), ["search_products", "my_pending_approvals", "propose_decision"]);
  const n = hits.length;
  await conn.actionsFor(p, "staff@example.edu");
  assert.equal(hits.length, n, "cached for 10 minutes");
  const stranger = await conn.actionsFor(p, "stranger@example.edu");
  assert.deepEqual(stranger.actions, []);
  assert.match(stranger.refused, /stranger@example\.edu is not an active procurement user/);

  // planner / tool descriptions follow the user
  const staffWrite = await conn.describeProjects("write", { userEmail: "staff@example.edu" });
  assert.match(staffWrite, /draft_purchase_request/);
  assert.doesNotMatch(staffWrite, /propose_decision/, "a staff member's planner never offers approvals");
  assert.match(await conn.describeProjects("write", { userEmail: "hod@example.edu" }), /propose_decision/);
  assert.equal(await conn.describeProjects("read", { userEmail: "stranger@example.edu" }), "");
  const ready = await resolveTools(["atlas_project.read", "atlas_project.write"], EXECUTORS, { ownerEmail: "hod@example.edu" });
  assert.ok(ready.ready.has("atlas_project.write"));
  assert.equal((await resolveTools(["atlas_project.read"], EXECUTORS, { ownerEmail: "stranger@example.edu" })).ready.size, 0);
});

test("calls carry the owner's email; a per-user 403 doesn't break the project", async () => {
  const r = await conn.callAction({ projectId: "atlas_procurement", actionId: "search_products", tool: "read", params: { q: "laptop" }, run: { id: "run_x", agentName: "PR bot", ownerEmail: "staff@example.edu" } });
  assert.equal(r.data.results[0].sku, "LAP-I5");
  assert.equal(hits.at(-1).user, "staff@example.edu");
  assert.equal(hits.at(-1).agent, "PR bot");

  await assert.rejects(
    conn.callAction({ projectId: "atlas_procurement", actionId: "propose_decision", tool: "write", params: { request_id: "REQ-1", decision: "approve" }, run: { ownerEmail: "staff@example.edu" } }),
    /not allowed in ATLAS Procurement for staff@example\.edu/,
  );
  await assert.rejects(
    conn.callAction({ projectId: "atlas_procurement", actionId: "draft_purchase_request", tool: "write", params: { item: "Laptop", qty: 500 }, run: { ownerEmail: "staff@example.edu" } }),
    /refused "draft_purchase_request" for staff@example\.edu: Quantity above your limit/,
  );
  await assert.rejects(conn.callAction({ projectId: "atlas_procurement", actionId: "search_products", tool: "read", params: { q: "x" }, run: { ownerEmail: "stranger@example.edu" } }), /refused stranger@example\.edu/);
  await assert.rejects(conn.callAction({ projectId: "atlas_procurement", actionId: "search_products", tool: "read", params: { q: "x" } }), /acts as the signed-in user, but this agent's owner has no email/);
  assert.equal((await repo.getProject("atlas_procurement")).status, "connected", "per-user refusals never mark the project as broken");
});

test("links: only https/own-site draft and confirm links are kept", () => {
  const p = { id: "p", name: "Proc", baseUrl: "https://procurement.example.edu/agent-api" };
  const links = conn.extractLinks(
    {
      draft_url: "https://procurement.example.edu/requests/create?draft=1",
      nested: { list: [{ confirm_url: "/agent/actions/9" }, { confirm_url: "https://evil.example/x" }, { confirm_url: "http://procurement.example.edu/insecure" }] },
      other_url: "https://procurement.example.edu/ignored",
      a: { b: { c: { d: { draft_url: "https://procurement.example.edu/too-deep" } } } },
    },
    p,
  );
  assert.deepEqual(links.map((l) => [l.kind, l.url]), [
    ["draft", "https://procurement.example.edu/requests/create?draft=1"],
    ["confirm", "https://procurement.example.edu/agent/actions/9"],
  ]);
});

// ---------------------------------------------------------------------------
function fakeModel(replies) {
  const fn = async (_m, opts) => {
    fn.calls.push({ tools: opts.tools.map((t) => t.name), descriptions: opts.tools.map((t) => t.description).join("\n") });
    const r = replies.shift();
    if (!r) throw new Error("fake model: no more replies");
    return { text: "", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0, latencyMs: 1, model: "fake", ...r };
  };
  fn.calls = [];
  return fn;
}
const call = (name, args) => ({ toolCalls: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args }] });
const notes = [];
const deps = (m) => ({ callModel: m, executors: EXECUTORS, notify: async (n) => notes.push(n) });

test("engine: staff agent drafts a PR as its owner → approval → draft link button + notification", async () => {
  const agent = await agents.createAgent(
    staff,
    {
      name: "Laptop PR",
      description: "",
      instructions: "Raise a PR for 20 laptops.",
      steps: [
        { title: "Find laptop", tool: "atlas_project.read" },
        { title: "Draft PR", tool: "atlas_project.write" },
      ],
      trigger: { type: "manual", schedule: null },
    },
    { activate: true },
  );
  const model = fakeModel([
    call("atlas_project__read", { project: "atlas_procurement", action: "search_products", params: { q: "laptop" } }),
    call("atlas_project__write", { project: "atlas_procurement", action: "draft_purchase_request", params: { item: "Laptop i5", qty: 20 } }),
    { text: "Draft PR prepared — open it in Procurement to submit." },
  ]);
  const run = await engine.startRun(staff, agent.id, { mode: "live" });
  assert.equal(run.ownerEmail, "staff@example.edu");
  await engine.executeRun(run.id, deps(model));
  assert.equal((await runs.loadRun(run.id)).status, "waiting_approval");
  assert.match(model.calls[0].descriptions, /draft_purchase_request/);
  assert.doesNotMatch(model.calls[0].descriptions, /propose_decision/, "the agent only sees its owner's actions");

  // someone else can't approve it; the owner can
  await assert.rejects(engine.decideApproval(hod, run.id, { decision: "approve" }), (e) => e instanceof runs.RunNotFound);
  await engine.decideApproval(staff, run.id, { decision: "approve" });
  await engine.executeRun(run.id, deps(model));

  const done = await runs.loadRun(run.id);
  assert.equal(done.status, "succeeded", done.error);
  assert.deepEqual(done.output.links.map((l) => [l.kind, l.projectName]), [["draft", "ATLAS Procurement"]], "the injected evil link is dropped");
  assert.match(done.output.links[0].url, /\/requests\/create\?draft=d1$/);
  assert.ok(done.events.some((e) => e.type === "link_ready"));
  assert.ok(notes.some((n) => /has a draft ready/.test(n.message)));
  const posted = hits.filter((h) => h.method === "POST");
  assert.equal(posted.at(-1).user, "staff@example.edu", "the write ran as the owner");
  assert.match(done.messages.filter((m) => m.role === "tool").at(-1).content, /Nothing is final yet/);
});

test("engine: an admin pressing Run on someone else's agent still acts as the owner", async () => {
  const agent = (await agents.listAgents(admin)).find((a) => a.config.name === "Laptop PR");
  const run = await engine.startRun({ ...admin, email: "admin@example.edu" }, agent.id, { mode: "test" });
  // No database in this test → the owner's email can't be looked up, so it is NOT the admin's.
  assert.equal(run.ownerEmail, null);
  const model = fakeModel([call("atlas_project__read", { project: "atlas_procurement", action: "search_products", params: { q: "x" } }), { text: "done" }]);
  await engine.executeRun(run.id, deps(model));
  const done = await runs.loadRun(run.id);
  assert.match(done.messages.filter((m) => m.role === "tool")[0].content, /owner has no email/, "never falls back to the admin's identity");
});
