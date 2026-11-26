// Email connector (SendGrid) tests. Run with: npm test
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-email-"));

const httpMod = await import("node:https");
const { EXECUTORS, connectorOverview } = await import("../src/lib/connectors/index.js");
const { buildEmail } = await import("../src/lib/connectors/email/emailConnector.js");
const { getTool } = await import("../src/lib/catalog/toolCatalog.js");
const { hasExternalEffect } = await import("../src/lib/tools/registry.js");

const tool = EXECUTORS["email.email_owner"];
const ctx = (over = {}) => ({
  run: { agentName: "Faculty Report", ownerEmail: "owner@atlas.test", ...over },
  getReports: () => [{ title: "Free faculty", summary: "3 free", sections: [], tables: [{ title: "", columns: ["Name"], rows: [["<b>Dr X</b>"]] }] }],
});

afterEach(() => {
  delete process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_FROM_EMAIL;
});

test("email.email_owner is a send tool: simulated in test runs, needs approval unless pre-approved", () => {
  assert.equal(getTool("email.email_owner").risk, "send");
  assert.equal(hasExternalEffect("email.email_owner"), true);
  assert.equal(tool.parameters.properties.to, undefined, "the model cannot pick a recipient");
});

test("not ready until SendGrid key, from address and owner email exist", async () => {
  assert.equal(await tool.isReady({ ownerEmail: "o@atlas.test" }), false);
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  assert.equal(await tool.isReady({ ownerEmail: "o@atlas.test" }), false, "from address missing");
  process.env.SENDGRID_FROM_EMAIL = "noreply@atlas.test";
  assert.equal(await tool.isReady({ ownerEmail: "o@atlas.test" }), true);
  assert.equal(await tool.isReady({ ownerEmail: null }), false, "owner without email");
  const email = (await connectorOverview()).find((c) => c.id === "email");
  assert.equal(email.ready, true);
});

test("buildEmail escapes HTML and keeps the subject on one line", () => {
  const m = buildEmail({ subject: "Hi\r\nBcc: x@y.z", message: "<script>x</script>", report: ctx().getReports()[0], agentName: "A" });
  assert.equal(m.subject, "Hi Bcc: x@y.z");
  assert.doesNotMatch(m.html, /<script>|<b>Dr X/);
  assert.match(m.html, /&lt;b&gt;Dr X/);
  assert.match(m.text, /Free faculty/);
});

test("execute sends to the owner only, with the latest report", async (t) => {
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  process.env.SENDGRID_FROM_EMAIL = "noreply@atlas.test";
  let sent;
  t.mock.method(httpMod.default, "request", (url, opts, cb) => {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.write = (b) => (sent = { url: String(url), opts, body: JSON.parse(String(b)) });
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 202;
      res.headers = {};
      res.destroy = () => {};
      cb(res);
      setImmediate(() => res.emit("end"));
    };
    req.destroy = () => {};
    return req;
  });
  const out = await tool.execute({ subject: "Report", message: "Here it is" }, ctx());
  assert.deepEqual(out, { sent: true, to: "owner@atlas.test", subject: "Report", includedReport: true });
  assert.deepEqual(sent.body.personalizations, [{ to: [{ email: "owner@atlas.test" }] }]);
  assert.equal(sent.body.from.email, "noreply@atlas.test");
  assert.equal(sent.url, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(sent.opts.headers.Authorization, "Bearer SG.test-key-123456");
  assert.match(sent.body.content[1].value, /Free faculty/);
});

test("execute refuses when the owner has no email", async () => {
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  process.env.SENDGRID_FROM_EMAIL = "noreply@atlas.test";
  await assert.rejects(tool.execute({ subject: "s", message: "m" }, ctx({ ownerEmail: null })), /no email address/);
});
