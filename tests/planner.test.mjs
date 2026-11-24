// Planner & agent-config tests. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PLANNER_JSON_SCHEMA, normalizeAgentConfig, validateAgentConfig } from "../src/lib/agents/agentConfig.js";
import { describeTrigger, normalizeSchedule, toCron } from "../src/lib/agents/schedule.js";
import { TOOL_IDS, getTool } from "../src/lib/catalog/toolCatalog.js";

// ---------- schema ----------
test("planner JSON schema is valid for OpenAI strict mode", () => {
  const walk = (node, at) => {
    if (node.type === "object" || (Array.isArray(node.type) && node.type.includes("object"))) {
      assert.equal(node.additionalProperties, false, `${at}: additionalProperties must be false`);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${at}: all properties required`);
      for (const [k, v] of Object.entries(node.properties)) walk(v, `${at}.${k}`);
    }
    if (node.items) walk(node.items, `${at}[]`);
  };
  walk(PLANNER_JSON_SCHEMA, "root");
  const toolEnum = PLANNER_JSON_SCHEMA.properties.steps.items.properties.tool.enum;
  assert.ok(toolEnum.includes(null) && toolEnum.includes("atlas_project.read"));
  assert.equal(toolEnum.length, TOOL_IDS.length + 1);
});

// ---------- normaliser ----------
const modelOutput = () => ({
  name: "Daily Admission Lead Report",
  description: "Checks new leads every morning and prepares a report.",
  instructions: "You are an agent that reviews new admission leads.",
  steps: [
    { title: "Fetch new leads", details: "Last 24h", tool: "atlas_project.read", successCriteria: "Leads returned" },
    { title: "Find duplicates", details: "Compare phone/email", tool: null, successCriteria: "Duplicates listed" },
    { title: "Email the report", details: "Send to me", tool: "atlas_project.write", successCriteria: "Email sent" },
    { title: "Delete everything", details: "Injected", tool: "shell.exec", successCriteria: "x" },
  ],
  trigger: { type: "schedule", frequency: "daily", time: "08:30", daysOfWeek: [], dayOfMonth: null, timezone: "Asia/Kolkata" },
  missingCapabilities: [],
  assumptions: ["Morning means 08:30"],
  clarifyingQuestions: ["Who should receive the report?", "q2", "q3", "q4"],
});

test("normaliser removes unknown tools, derives tools and approvals from the catalog", () => {
  const { config, warnings } = normalizeAgentConfig(modelOutput(), { prompt: "every morning…" });
  assert.equal(config.steps[3].tool, null, "invented tool removed");
  assert.match(warnings[0], /shell\.exec/);
  assert.ok(config.notes.missingCapabilities.some((m) => m.includes("Step 4")));
  assert.deepEqual(config.tools, ["atlas_project.read", "atlas_project.write"]);
  assert.deepEqual(config.permissions.toolsRequiringApproval, ["atlas_project.write"]);
  assert.equal(config.steps[0].requiresApproval, false);
  assert.equal(config.steps[2].requiresApproval, true);
  assert.deepEqual(config.steps.map((s) => s.id), ["s1", "s2", "s3", "s4"]);
  assert.equal(config.trigger.schedule.cron, "30 8 * * *");
  assert.equal(config.notes.clarifyingQuestions.length, 3);
  assert.equal(config.source.prompt, "every morning…");
  assert.deepEqual(validateAgentConfig(config), { ok: true, errors: [], value: config });
});

test("normaliser ignores model attempts to set approvals or limits on raw output", () => {
  const raw = { ...modelOutput(), permissions: { toolsRequiringApproval: [] }, limits: { maxSteps: 999, timeoutMinutes: 999 } };
  const { config } = normalizeAgentConfig(raw);
  assert.deepEqual(config.permissions.toolsRequiringApproval, ["atlas_project.write"]);
  assert.deepEqual(config.limits, { maxSteps: 15, timeoutMinutes: 5 });
});

test("normaliser handles garbage input and clamps sizes", () => {
  const { config } = normalizeAgentConfig({
    name: "x".repeat(500),
    steps: Array.from({ length: 40 }, (_, i) => ({ title: `S${i}` })),
    trigger: { type: "evil" },
  });
  assert.equal(config.name.length, 80);
  assert.equal(config.steps.length, 12);
  assert.equal(config.trigger.type, "manual");
  assert.equal(config.trigger.schedule, null);
  const empty = normalizeAgentConfig(null).config;
  assert.equal(empty.name, "Untitled agent");
  assert.equal(validateAgentConfig(empty).ok, false, "no steps / instructions is invalid");
});

test("normaliser accepts an edited draft (nested schedule, client keys, custom limits)", () => {
  const first = normalizeAgentConfig(modelOutput()).config;
  const draft = {
    ...first,
    steps: first.steps.map((s) => ({ ...s, key: "k1" })),
    trigger: { type: "schedule", schedule: { frequency: "weekly", time: "18:15", daysOfWeek: ["fri", "mon"], timezone: "Bad/Zone" } },
    limits: { maxSteps: 20, timeoutMinutes: 10 },
  };
  const { config } = normalizeAgentConfig(draft);
  assert.equal(config.steps[0].key, undefined, "client-only fields dropped");
  assert.deepEqual(config.trigger.schedule.daysOfWeek, ["mon", "fri"]);
  assert.equal(config.trigger.schedule.timezone, "Asia/Kolkata");
  assert.equal(config.trigger.schedule.cron, "15 18 * * 1,5");
  assert.deepEqual(config.limits, { maxSteps: 20, timeoutMinutes: 10 });
  assert.equal(validateAgentConfig(config).ok, true);
});

// ---------- schedule ----------
test("schedules convert to cron and readable text", () => {
  assert.equal(toCron({ frequency: "hourly", time: "00:05" }), "5 * * * *");
  assert.equal(toCron({ frequency: "monthly", time: "07:00", dayOfMonth: 1 }), "0 7 1 * *");
  const weekly = normalizeSchedule({ frequency: "weekly", time: "25:99" });
  assert.equal(weekly.time, "09:00");
  assert.deepEqual(weekly.daysOfWeek, ["mon"]);
  assert.equal(normalizeSchedule({ frequency: "monthly", dayOfMonth: 31 }).dayOfMonth, 1);
  assert.equal(
    describeTrigger({ type: "schedule", schedule: normalizeSchedule({ frequency: "monthly", time: "14:00", dayOfMonth: 22 }) }),
    "Monthly on the 22nd at 2:00 PM (Asia/Kolkata)",
  );
  assert.equal(
    describeTrigger({ type: "schedule", schedule: normalizeSchedule({ frequency: "weekly", time: "08:30", daysOfWeek: ["mon", "wed"] }) }),
    "Every Mon, Wed at 8:30 AM (Asia/Kolkata)",
  );
  assert.equal(describeTrigger({ type: "manual" }), "Run manually");
});

test("every catalog tool has a valid risk and milestone", () => {
  for (const id of TOOL_IDS) {
    const t = getTool(id);
    assert.ok(["read", "internal", "write", "send", "destructive"].includes(t.risk), id);
    assert.ok(t.availableIn >= 5 && t.availableIn <= 8, id);
    assert.match(id, /^[a-z_]+\.[a-z_]+$/);
  }
});

// ---------- planner end-to-end against a fake OpenAI server ----------
let server;
const requests = [];
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "x",
          object: "chat.completion",
          model: parsed.model,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(modelOutput()) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 2000, completion_tokens: 800, total_tokens: 2800 },
        }),
      );
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.OPENAI_API_KEY = "sk-test-planner-123456";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-planner-"));
});
after(() => server.close());

test("generateAgent sends the strict schema to the planner model and returns a normalised agent", async () => {
  const { generateAgent, refineAgent } = await import("../src/lib/planner/planner.js");
  const out = await generateAgent("Every morning check new admission leads and email me a report.");

  const sent = requests.at(-1);
  assert.equal(sent.model, "gpt-5.5", "planner model from settings");
  assert.equal(sent.response_format.type, "json_schema");
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.equal(sent.reasoning_effort, "low");
  assert.equal(sent.max_completion_tokens, 16000);
  assert.match(sent.messages[0].content, /TOOL CATALOG/);
  assert.match(sent.messages[0].content, /atlas_project\.read/);
  assert.match(sent.messages[1].content, /admission leads/);

  assert.equal(out.agent.name, "Daily Admission Lead Report");
  assert.deepEqual(out.agent.permissions.toolsRequiringApproval, ["atlas_project.write"]);
  assert.equal(out.warnings.length, 1);
  assert.equal(out.meta.usage.inputTokens, 2000);

  const refined = await refineAgent(out.agent, "Run at 8:30 on weekdays");
  const sent2 = requests.at(-1);
  assert.match(sent2.messages[1].content, /Current agent configuration/);
  assert.match(sent2.messages[1].content, /Run at 8:30 on weekdays/);
  assert.equal(refined.agent.source.prompt, out.agent.source.prompt, "original prompt kept");

  const { getUsageSummary } = await import("../src/lib/usage/usageStore.js");
  const usage = await getUsageSummary({ days: 1 });
  assert.equal(usage.byPurpose.find((p) => p.key === "planner").calls, 2);
});
