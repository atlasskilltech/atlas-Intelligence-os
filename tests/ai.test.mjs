// Unit tests for the AI layer. Run with: npm test
// Uses a fake fetch, so no API key or network is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createOpenAIProvider } from "../src/lib/ai/providers/openai.js";
import { AIError } from "../src/lib/ai/errors.js";
import { withRetry } from "../src/lib/ai/retry.js";
import { estimateCost, findPrice } from "../src/lib/ai/pricing.js";
import { redact } from "../src/lib/security/redact.js";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-test-"));
const { validateModelSettings, getModelSettings, updateModelSettings } = await import(
  "../src/lib/settings/modelSettings.js"
);
const { recordUsage, getUsageSummary } = await import("../src/lib/usage/usageStore.js");

// ---------- helpers ----------
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    const { status = 200, json, headers = {} } = handler(body, calls.length);
    return new Response(JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  fn.calls = calls;
  return fn;
}

const completion = (message, extra = {}) => ({
  id: "chatcmpl-1",
  object: "chat.completion",
  model: "gpt-test-2026-01-01",
  choices: [{ index: 0, message: { role: "assistant", content: null, ...message }, finish_reason: extra.finish || "stop" }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } },
});

const errorBody = (code, message = "err") => ({ error: { message, type: "error", code } });

// ---------- provider ----------
test("generateText returns normalized text and usage", async () => {
  const f = fakeFetch(() => ({ json: completion({ content: "hello" }) }));
  const p = createOpenAIProvider({ apiKey: "sk-test-123456789", fetch: f });
  const r = await p.generateText({ model: "gpt-test", messages: [{ role: "user", content: "hi" }], maxOutputTokens: 50 });
  assert.equal(r.text, "hello");
  assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, totalTokens: 120 });
  assert.equal(f.calls[0].body.max_completion_tokens, 50);
  assert.match(f.calls[0].url, /\/chat\/completions$/);
});

test("generateStructured sends a strict JSON schema and parses the result", async () => {
  const f = fakeFetch(() => ({ json: completion({ content: '{"name":"Lead Report"}' }) }));
  const p = createOpenAIProvider({ apiKey: "sk-test-123456789", fetch: f });
  const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false };
  const r = await p.generateStructured({ model: "m", messages: [{ role: "user", content: "x" }], schema, schemaName: "agent" });
  assert.deepEqual(r.data, { name: "Lead Report" });
  assert.equal(f.calls[0].body.response_format.json_schema.strict, true);
});

test("generateStructured rejects invalid JSON, refusals and truncation", async () => {
  for (const [msg, finish] of [[{ content: "not json" }], [{ refusal: "no" }], [{ content: '{"a":' }, "length"]]) {
    const p = createOpenAIProvider({ apiKey: "sk-test-123456789", fetch: fakeFetch(() => ({ json: completion(msg, { finish }) })) });
    await assert.rejects(
      p.generateStructured({ model: "m", messages: [], schema: {}, schemaName: "x" }),
      (e) => e instanceof AIError && e.type === "invalid_response",
    );
  }
});

test("chatWithTools sends tools and parses tool calls (including bad arguments)", async () => {
  const f = fakeFetch(() => ({
    json: completion(
      {
        tool_calls: [
          { id: "c1", type: "function", function: { name: "crm_search", arguments: '{"since":"2026-01-01"}' } },
          { id: "c2", type: "function", function: { name: "crm_get", arguments: "{bad" } },
        ],
      },
      { finish: "tool_calls" },
    ),
  }));
  const p = createOpenAIProvider({ apiKey: "sk-test-123456789", fetch: f });
  const r = await p.chatWithTools({
    model: "m",
    messages: [
      { role: "user", content: "go" },
      { role: "assistant", content: "", toolCalls: [{ id: "c0", name: "crm_search", arguments: { q: 1 } }] },
      { role: "tool", toolCallId: "c0", content: "[]" },
    ],
    tools: [{ name: "crm_search", description: "Search", parameters: { type: "object", properties: {} } }],
  });
  assert.equal(r.finishReason, "tool_calls");
  assert.deepEqual(r.toolCalls[0].arguments, { since: "2026-01-01" });
  assert.equal(r.toolCalls[1].arguments, null);
  const sent = f.calls[0].body;
  assert.equal(sent.tools[0].function.name, "crm_search");
  assert.equal(sent.parallel_tool_calls, false);
  assert.equal(sent.messages[1].tool_calls[0].function.arguments, '{"q":1}');
  assert.equal(sent.messages[2].tool_call_id, "c0");
});

test("HTTP errors map to the right AIError types", async () => {
  const cases = [
    [401, "invalid_api_key", "auth", false],
    [403, null, "permission", false],
    [404, "model_not_found", "model_not_found", false],
    [429, "insufficient_quota", "quota", false],
    [429, "rate_limit_exceeded", "rate_limit", true],
    [500, null, "server", true],
    [400, null, "bad_request", false],
  ];
  for (const [status, code, type, retryable] of cases) {
    const p = createOpenAIProvider({
      apiKey: "sk-test-123456789",
      fetch: fakeFetch(() => ({ status, json: errorBody(code), headers: { "retry-after": "2" } })),
    });
    await assert.rejects(p.generateText({ model: "m", messages: [] }), (e) => {
      assert.equal(e.type, type, `status ${status}/${code}`);
      assert.equal(e.retryable, retryable);
      if (type === "rate_limit") assert.equal(e.retryAfterMs, 2000);
      return true;
    });
  }
});

