// ATLAS agent etiquette (A1/A2) + NEXUS memory (B2/B3/B5). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-mem-"));
process.env.OPENAI_API_KEY = "sk-test-secret-value-123456";

const g = await import("../src/lib/assistant/greeting.js");
const { etiquettePrompt, ETIQUETTE_RULES } = await import("../src/lib/assistant/etiquette.js");
const core = await import("../src/lib/memory/memoryCore.js");
const learned = await import("../src/lib/memory/learnedMemory.js");
const sm = await import("../src/lib/memory/superMemory.js");
const { answerQuestion, systemPrompt, voiceRules } = await import("../src/lib/assistant/assistant.js");
const { runSystemPrompt } = await import("../src/lib/engine/prompt.js");
const { plannerSystemPrompt } = await import("../src/lib/planner/prompts.js");
const reg = await import("../src/lib/portals/portalAgents.js");

// A UTC instant whose IST hour is `h` (IST = UTC+5:30).
const atIst = (h, m = 0) => new Date(Date.UTC(2026, 10, 27, h, m) - 330 * 60_000);

test("greeting bands on the boundary hours (IST), and the client uses the same module", () => {
  const want = { 4: "Hello", 5: "Good morning", 11: "Good morning", 12: "Good afternoon", 16: "Good afternoon", 17: "Good evening", 21: "Good evening", 22: "Hello" };
  for (const [h, text] of Object.entries(want)) {
    assert.equal(g.greetingFor({ now: atIst(Number(h)), tz: "Asia/Kolkata" }), text, `hour ${h}`);
    assert.equal(g.greetingForHour(Number(h)), text);
  }
  assert.equal(g.greetingForHour(0), "Hello");
  assert.doesNotMatch(Object.values(want).join(" "), /night/i);
});

test("time zone: the user's zone when valid, IST when missing or bad; unreadable clock → Hello", () => {
  const noonUtc = new Date(Date.UTC(2026, 10, 27, 12, 0));
  assert.equal(g.greetingFor({ now: noonUtc, tz: "Europe/London" }), "Good afternoon");
  assert.equal(g.greetingFor({ now: noonUtc, tz: "America/New_York" }), "Good morning"); // 07:00
  assert.equal(g.resolveTimeZone("Mars/Olympus"), "Asia/Kolkata");
  assert.equal(g.resolveTimeZone(""), "Asia/Kolkata");
  assert.equal(g.resolveTimeZone(null), "Asia/Kolkata");
  assert.equal(g.greetingFor({ now: noonUtc, tz: "nope" }), "Good evening"); // 17:30 IST
  assert.equal(g.greetingFor({ now: "not a date" }), "Hello");
  assert.equal(g.greetLine({ name: "priya sharma", now: atIst(9) }), "Good morning, Priya!");
  assert.equal(g.greetLine({ name: "x@y.edu", now: atIst(9) }), "Good morning!");
  assert.match(g.localTimeText({ now: atIst(15, 30) }), /27 Nov 2026.*3:30 PM IST/);
});

