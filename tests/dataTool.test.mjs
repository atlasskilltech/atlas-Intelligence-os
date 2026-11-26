// Large tool results: datasets + query_data. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-data-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";

const { compactPayload, queryDataset, queryWithin, PREVIEW_ROWS } = await import("../src/lib/engine/dataTool.js");
const repo = await import("../src/lib/agents/agentRepo.js");
const engine = await import("../src/lib/engine/runner.js");
const runs = await import("../src/lib/runs/runRepo.js");
const { BUILTIN_TOOLS } = await import("../src/lib/tools/builtins.js");

const SCHOOLS = ["ISDI", "UnitedWorld", "ATLAS Law", "ATLAS Business"];
const faculty = Array.from({ length: 300 }, (_, i) => ({
  id: `F${i}`,
  name: `Faculty ${i}`,
  email: `faculty${i}@atlasuniversity.edu.in`,
  school: SCHOOLS[i % SCHOOLS.length],
  designation: "Assistant Professor — a long-ish designation text to make rows realistic",
}));
// Every third faculty member teaches on 26 Nov (two slots each → duplicates).
const slots = faculty
  .filter((_, i) => i % 3 === 0)
  .flatMap((f) => [
    { date: "2026-11-26", start: "09:00", end: "10:00", faculty: { email: f.email, name: f.name }, room: "A101" },
    { date: "2026-11-26", start: "14:00", end: "15:00", faculty: { email: f.email, name: f.name }, room: "B202" },
  ]);
const big = { status: 200, data: { faculty, slots } };

// ---------------------------------------------------------------------------
test("small payloads pass through unchanged", () => {
  const r = compactPayload({ a: 1, list: [1, 2, 3] }, { maxChars: 1000, newId: () => "x" });
  assert.equal(r.text, '{"a":1,"list":[1,2,3]}');
  assert.equal(r.datasets.length, 0);
});

test("large payloads become valid JSON with dataset stubs instead of cut-off text", () => {
  let n = 0;
  const r = compactPayload(big, { maxChars: 8000, newId: () => `ds_${++n}` });
  assert.ok(r.text.length <= 8000);
  assert.equal(r.clipped, false);
  const parsed = JSON.parse(r.text); // valid JSON
  assert.equal(parsed.status, 200);
  const ids = r.datasets.map((d) => d.id);
  assert.deepEqual(ids.sort(), ["ds_1", "ds_2"]);
  const fac = r.datasets.find((d) => d.path === "data.faculty");
  assert.equal(fac.rows.length, 300);
  assert.equal(parsed.data.faculty.totalRows, 300);
  assert.ok(parsed.data.faculty.fields.includes("school") && parsed.data.faculty.fields.includes("email"));
  assert.ok(parsed.data.faculty.preview.length <= PREVIEW_ROWS);
  assert.match(parsed.data.faculty.note, /query_data/);
  const sl = r.datasets.find((d) => d.path === "data.slots");
  assert.ok(sl.fields.includes("faculty.email"));
});

test("top-level arrays and primitive arrays are handled", () => {
  const r = compactPayload({ ok: true, result: Array.from({ length: 2000 }, (_, i) => `name-${i}`) }, { maxChars: 2000, newId: () => "ds_1" });
  const p = JSON.parse(r.text);
  assert.equal(p.result.dataset, "ds_1");
  assert.equal(p.result.totalRows, 2000);
  assert.deepEqual(r.datasets[0].fields, ["value"]);
  const q = queryDataset(r.datasets[0].rows, { where: [{ field: "value", op: "startsWith", value: "NAME-199" }] });
  assert.equal(q.totalMatched, 11);
});

test("query: filter, select, distinct, sort, paging", () => {
  const q = queryDataset(slots, { where: [{ field: "date", op: "eq", value: "2026-11-26" }, { field: "start", op: "gte", value: "09:00" }, { field: "end", op: "lte", value: "18:00" }], select: ["faculty.email"], distinct: true, limit: 40 });
  assert.equal(q.totalMatched, 100);
  assert.equal(q.returned, 40);
  assert.equal(q.nextOffset, 40);
  assert.deepEqual(Object.keys(q.rows[0]), ["faculty.email"]);
  const last = queryDataset(slots, { select: ["faculty.email"], distinct: true, offset: 80, limit: 40 });
  assert.equal(last.returned, 20);
  assert.equal(last.nextOffset, null);
  const sorted = queryDataset(faculty, { sort: "name", order: "desc", limit: 1, select: ["name"] });
  assert.equal(sorted.rows[0].name, "Faculty 99"); // string order
  assert.throws(() => queryDataset(faculty, { select: ["phone"] }), /Unknown field.*Fields in this dataset/);
});