test("network failure maps to a retryable connection error", async () => {
  const p = createOpenAIProvider({
    apiKey: "sk-test-123456789",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(p.generateText({ model: "m", messages: [] }), (e) => e.type === "connection" && e.retryable);
});

test("missing API key gives a not_configured error without any network call", async () => {
  const p = createOpenAIProvider({ apiKey: undefined });
  await assert.rejects(p.generateText({ model: "m", messages: [] }), (e) => e.type === "not_configured");
});

test("error messages are user-friendly and never include the key", async () => {
  const key = "sk-proj-SECRETSECRETSECRET";
  const p = createOpenAIProvider({ apiKey: key, fetch: fakeFetch(() => ({ status: 401, json: errorBody("invalid_api_key", `Incorrect API key provided: ${key}`) })) });
  await assert.rejects(p.generateText({ model: "m", messages: [] }), (e) => {
    assert.ok(!JSON.stringify(e.toJSON()).includes("SECRET"));
    assert.ok(!redact(e.detail).includes("SECRET"));
    return true;
  });
});

// ---------- retry ----------
test("withRetry retries retryable errors, honours retry-after, then succeeds", async () => {
  const delays = [];
  let n = 0;
  const r = await withRetry(
    async () => {
      n += 1;
      if (n < 3) throw new AIError("rate_limit", "x", { retryAfterMs: 1500 });
      return "ok";
    },
    { maxRetries: 3, sleep: async (ms) => delays.push(ms) },
  );
  assert.equal(r, "ok");
  assert.equal(n, 3);
  assert.ok(delays.every((d) => d >= 1500));
});

test("withRetry does not retry permanent errors and stops at the limit", async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n += 1; throw new AIError("auth", "x"); }, { sleep: async () => {} }));
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(withRetry(async () => { n += 1; throw new AIError("server", "x"); }, { maxRetries: 2, sleep: async () => {} }));
  assert.equal(n, 3);
});

// ---------- pricing ----------
test("pricing: date-suffixed models resolve, cached tokens are discounted, unknown models return null", () => {
  assert.ok(findPrice("gpt-4o-mini-2024-07-18"));
  const cost = estimateCost("gpt-4o-mini", { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 });
  assert.equal(cost, 0.75);
  const cached = estimateCost("gpt-4o-mini", { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0 });
  assert.equal(cached, 0.075);
  assert.equal(estimateCost("some-new-model", { inputTokens: 10, outputTokens: 10 }), null);
  assert.equal(estimateCost("some-new-model", { inputTokens: 1e6, outputTokens: 0 }, { "some-new-model": { input: 3, output: 9 } }), 3);
});

// ---------- redaction ----------
test("redact masks keys, bearer tokens and query-string secrets", () => {
  const out = redact("key sk-abcdefghijkl Bearer abc.def.ghijkl url?api_key=zzz&x=1 custom-secret-value", ["custom-secret-value"]);
  assert.ok(!/sk-abcdefghijkl|abc\.def\.ghijkl|zzz|custom-secret-value/.test(out), out);
  assert.match(out, /x=1/);
});

// ---------- settings ----------
test("model settings: defaults, validation and persistence", async () => {
  const s = await getModelSettings();
  assert.equal(s.provider, "openai");
  assert.ok(s.defaultModel && s.plannerModel);

  const bad = validateModelSettings({ defaultModel: "bad model!", maxRetries: 99, requestTimeoutSec: 1.5 });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["defaultModel", "maxRetries", "requestTimeoutSec"]);

  const res = await updateModelSettings({ defaultModel: "gpt-4o-mini", maxRetries: 2, pricingOverrides: { "x-model": { input: 1, output: 2 } } });
  assert.equal(res.ok, true);
  const again = await getModelSettings();
  assert.equal(again.defaultModel, "gpt-4o-mini");
  assert.equal(again.maxRetries, 2);
  assert.deepEqual(again.pricingOverrides, { "x-model": { input: 1, output: 2 } });
});

// ---------- usage ----------
test("usage store aggregates totals, per-model and failures", async () => {
  await recordUsage({ model: "gpt-4o-mini", purpose: "test", ok: true, inputTokens: 100, outputTokens: 50, costUsd: 0.001 });
  await recordUsage({ model: "gpt-4o-mini", purpose: "planner", ok: true, inputTokens: 200, outputTokens: 50, costUsd: 0.002 });
  await recordUsage({ model: "new-model", purpose: "test", ok: true, inputTokens: 10, outputTokens: 10, costUsd: null });
  await recordUsage({ model: "gpt-4o-mini", purpose: "test", ok: false, errorType: "rate_limit" });
  const u = await getUsageSummary({ days: 1 });
  assert.equal(u.totals.calls, 4);
  assert.equal(u.totals.failed, 1);
  assert.equal(u.totals.inputTokens, 310);
  assert.equal(u.totals.unpricedCalls, 1);
  assert.equal(u.totals.costUsd, 0.003);
  assert.equal(u.byModel.find((m) => m.key === "gpt-4o-mini").calls, 3);
  assert.equal(u.recent[0].errorType, "rate_limit");
});