test("client welcome line and server prompt agree (both import greeting.js)", async () => {
  const src = await readFile(new URL("../src/components/home/WelcomeGreeting.js", import.meta.url), "utf8");
  assert.match(src, /from "@\/lib\/assistant\/greeting"/);
  assert.doesNotMatch(src, /Good (morning|afternoon|evening)/);
  const home = await readFile(new URL("../src/components/home/HomeBody.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /hour < 12/);
});

test("etiquette text is in every prompt path: chat, voice, agent runs, planner", () => {
  assert.equal(ETIQUETTE_RULES.length, 12);
  const clock = g.clockContext({ now: atIst(9), tz: "Asia/Kolkata", name: "Priya" });
  const chat = systemPrompt({ projects: "", today: "2026-11-27", clock, firstTurn: true });
  assert.match(chat, /ETIQUETTE/);
  assert.match(chat, /open with "Good morning, Priya!"/);
  assert.match(chat, /Networked Executive for Unified Systems/);
  const later = systemPrompt({ projects: "", today: "2026-11-27", clock, firstTurn: false });
  assert.match(later, /do NOT greet again/);
  const voice = systemPrompt({ projects: "", today: "2026-11-27", clock, voice: { language: "hi" } });
  assert.match(voice, /ETIQUETTE/);
  assert.match(voiceRules(), /never a human/);
  const run = runSystemPrompt(
    { name: "Daily", instructions: "Do it.", steps: [], tools: [], trigger: { type: "manual" } },
    { mode: "live", executable: () => true },
  );
  assert.match(run, /Etiquette/);
  assert.match(run, /lakh \/ crore/);
  assert.match(plannerSystemPrompt(), /Etiquette/);
  assert.match(etiquettePrompt(), /Sunday is the weekly off/);
});

test("registry: every portal agent has <agent>_memory, recognised by its manifest", () => {
  for (const p of reg.PORTAL_AGENTS) assert.equal(p.memoryAction, `${p.persona.toLowerCase()}_memory`);
  assert.equal(reg.portalAgentFor({ name: "X", actions: [{ id: "mira_memory" }] }).persona, "MIRA");
  assert.match(reg.portalAgentTag({ name: "ATLAS HRMS", actions: [{ id: "mira_memory" }] }), /memory "mira_memory"/);
});

test("memoryActionsFor: only memory/brain actions present in the manifest (GET, read, no required params)", () => {
  const act = (id, extra = {}) => ({ id, method: "GET", risk: "read", params: [], ...extra });
  assert.deepEqual(core.memoryActionsFor({ name: "ATLAS CRM", manifest: { actions: [act("aila_memory"), act("aila_brain"), act("ask_aila")] } }).actions, ["aila_memory", "aila_brain"]);
  assert.deepEqual(core.memoryActionsFor({ name: "ATLAS CRM", manifest: { actions: [act("aila_brain")] } }).actions, ["aila_brain"]);
  assert.deepEqual(core.memoryActionsFor({ name: "ATLAS CRM", manifest: { actions: [act("aila_memory", { method: "POST", risk: "write" })] } }).actions, []);
  assert.deepEqual(core.memoryActionsFor({ name: "ATLAS CRM", manifest: { actions: [act("aila_memory", { params: [{ name: "q", required: true }] })] } }).actions, []);
  assert.deepEqual(core.memoryActionsFor({ name: "Other", manifest: { actions: [act("list")] } }).actions, []);
});

test("redaction: secrets dropped, personal fields keep shape but no values", () => {
  const out = core.redactPayload({
    collections: [{ name: "leads", count: 120 }],
    password: "hunter2",
    apiKey: "k",
    email: "a@b.com",
    fields: { phone: { type: "string", fillRate: 0.9, topValues: ["9876543210"] } },
    note: "call priya at priya@x.com or 9876543210",
  });
  const text = JSON.stringify(out);
  assert.doesNotMatch(text, /hunter2|a@b\.com|9876543210|priya@x\.com/);
  assert.equal(out.password, undefined);
  assert.equal(out.apiKey, undefined);
  assert.equal(out.email, "[personal]");
  assert.equal(out.fields.phone.fillRate, 0.9);
  assert.equal(out.collections[0].name, "leads"); // structural "name" kept
});

test("Amendment 1: field names are matched on tokens", () => {
  for (const keep of ["company", "program_name", "school_name", "expansion", "template_name", "course_name", "leadStage"]) assert.equal(core.classifyField(keep), null, keep);
  for (const [f, k] of [["pan_number", "secret"], ["api_key", "secret"], ["apiKey", "secret"], ["passwordHash", "secret"], ["account_number", "secret"], ["first_name", "personal"], ["fatherMobile", "personal"], ["fatherMobileNo", "personal"], ["name", "personal"], ["username", "personal"], ["studentName", "personal"], ["email_id", "personal"]]) {
    assert.equal(core.classifyField(f), k, f);
  }
  assert.deepEqual(core.fieldTokens("fatherMobileNo"), ["father", "mobile", "no"]);
  const out = core.redactPayload({ company: "Infosys", program_name: "BBA", pan_number: "ABCDE1234F", first_name: "Priya", fields: { school_name: { topValues: ["ISDI", "priya@x.com", "98765 43210", "y".repeat(90)] } } });
  assert.equal(out.company, "Infosys");
  assert.equal(out.program_name, "BBA");
  assert.equal(out.pan_number, undefined);
  assert.equal(out.first_name, "[personal]");
  assert.deepEqual(out.fields.school_name.topValues, ["ISDI"]);
  // A bare "name" in a collection descriptor is structural; on a person record it is personal.
  assert.equal(core.redactPayload({ collections: [{ name: "leads", count: 3 }] }).collections[0].name, "leads");
  assert.equal(core.redactPayload({ person: { name: "Priya", city: "Pune" } }).person.name, "[personal]");
});

const PROJECTS = [
  { id: "crm", name: "ATLAS CRM", enabled: true, status: "connected", manifest: { actions: [{ id: "aila_memory", method: "GET", risk: "read", params: [], path: "/aila/memory" }, { id: "aila_brain", method: "GET", risk: "read", params: [], path: "/aila/brain" }] } },
  { id: "adm", name: "ATLAS Admissions", enabled: true, status: "connected", manifest: { actions: [{ id: "arya_brain", method: "GET", risk: "read", params: [], path: "/arya/brain" }] } },
  { id: "hr", name: "ATLAS HRMS", enabled: true, status: "connected", manifest: { actions: [{ id: "list_employees", method: "GET", risk: "read", params: [], path: "/x" }] } },
];
const FETCH = {
  aila_memory: { ok: true, data: { collections: [{ name: "leads", count: 52310, purpose: "admissions enquiries" }], vocabularies: { leadStage: ["Untouched", "Counselling Given", "Closed"] }, password: "x", email: "a@b.com" } },
  aila_brain: { ok: true, data: { observations: ["412 leads not opened in 24h"] } },
  arya_brain: { ok: false, error: "HTTP 503" },
};

test("super memory: builds per portal, records gaps, links, and stays bounded in the prompt", async () => {
  const calls = [];
  const r = await sm.rebuildSuperMemory(
    { reason: "test" },
    { listProjects: async () => PROJECTS, fetchAction: async (p, a) => (calls.push(a.id), { action: a.id, ...FETCH[a.id] }) },
  );
  assert.equal(r.reason, "test");
  assert.deepEqual(calls.sort(), ["aila_brain", "aila_memory", "arya_brain"]);
  assert.deepEqual(r.noMemory, ["hr"]);
  assert.equal(r.skipped, undefined, "skipped means another build was running");
  const store = await sm.readSuperMemory();
  assert.equal(store.portals.crm.status, "ok");
  assert.equal(store.portals.crm.persona, "AILA");
  assert.equal(store.portals.crm.collections[0].count, 52310);
  assert.equal(store.portals.adm.status, "error");
  assert.match(store.portals.adm.gaps[0], /503/);
  assert.doesNotMatch(JSON.stringify(store), /a@b\.com/);
  const summary = core.summarizeSuperMemory(store);
  assert.match(summary, /AILA/);
  assert.match(summary, /leads 52,310/);
  assert.ok(summary.length <= core.SUMMARY_MAX_CHARS);
  const big = { builtAt: "x", portals: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, { portal: `P${i}`, status: "ok", collections: Array.from({ length: 50 }, (_, j) => ({ name: `c${j}`.repeat(10), count: j, purpose: "y".repeat(200) })) }])) };
  assert.ok(core.summarizeSuperMemory(big).length <= core.SUMMARY_MAX_CHARS);
  const pub = core.publicSuperMemory(store);
  assert.equal(pub.portals.find((p) => p.projectId === "crm").collections, 1);
  assert.equal(JSON.stringify(pub).includes("Untouched"), false); // no raw text in the status view
  // A later failing run keeps the older good entry, marked stale.
  await sm.rebuildSuperMemory({ projectIds: ["crm"] }, { listProjects: async () => PROJECTS, fetchAction: async (p, a) => ({ action: a.id, ok: false, error: "down" }) });
  const s2 = await sm.readSuperMemory();
  assert.equal(s2.portals.crm.status, "stale");
  assert.equal(s2.portals.crm.collections[0].name, "leads");
  assert.ok(s2.portals.adm, "partial rebuild keeps other portals");
});