test("query: free faculty grouped by school (excludeMatching + groupBy)", () => {
  const datasets = { ds_2: slots };
  const q = queryDataset(
    faculty,
    {
      select: ["name", "email"],
      groupBy: "school",
      excludeMatching: { dataset: "ds_2", field: "email", otherField: "faculty.email", where: [{ field: "date", op: "eq", value: "2026-11-26" }] },
      limit: 500,
    },
    { load: (id) => datasets[id] },
  );
  assert.equal(q.totalMatched, 200); // 300 minus the 100 who teach
  assert.equal(Object.values(q.groupCounts).reduce((a, b) => a + b, 0), 200);
  assert.deepEqual(q.groups.map((g) => g.key).sort(), [...SCHOOLS].sort());
  assert.ok(q.groups.every((g) => g.rows.every((r) => r.email && r.name && !("school" in r))));
  assert.ok(!q.groups.flatMap((g) => g.rows).some((r) => r.email === "faculty0@atlasuniversity.edu.in"));
  const counts = queryDataset(faculty, { groupBy: "school", countOnly: true });
  assert.equal(counts.rows, undefined);
  assert.equal(counts.groupCounts.ISDI, 75);
});

test("queryWithin shrinks the page to fit and reports nextOffset", () => {
  const r = queryWithin(faculty, { limit: 500 }, {}, 6000);
  assert.ok(JSON.stringify(r).length <= 6000);
  assert.ok(r.returned < 300 && r.returned > 0);
  assert.equal(r.nextOffset, r.returned);
});

// ---------------------------------------------------------------------------
// Engine: a big project response is stored and queried in a run.

const actor = { id: "local-user", name: "Tester", role: "admin" };
const executors = {
  ...BUILTIN_TOOLS,
  "atlas_project.read": {
    parameters: { type: "object", properties: { project: { type: "string" }, action: { type: "string" }, params: { type: "object" } } },
    async execute() {
      return big;
    },
  },
};
function fakeModel(replies) {
  const calls = [];
  const fn = async (method, opts) => {
    calls.push({ tools: opts.tools.map((t) => t.name), messages: structuredClone(opts.messages) });
    const r = replies.shift();
    if (!r) throw new Error("fake model: no more replies");
    return { text: "", toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0, latencyMs: 1, model: "fake", ...r };
  };
  fn.calls = calls;
  return fn;
}
const call = (name, args) => ({ toolCalls: [{ id: `c_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args }] });

test("engine: large tool result → dataset stub → query_data returns full, grouped data", async () => {
  const agent = await repo.createAgent(
    actor,
    {
      name: "Faculty Free Report",
      description: "",
      instructions: "List free faculty by school.",
      steps: [{ title: "Read timetable", tool: "atlas_project.read" }],
      trigger: { type: "manual", schedule: null },
    },
    { activate: true },
  );
  const run = await engine.startRun(actor, agent.id, { mode: "test" });
  const model = fakeModel([
    call("atlas_project__read", { project: "timetable", action: "day_timetable", params: { date: "2026-11-26" } }),
    call("query_data", {
      dataset: "ds_1",
      select: ["name", "email"],
      groupBy: "school",
      excludeMatching: { dataset: "ds_2", field: "email", otherField: "faculty.email" },
      limit: 500,
    }),
    call("query_data", { dataset: "ds_9" }),
    { text: "200 faculty are free." },
  ]);
  await engine.executeRun(run.id, { callModel: model, executors, notify: async () => {} });

  const r = await runs.loadRun(run.id);
  assert.equal(r.status, "succeeded");
  // query_data is offered only once a dataset exists
  assert.ok(!model.calls[0].tools.includes("query_data"));
  assert.ok(model.calls[1].tools.includes("query_data"));
  // the stub the model saw is valid JSON with totals and fields
  const stubMsg = model.calls[1].messages.at(-1).content;
  const stub = JSON.parse(stubMsg.replace(/^<tool_result untrusted="true">\n/, "").replace(/\n<\/tool_result>$/, ""));
  assert.equal(stub.result.data.faculty.totalRows, 300);
  assert.equal(stub.result.data.faculty.dataset, "ds_1");
  // the query answer
  const answer = JSON.parse(model.calls[2].messages.at(-1).content.replace(/^<tool_result untrusted="true">\n/, "").replace(/\n<\/tool_result>$/, ""));
  assert.equal(answer.ok, true);
  assert.equal(answer.totalMatched, 200);
  assert.equal(answer.groups.length, 4);
  // bad dataset is refused, run continues
  assert.match(model.calls[3].messages.at(-1).content, /Unknown dataset .*ds_9/);
  // queries are not actions; datasets are recorded and cleaned up at the end
  assert.equal(r.stats.actions, 1);
  assert.equal(r.stats.dataQueries, 2);
  assert.deepEqual(r.datasets.map((d) => d.id), ["ds_1", "ds_2"]);
  assert.ok(r.events.some((e) => e.type === "data_stored"));
  await assert.rejects(access(path.join(process.env.DATA_DIR, `${run.id}.data.json`)));
});
