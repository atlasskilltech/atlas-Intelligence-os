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
  run: { agentName: "Faculty Report", ownerId: "u_7", ownerEmail: "owner@atlas.test", ...over },
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

test("not ready until the SendGrid key and owner email exist", async () => {
  assert.equal(await tool.isReady({ ownerEmail: "o@atlas.test" }), false);
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  assert.equal(await tool.isReady({ ownerEmail: "o@atlas.test" }), true, "default sender is used when SENDGRID_FROM_EMAIL is empty");
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
  assert.deepEqual(out, { sent: true, to: "owner@atlas.test", from: "noreply@atlas.test", subject: "Report", includedReport: true });
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

test("sender: default is tech@atlasuniversity.edu.in, each user can set their own on the allowed domain", async () => {
  const { getSenderFor, saveSenderFor } = await import("../src/lib/email/senderSettings.js");
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  const def = await getSenderFor("u_7");
  assert.equal(def.email, "tech@atlasuniversity.edu.in");
  assert.equal(def.custom, false);
  assert.deepEqual(def.allowedDomains, ["atlasuniversity.edu.in"]);

  await assert.rejects(saveSenderFor({ id: "u_7" }, { email: "me@gmail.com" }), /@atlasuniversity\.edu\.in/);
  await assert.rejects(saveSenderFor({ id: "u_7" }, { email: "not an email" }), /valid email/);

  const mine = await saveSenderFor({ id: "u_7" }, { email: " Admissions@AtlasUniversity.edu.in ", name: "Admissions\r\nBcc: x" });
  assert.equal(mine.email, "admissions@atlasuniversity.edu.in");
  assert.equal(mine.name, "Admissions Bcc: x");
  assert.equal(mine.custom, true);
  assert.equal((await getSenderFor("u_8")).email, "tech@atlasuniversity.edu.in", "other users keep the default");

  const reset = await saveSenderFor({ id: "u_7" }, { email: "" });
  assert.equal(reset.email, "tech@atlasuniversity.edu.in");
  assert.equal(reset.custom, false);
});

test("execute uses the owner's own sender", async (t) => {
  const { saveSenderFor } = await import("../src/lib/email/senderSettings.js");
  process.env.SENDGRID_API_KEY = "SG.test-key-123456";
  await saveSenderFor({ id: "u_9" }, { email: "hr@atlasuniversity.edu.in", name: "HR Team" });
  let body;
  t.mock.method(httpMod.default, "request", (url, opts, cb) => {
    const req = new EventEmitter();
    req.write = (b) => (body = JSON.parse(String(b)));
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
  const out = await tool.execute({ subject: "s", message: "m", includeReport: false }, ctx({ ownerId: "u_9" }));
  assert.equal(out.from, "hr@atlasuniversity.edu.in");
  assert.deepEqual(body.from, { email: "hr@atlasuniversity.edu.in", name: "HR Team" });
  assert.equal(out.includedReport, false);
});