test("super memory: single-flight — a second build while one runs is skipped", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const first = sm.rebuildSuperMemory({}, { listProjects: async () => (await gate, []) });
  const second = await sm.rebuildSuperMemory({}, { listProjects: async () => [] });
  assert.deepEqual(second, { skipped: "running" });
  release();
  await first;
});

test("nightly window: 02:30–04:30 IST once per date; outside the window nothing", () => {
  assert.equal(core.nightlyDue({}, atIst(2, 29)), null);
  assert.equal(core.nightlyDue({}, atIst(3, 0)), "2026-11-27");
  assert.equal(core.nightlyDue({ lastNightly: "2026-11-27" }, atIst(3, 0)), null);
  assert.equal(core.nightlyDue({}, atIst(4, 30)), null);
});

test("memory_lookup is bounded and finds super + learned memory", () => {
  const store = { builtAt: "t", portals: { crm: { portal: "ATLAS CRM", persona: "AILA", collections: Array.from({ length: 40 }, (_, i) => ({ name: `leads_${i}`, count: i })), text: "x".repeat(30_000) } } };
  const r = core.lookupMemory({ superStore: store, learned: [{ id: "m1", text: "hot leads mean Lead Temperature Hot", scope: "org" }], query: "leads", limit: 50 });
  assert.ok(r.matches.length <= core.LOOKUP_MAX);
  assert.ok(r.matches.every((m) => m.text.length <= core.LOOKUP_ITEM_MAX + 1));
  assert.ok(core.lookupMemory({ superStore: store, learned: [{ id: "m1", text: "hot leads mean Temperature Hot", scope: "org" }], query: "hot temperature" }).matches.some((m) => m.id === "m1"));
  assert.deepEqual(core.lookupMemory({ superStore: store, query: "" }).matches, []);
});

