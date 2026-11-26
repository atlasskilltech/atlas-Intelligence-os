// Email-the-owner connector. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportEmail, isEmailAddress } from "../src/lib/email/reportEmail.js";
import { emailConnector } from "../src/lib/connectors/email.js";
import { RISK_LEVELS, getTool } from "../src/lib/catalog/toolCatalog.js";
import { plannerSystemPrompt } from "../src/lib/planner/prompts.js";

const report = {
  title: "Faculty available today",
  summary: "12 faculty are free.\n\nSee the table.",
  sections: [{ heading: "Notes", body: "Window 09:00–18:00" }],
  tables: [{ title: "ISME", columns: ["Name", "School", "Email"], rows: [["A. <script>Mehta</script>", "ISME", "a@x.edu"]] }],
};

test("builds an escaped HTML + text email from a report", () => {
  const e = buildReportEmail(report, { agentName: "Free faculty", runUrl: "https://ios.example/runs/run_1" });
  assert.equal(e.subject, "Faculty available today");
  assert.ok(e.html.includes("&lt;script&gt;Mehta&lt;/script&gt;") && !e.html.includes("<script>"));
  assert.ok(e.html.includes("https://ios.example/runs/run_1"));
  assert.ok(e.text.includes("Name | School | Email") && e.text.includes("12 faculty are free."));
});

test("test runs are marked and subjects cannot inject headers", () => {
  const e = buildReportEmail(report, { subject: "Hi\r\nBcc: evil@x.com", test: true });
  assert.equal(e.subject, "[Test run] Hi Bcc: evil@x.com");
  assert.ok(!/[\r\n]/.test(e.subject));
});

test("email_owner is catalogued as owner-only and needs no approval", () => {
  const t = getTool("email.email_owner");
  assert.equal(t.risk, "self");
  assert.equal(RISK_LEVELS.self.approval, false);
  const params = emailConnector.actions.email_owner.parameters.properties;
  assert.ok(!("to" in params) && !("recipient" in params), "the model must not choose the recipient");
  assert.match(plannerSystemPrompt(), /email\.email_owner/);
});

const ctx = (over = {}) => {
  const sent = [];
  return {
    sent,
    run: { id: "run_1", agentName: "Free faculty", ownerEmail: "owner@atlasuniversity.edu.in", mode: "live" },
    getReports: () => [report],
    sendMail: async (m) => sent.push(m),
    ...over,
  };
};

test("sends the latest report to the owner only", async () => {
  const c = ctx();
  const out = await emailConnector.actions.email_owner.execute({ message: "Here you go" }, c);
  assert.equal(out.sent, true);
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].to, "owner@atlasuniversity.edu.in");
  assert.ok(c.sent[0].html.includes("Here you go"));
});

test("refuses without a report or a valid owner address", async () => {
  await assert.rejects(emailConnector.actions.email_owner.execute({}, ctx({ getReports: () => [] })), /report\.create_report first/);
  const c = ctx();
  c.run.ownerEmail = null;
  await assert.rejects(emailConnector.actions.email_owner.execute({}, c), /no email address/);
});

test("not ready unless mail is configured and the owner has an email", async () => {
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  assert.equal(await emailConnector.actions.email_owner.isReady({ ownerEmail: "a@b.edu" }), false);
  process.env.SMTP_USER = "ios@b.edu";
  process.env.SMTP_PASSWORD = "abcd efgh ijkl mnop";
  assert.equal(await emailConnector.actions.email_owner.isReady({ ownerEmail: "a@b.edu" }), true);
  assert.equal(await emailConnector.actions.email_owner.isReady({ ownerEmail: null }), false);
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
});

test("address check", () => {
  assert.ok(isEmailAddress("a.b@atlasuniversity.edu.in"));
  for (const bad of ["", "a@b", "a b@c.d", "a@b.c,d@e.f", null]) assert.ok(!isEmailAddress(bad), String(bad));
});
