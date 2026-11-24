// Connector framework + custom REST API connector tests (Milestone 6). Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-conn-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test";
process.env.CONNECTOR_SECRET_TEST_API = "super-secret-token-987654";

const guard = await import("../src/lib/security/netGuard.js");
const repo = await import("../src/lib/connectors/http/apiConnectionRepo.js");
const httpConn = await import("../src/lib/connectors/http/httpApiConnector.js");
const { defineConnector } = await import("../src/lib/connectors/defineConnector.js");
const { EXECUTORS, connectorOverview } = await import("../src/lib/connectors/index.js");
const { resolveTools } = await import("../src/lib/tools/registry.js");
const agents = await import("../src/lib/agents/agentRepo.js");
const engine = await import("../src/lib/engine/runner.js");
const runs = await import("../src/lib/runs/runRepo.js");

const admin = { id: "local-user", name: "Admin", role: "admin" };
const staff = { id: "u2", name: "Staff", role: "member" };

// ---------------------------------------------------------------------------
// Local test API
// ---------------------------------------------------------------------------
const hits = [];
let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ method: req.method, url: req.url, auth: req.headers.authorization, key: req.headers["x-api-key"], body });
      const u = new URL(req.url, "http://x");
      const json = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (u.pathname.startsWith("/v1/staff/")) return json(200, { id: decodeURIComponent(u.pathname.slice(10)), dept: u.searchParams.get("dept") });
      if (u.pathname === "/v1/echo-auth") return json(200, { youSent: req.headers.authorization });
      if (u.pathname === "/v1/missing") return json(404, { error: "no such record" });
      if (u.pathname === "/v1/to-metadata") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      }
      if (u.pathname === "/v1/to-localhost") {
        res.writeHead(302, { Location: `http://localhost:${server.address().port}/v1/staff/1` });
        return res.end();
      }
      if (u.pathname === "/v1/hop") {
        res.writeHead(302, { Location: "/v1/staff/hopped" });
        return res.end();
      }
      if (u.pathname === "/v1/big") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("x".repeat(1_200_000));
      }
      if (u.pathname === "/v1/notes" && req.method === "POST") return json(201, { saved: true, received: JSON.parse(body || "{}") });
      json(404, { error: "not found" });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/v1`;
});
after(() => server.close());

const connectionInput = (over = {}) => ({
  id: "test_api",
  name: "Test API",
  description: "Staff directory for tests.",
  baseUrl: `${base}/`,
  auth: { type: "bearer", secretEnv: "CONNECTOR_SECRET_TEST_API" },
  endpoints: [
    { id: "get_staff", name: "Get staff", method: "GET", path: "/staff/{id}", queryParams: ["dept"] },
    { id: "echo_auth", name: "Echo auth", method: "GET", path: "/echo-auth" },
    { id: "missing", name: "Missing", method: "GET", path: "/missing" },
    { id: "to_metadata", name: "Redirect to metadata", method: "GET", path: "/to-metadata" },
    { id: "to_localhost", name: "Redirect to localhost", method: "GET", path: "/to-localhost" },
    { id: "hop", name: "Same-site redirect", method: "GET", path: "/hop" },
    { id: "big", name: "Big", method: "GET", path: "/big" },
    { id: "add_note", name: "Add note", method: "POST", path: "/notes" },
  ],
  ...over,
});

// ---------------------------------------------------------------------------
test("network guard: private address detection", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(guard.isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "142.250.183.14", "2606:4700:4700::1111"]) assert.equal(guard.isPrivateAddress(ip), false, ip);
});

test("network guard: URL rules", () => {
  assert.ok(guard.checkUrl("https://api.example.com/v1"));
  assert.ok(guard.checkUrl("http://127.0.0.1:8080/x"), "internal-allowed host may use http");
  assert.ok(guard.checkUrl("http://intranet.atlas.test/x"));
  assert.throws(() => guard.checkUrl("http://api.example.com"), /https/);
  assert.throws(() => guard.checkUrl("ftp://api.example.com"), /https/);
  assert.throws(() => guard.checkUrl("https://user:pw@api.example.com"), /username or password/);
  assert.throws(() => guard.checkUrl("https://10.0.0.5/"), /private network/);
  assert.throws(() => guard.checkUrl("https://169.254.169.254/"), /private network/);
  assert.throws(() => guard.checkUrl("https://localhost/"), /INTERNAL_ALLOWED_HOSTS/);
  assert.throws(() => guard.checkUrl("not a url"), /valid URL/);
});

test("connection validation", () => {
  const ok = repo.validateConnection(connectionInput());
  assert.equal(ok.baseUrl, base, "trailing slash removed");

  const bad = (over, field) => {
    try {
      repo.validateConnection(connectionInput(over));
      assert.fail("expected a validation error");
    } catch (err) {
      assert.ok(err instanceof repo.ConnectionError, err.message);
      assert.ok(err.fields[field], `expected error on ${field}, got ${JSON.stringify(err.fields)}`);
    }
  };
  bad({ id: "Bad Id" }, "id");
  bad({ baseUrl: "http://api.example.com" }, "baseUrl");
  bad({ baseUrl: "https://api.example.com/v1?key=1" }, "baseUrl");
  bad({ auth: { type: "bearer", secretEnv: "OPENAI_API_KEY" } }, "auth.secretEnv"); // can't point at other secrets
  bad({ auth: { type: "header", headerName: "Cookie", secretEnv: "CONNECTOR_SECRET_X" } }, "auth.headerName");
  bad({ endpoints: [] }, "endpoints");
  bad({ endpoints: [{ id: "a1", name: "A", method: "GET", path: "/../admin" }] }, "endpoints.0.path");
  bad({ endpoints: [{ id: "a1", name: "A", method: "GET", path: "/x/{id" }] }, "endpoints.0.path");
  bad({ endpoints: [{ id: "a1", name: "A", method: "DELETE", path: "/x" }] }, "endpoints.0.method");
  bad(
    {
      endpoints: [
        { id: "a1", name: "A", method: "GET", path: "/a" },
        { id: "a1", name: "B", method: "GET", path: "/b" },
      ],
    },
    "endpoints.1.id",
  );
  bad({ endpoints: [{ id: "a1", name: "A", method: "GET", path: "/x/{id}", queryParams: ["id"] }] }, "endpoints.0.queryParams");
});

test("URL building: values can't escape the path; only allowed params", () => {
  const c = repo.validateConnection(connectionInput());
  const ep = c.endpoints[0];
  assert.equal(httpConn.buildUrl(c, ep, { id: "../admin/x", dept: "IT" }).toString(), `${base}/staff/..%2Fadmin%2Fx?dept=IT`);
  assert.throws(() => httpConn.buildUrl(c, ep, { id: "1", url: "http://evil" }), /Unknown parameter "url"/);
  assert.throws(() => httpConn.buildUrl(c, ep, {}), /Missing required path parameter "id"/);
  assert.throws(() => httpConn.buildUrl(c, ep, { id: ".." }), /Invalid value/);
  assert.throws(() => httpConn.buildUrl(c, ep, { id: { a: 1 } }), /text or a number/);
});

test("defineConnector refuses actions that are not in the catalog", () => {
  const exec = { parameters: { type: "object" }, execute: async () => ({}) };
  assert.throws(() => defineConnector({ id: "nope", actions: {} }), /not in the tool catalog/);
  assert.throws(() => defineConnector({ id: "http_api", actions: { delete_all: exec } }), /not in the tool catalog/);
  assert.throws(() => defineConnector({ id: "http_api", actions: { get: { execute: async () => {} } } }), /parameters/);
});

test("no APIs yet: REST tools are not ready, so agents skip them", async () => {
  const { ready } = await resolveTools(["http_api.get", "report.create_report"], EXECUTORS);
  assert.deepEqual([...ready], ["report.create_report"]);
  const overview = await connectorOverview();
  const rest = overview.find((c) => c.id === "http_api");
  assert.equal(rest.ready, false);
  assert.equal(overview.some((c) => c.id === "gmail"), false, "unbuilt connectors are not listed");
});

test("repository: admin-only writes, fixed id, no duplicates", async () => {
  await assert.rejects(repo.createConnection(staff, connectionInput()), (e) => e.status === 403);
  const c = await repo.createConnection(admin, connectionInput());
  assert.equal(c.id, "test_api");
  await assert.rejects(repo.createConnection(admin, connectionInput()), (e) => e.status === 409);
  const updated = await repo.updateConnection(admin, "test_api", { ...connectionInput(), id: "renamed", description: "Changed" });
  assert.equal(updated.id, "test_api", "id cannot be changed by an update");
  assert.equal(updated.description, "Changed");
  const pub = repo.publicConnection(updated);
  assert.equal(pub.secretConfigured, true);
  assert.ok(!JSON.stringify(pub).includes("super-secret"), "secret value never in the public view");
  const { ready, extra } = await resolveTools(["http_api.get", "http_api.post"], EXECUTORS);
  assert.ok(ready.has("http_api.get") && ready.has("http_api.post"));
  assert.match(extra["http_api.get"], /API "test_api".*\n.*endpoint "get_staff"/);
  assert.ok(!extra["http_api.get"].includes("add_note"), "GET tool lists only GET endpoints");
});

test("calls an endpoint with auth; secrets are redacted from the result", async () => {
  hits.length = 0;
  const r = await httpConn.callEndpoint({ apiId: "test_api", endpointId: "get_staff", method: "GET", params: { id: "a/b", dept: "IT" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { id: "a/b", dept: "IT" });
  assert.equal(hits[0].auth, "Bearer super-secret-token-987654");
  assert.equal(hits[0].url, "/v1/staff/a%2Fb?dept=IT");

  const echo = await httpConn.callEndpoint({ apiId: "test_api", endpointId: "echo_auth", method: "GET" });
  assert.ok(!JSON.stringify(echo).includes("super-secret-token"), "an API echoing the key back must not leak it");
});

test("errors: HTTP status, wrong method, unknown API or endpoint", async () => {
  await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "missing", method: "GET" }), /HTTP 404.*no such record/);
  await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "add_note", method: "GET" }), /POST endpoint/);
  await assert.rejects(httpConn.callEndpoint({ apiId: "nope", endpointId: "x", method: "GET" }), /Unknown API/);
  await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "nope", method: "GET" }), /Unknown endpoint/);
});

test("redirects are re-checked: internal targets blocked, same-site allowed", async () => {
  await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "to_metadata", method: "GET" }), /Blocked a redirect/);
  await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "to_localhost", method: "GET" }), /Blocked a redirect/);
  const r = await httpConn.callEndpoint({ apiId: "test_api", endpointId: "hop", method: "GET" });
  assert.equal(r.data.id, "hopped");
});

test("large responses are cut off, not loaded whole", async () => {
  const r = await httpConn.callEndpoint({ apiId: "test_api", endpointId: "big", method: "GET" });
  assert.equal(r.truncated, true);
  assert.ok(r.data.length < 10_000);
});

test("DNS check at connect time: a name resolving to a private address is blocked (DNS rebinding)", async () => {
  const lookup = (host) => new Promise((resolve) => guard.guardedLookup(host, {}, (err, address) => resolve({ err, address })));
  const blocked = await lookup("localhost"); // resolves to 127.0.0.1 / ::1, and "localhost" is not allow-listed
  assert.ok(blocked.err instanceof guard.NetworkBlocked, String(blocked.err));
  assert.match(blocked.err.message, /private network address/);
  process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test, localhost";
  try {
    const allowed = await lookup("localhost");
    assert.equal(allowed.err, null);
    assert.ok(guard.isPrivateAddress(allowed.address));
  } finally {
    process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test";
  }
});

test("a disabled API is refused for agents but can still be tested by an admin", async () => {
  await repo.updateConnection(admin, "test_api", { ...connectionInput(), enabled: false });
  try {
    await assert.rejects(httpConn.callEndpoint({ apiId: "test_api", endpointId: "get_staff", method: "GET", params: { id: "1" } }), /disabled/);
    const r = await httpConn.callEndpoint({ apiId: "test_api", endpointId: "get_staff", method: "GET", params: { id: "1" }, allowDisabled: true });
    assert.equal(r.status, 200);
    assert.equal((await resolveTools(["http_api.get"], EXECUTORS)).ready.size, 0, "agents don't see a disabled API");
  } finally {
    await repo.updateConnection(admin, "test_api", connectionInput());
  }
});

// ---------------------------------------------------------------------------
// Engine integration
// ---------------------------------------------------------------------------
function fakeModel(replies) {
  const calls = [];
  const fn = async (method, opts) => {
    calls.push({ tools: opts.tools.map((t) => t.name), descriptions: opts.tools.map((t) => t.description), messages: structuredClone(opts.messages) });
    const r = replies.shift();
    if (!r) throw new Error("fake model: no more replies");
    return { text: "", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0, latencyMs: 1, model: "fake", ...r };
  };
  fn.calls = calls;
  return fn;
}
const call = (name, args) => ({ toolCalls: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args }] });

async function makeAgent() {
  return agents.createAgent(
    admin,
    {
      name: "Staff lookup",
      description: "",
      instructions: "Look up staff and add a note.",
      steps: [
        { title: "Get staff", tool: "http_api.get" },
        { title: "Add note", tool: "http_api.post" },
      ],
      trigger: { type: "manual", schedule: null },
    },
    { activate: true },
  );
}

test("engine: an agent reads from a registered API; POST is simulated in a test run", async () => {
  const agent = await makeAgent();
  hits.length = 0;
  const model = fakeModel([
    call("http_api__get", { api: "test_api", endpoint: "get_staff", params: { id: "42", dept: "Admissions" } }),
    call("http_api__post", { api: "test_api", endpoint: "add_note", body: { text: "hello" } }),
    { text: "Staff 42 is in Admissions. Note simulated." },
  ]);
  const run = await engine.startRun(admin, agent.id, { mode: "test" });
  await engine.executeRun(run.id, { callModel: model, executors: EXECUTORS, notify: async () => {} });
  const done = await runs.loadRun(run.id);
  assert.equal(done.status, "succeeded", done.error);
  assert.ok(model.calls[0].tools.includes("http_api__get"));
  assert.match(model.calls[0].descriptions.join("\n"), /endpoint "get_staff"/, "the model is told which endpoints exist");
  const toolMsgs = done.messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.match(toolMsgs[0], /untrusted="true"[\s\S]*Admissions/);
  assert.match(toolMsgs[1], /simulated/);
  assert.equal(hits.filter((h) => h.method === "POST").length, 0, "test run never sends the POST");
  assert.ok(!JSON.stringify(done).includes("super-secret-token"), "secret never stored in the run");
});

test("engine: live POST waits for approval, then calls the API", async () => {
  const agent = (await agents.listAgents(admin)).find((a) => a.config.name === "Staff lookup");
  hits.length = 0;
  const model = fakeModel([call("http_api__post", { api: "test_api", endpoint: "add_note", body: { text: "approved note" } }), { text: "Note added." }]);
  const deps = { callModel: model, executors: EXECUTORS, notify: async () => {} };
  const run = await engine.startRun(admin, agent.id, { mode: "live" });
  await engine.executeRun(run.id, deps);
  assert.equal((await runs.loadRun(run.id)).status, "waiting_approval");
  assert.equal(hits.length, 0, "nothing sent before approval");
  await engine.decideApproval(admin, run.id, { decision: "approve" });
  await engine.executeRun(run.id, deps);
  const done = await runs.loadRun(run.id);
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(hits.length, 1);
  assert.deepEqual(JSON.parse(hits[0].body), { text: "approved note" });
});

test("engine: a bad endpoint call is reported back to the agent, the run continues", async () => {
  const agent = (await agents.listAgents(admin)).find((a) => a.config.name === "Staff lookup");
  const model = fakeModel([
    call("http_api__get", { api: "test_api", endpoint: "get_staff", params: { id: "1", evil: "x" } }),
    call("http_api__get", { api: "test_api", endpoint: "to_metadata" }),
    { text: "Could not complete." },
  ]);
  const run = await engine.startRun(admin, agent.id, { mode: "test" });
  await engine.executeRun(run.id, { callModel: model, executors: EXECUTORS, notify: async () => {} });
  const done = await runs.loadRun(run.id);
  assert.equal(done.status, "succeeded");
  const toolMsgs = done.messages.filter((m) => m.role === "tool").map((m) => m.content);
  assert.match(toolMsgs[0], /Unknown parameter \\?"evil\\?"/);
  assert.match(toolMsgs[1], /Blocked a redirect/);
});