test("remember / forget: per user, org only for admins, bounded, deduped, no secrets or contacts", async () => {
  const admin = { id: "u_1", role: "admin" };
  const staff = { id: "u_2", role: "user" };
  await learned.rememberItem(staff, { scope: "me", text: "Call me Priya" });
  await learned.rememberItem(staff, { scope: "me", text: "call me priya" }); // dedupe
  assert.equal((await learned.getLearnedMemory(staff)).personal.length, 1);
  assert.equal((await learned.getLearnedMemory(admin)).personal.length, 0, "other people's memory is not visible");
  await assert.rejects(learned.rememberItem(staff, { scope: "org", text: "x" }), /Only administrators/);
  await assert.rejects(learned.rememberItem(staff, { text: "my password is abc" }), /secrets/);
  await assert.rejects(learned.rememberItem(staff, { text: "email boss@x.com" }), /email addresses/);
  const rule = await learned.rememberItem(admin, { scope: "org", text: "Pending means awaiting approval" });
  assert.equal((await learned.getLearnedMemory(staff)).org.length, 1);
  await assert.rejects(learned.forgetItem(staff, { id: rule.id }), /only an administrator/);
  for (let i = 0; i < 60; i++) await learned.rememberItem(staff, { text: `preference number ${i}` });
  assert.equal((await learned.getLearnedMemory(staff)).personal.length, core.USER_ITEMS_MAX);
  const f = await learned.forgetItem(staff, { text: "preference number 59" });
  assert.equal(f.removed.length, 1);
  assert.equal((await learned.forgetItem(admin, { id: rule.id })).removed.length, 1);
});

