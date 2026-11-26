// Connector framework + outbound network safety tests. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-conn-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test";

const guard = await import("../src/lib/security/netGuard.js");
const { safeFetch } = await import("../src/lib/connectors/http/safeFetch.js");
const { parseBody } = await import("../src/lib/connectors/http/parseBody.js");
const { defineConnector } = await import("../src/lib/connectors/defineConnector.js");
const { EXECUTORS, connectorOverview } = await import("../src/lib/connectors/index.js");
const { resolveTools } = await import("../src/lib/tools/registry.js");

let server;
let base;
const hits = [];
before(async () => {
  server = http.createServer((req, res) => {
    hits.push({ url: req.url, auth: req.headers.authorization });
    const u = new URL(req.url, "http://x");
    const redirect = (to) => {
      res.writeHead(302, { Location: to });
      res.end();
    };
    if (u.pathname === "/ok") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (u.pathname === "/to-metadata") return redirect("http://169.254.169.254/latest/meta-data/");
    if (u.pathname === "/to-localhost") return redirect(`http://localhost:${server.address().port}/ok`);
    if (u.pathname === "/hop") return redirect("/ok");
    if (u.pathname === "/loop") return redirect("/loop");
    if (u.pathname === "/big") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("x".repeat(1_200_000));
    }
    if (u.pathname === "/html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<html><script>evil()</script><h1>Hello</h1> <p>world</p></html>");
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

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

test("DNS check at connect time: a name resolving to a private address is blocked (DNS rebinding)", async () => {
  const lookup = (host) => new Promise((resolve) => guard.guardedLookup(host, {}, (err, address) => resolve({ err, address })));
  const blocked = await lookup("localhost");
  assert.ok(blocked.err instanceof guard.NetworkBlocked, String(blocked.err));
  assert.match(blocked.err.message, /private network address/);
  process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test, localhost";
  try {
    const allowed = await lookup("localhost");
    assert.equal(allowed.err, null);
  } finally {
    process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test";
  }
});

test("safeFetch: redirects are re-checked; same-site allowed, internal targets blocked, loops stopped", async () => {
  const ok = await safeFetch(`${base}/hop`);
  assert.equal(ok.status, 200);
  assert.equal(ok.redirects, 1);
  await assert.rejects(safeFetch(`${base}/to-metadata`), /Blocked a redirect/);
  await assert.rejects(safeFetch(`${base}/to-localhost`), /Blocked a redirect/);
  await assert.rejects(safeFetch(`${base}/loop`), /Too many redirects/);
});

test("safeFetch: large responses are cut off; blocked hosts never contacted", async () => {
  const r = await safeFetch(`${base}/big`);
  assert.equal(r.truncated, true);
  assert.ok(r.body.length <= 1_000_000);
  hits.length = 0;
  process.env.INTERNAL_ALLOWED_HOSTS = "intranet.atlas.test";
  try {
    await assert.rejects(safeFetch(`${base}/ok`), /https|private/);
  } finally {
    process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1, intranet.atlas.test";
  }
  assert.equal(hits.length, 0);
});

test("parseBody: JSON parsed, HTML reduced to text", async () => {
  assert.deepEqual(parseBody(await safeFetch(`${base}/ok`)), { ok: true });
  assert.equal(parseBody(await safeFetch(`${base}/html`)), "Hello world");
});

test("defineConnector refuses actions that are not in the catalog", () => {
  const exec = { parameters: { type: "object" }, execute: async () => ({}) };
  assert.throws(() => defineConnector({ id: "nope", actions: {} }), /not in the tool catalog/);
  assert.throws(() => defineConnector({ id: "atlas_project", actions: { delete_all: exec } }), /not in the tool catalog/);
  assert.throws(() => defineConnector({ id: "atlas_project", actions: { read: { execute: async () => {} } } }), /parameters/);
});

test("only key-based project connectors and built-ins exist", async () => {
  const overview = await connectorOverview();
  assert.deepEqual(overview.map((c) => c.id), ["report", "notify", "email", "atlas_project"]);
  assert.equal(overview.find((c) => c.id === "atlas_project").ready, false, "no project connected yet");
  const { ready } = await resolveTools(["atlas_project.read", "report.create_report"], EXECUTORS);
  assert.deepEqual([...ready], ["report.create_report"], "project tools are skipped until a project is connected");
});