test("assistant: memory tools wired, summary + learned memory in the prompt, tz passed to reads", async () => {
  const calls = { model: [], read: [], remembered: [] };
  const replies = [
    { text: "", toolCalls: [{ id: "c1", name: "remember", arguments: { scope: "me", text: "Prefers tables" } }, { id: "c2", name: "memory_lookup", arguments: { query: "leads" } }, { id: "c3", name: "atlas_project__read", arguments: { project: "crm", action: "count" } }] },
    { text: "Good morning, Priya! Noted.", toolCalls: [] },
  ];
  const deps = {
    describe: async () => 'Project "crm" — CRM\n  - action "count": Count',
    readParameters: () => ({ type: "object" }),
    callRead: async (o) => (calls.read.push(o), { status: 200, data: { n: 1 }, project: { name: "CRM" } }),
    callModel: async (m, opts) => (calls.model.push(opts), { usage: {}, ...replies.shift() }),
    memory: {
      load: async () => ({ superStore: { builtAt: "t", portals: { crm: { portal: "ATLAS CRM", persona: "AILA", status: "ok", collections: [{ name: "leads", count: 9 }] } } }, learned: { personal: [{ id: "m9", text: "Call me Priya" }], org: [] } }),
      remember: async (actor, it) => (calls.remembered.push(it), { id: "m10", scope: it.scope, text: it.text }),
      forget: async () => ({ removed: [] }),
    },
  };
  const r = await answerQuestion({ message: "remember I like tables", actor: { id: "u_2", name: "Priya S", email: "p@x.edu" }, tz: "Europe/London", now: new Date(Date.UTC(2026, 10, 27, 9)) }, deps);
  assert.equal(r.route, "answer");
  const sys = calls.model[0].messages[0].content;
  assert.match(sys, /SUPER MEMORY/);
  assert.match(sys, /Call me Priya/);
  assert.match(sys, /open with "Good morning, Priya!"/);
  assert.ok(calls.model[0].tools.some((t) => t.name === "memory_lookup"));
  assert.deepEqual(calls.remembered, [{ scope: "me", text: "Prefers tables" }]);
  assert.equal(calls.read[0].timeZone, "Europe/London");
  const toolMsgs = calls.model[1].messages.filter((m) => m.role === "tool").map((m) => m.content).join("\n");
  assert.match(toolMsgs, /leads/);
});

test("rebuild portal memories too: refresh=1 on <agent>_memory only, then wait, then fetch", async () => {
  const seen = [];
  let slept = null;
  const r = await sm.rebuildSuperMemory(
    { reason: "manual", refreshPortals: true },
    {
      listProjects: async () => PROJECTS,
      fetchAction: async (p, a, o = {}) => (seen.push(`${a.id}${o.refresh ? "?refresh" : ""}`), { action: a.id, ...FETCH[a.id] }),
      sleep: async (ms) => {
        slept = ms;
        seen.push("sleep");
      },
    },
  );
  assert.equal(seen[0], "aila_memory?refresh");
  assert.equal(seen[1], "sleep");
  assert.ok(slept > 0);
  assert.equal(seen.filter((s) => s.includes("?refresh")).length, 1, "brain actions are never refreshed");
  assert.deepEqual(r.refreshed, [{ projectId: "crm", ok: true }]);
  // Default: no refresh call at all.
  const plain = [];
  await sm.rebuildSuperMemory({}, { listProjects: async () => PROJECTS, fetchAction: async (p, a, o = {}) => (plain.push(o.refresh), { action: a.id, ...FETCH[a.id] }) });
  assert.ok(plain.every((x) => !x));
});

test("CLI script exists and exits non-zero when every portal failed", async () => {
  const src = await readFile(new URL("../scripts/build-super-memory.mjs", import.meta.url), "utf8");
  assert.match(src, /every\(\(p\) => p\.status === "error"\) \? 1 : 0/);
  assert.match(src, /--refresh/);
});
