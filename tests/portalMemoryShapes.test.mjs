// NEXUS super memory against the REAL <agent>_memory shapes of the seven portals, plus "runs as". Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-shapes-"));
process.env.INTERNAL_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONNECTOR_ENCRYPTION_KEY = "test-master-key-0123456789abcdef";

const core = await import("../src/lib/memory/memoryCore.js");
const sm = await import("../src/lib/memory/superMemory.js");
const { encryptSecret } = await import("../src/lib/security/secretBox.js");

const STATUS = { builtAt: "2026-11-27T21:30:00.000Z", building: false, version: 1, collections: 2, gaps: 0 };
const VAL = (...v) => v.map((value, i) => ({ value, count: 10 - i }));

// Built from each portal's producing code (Nov 2026).
const FIXTURES = {
  aila: {
    portal: "ATLAS CRM", agent: "AILA", status: { ...STATUS, state: "complete", gaps: [] },
    data: {
      version: 3, builtAt: STATUS.builtAt, gaps: [{ name: "auditlogs", error: "timed out" }],
      collections: [
        { name: "leads", count: 52310, purpose: "Admissions enquiries", fields: [{ path: "leadStage", type: "string", fill: 99, values: VAL("Untouched", "Counselling Given") }, { path: "email", type: "string", fill: 88 }], relations: [{ column: "assignedCounselorId", to: "users" }] },
        { name: "applications", count: 4100, purpose: "Applications", fields: [] },
      ],
    },
    orgRules: [{ id: "r1", topic: "hot leads", rule: "Lead Temperature = Hot", updatedAt: null }],
    summary: "DATABASE MEMORY …",
  },
  kairo: {
    status: STATUS,
    memory: { agent: "KAIRO", portal: "ATLAS Career Services", builtAt: STATUS.builtAt, tables: [{ name: "placement_drives", rows: 320, purpose: "Recruiter drives", columns: [{ name: "status", type: "varchar", fill: 100, values: VAL("open", "closed") }, { name: "contact_email", type: "varchar", fill: 70, personal: true }], relations: [{ column: "company_id", table: "companies", kind: "foreign key" }] }], gaps: [{ table: "logs", error: "too slow" }] },
    orgRules: [{ id: 1, text: "Drive = recruitment event", updatedAt: null }],
  },
  voya: {
    agent: "VOYA", portal: "ATLAS International", status: STATUS, scope: "full",
    dataMemory: { builtAt: STATUS.builtAt, gaps: [], tables: [{ table: "applicants", rows: 880, purpose: "International applicants", columns: [{ name: "visa_status", type: "varchar", fill: 60, values: VAL("Applied", "Granted") }], links: [{ column: "university_id", to: "partner_universities" }] }] },
    orgRules: [{ about: "exchange", instruction: "Semester abroad", updatedAt: null }],
  },
  nova: {
    agent: "NOVA", level: "full", builtAt: STATUS.builtAt, tablesTotal: 1, scan_state: "complete", status: STATUS, gaps: [],
    tables: [{ table: "dash_exam_schedule", purpose: "Exams", links: [], estRows: 12000, newest: "2026-11-27", columns: [{ name: "exam_type", type: "varchar", fill: 1, top: VAL("Mid term", "End term") }] }],
    org_rules: [{ id: "o1", text: "Term = academic session" }],
  },
  mira: {
    status: STATUS, built: true, version: 2, builtAt: STATUS.builtAt, complete: true, gaps: { atlas_hrapp_audit_log: "timed out" },
    tables: [{ name: "atlas_hrapp_leave_request", entity: "leave_request", purpose: "Leave requests", rows: 5400, sampled: 200, fields: [{ name: "status", type: "varchar", kind: "value", fill: 100, top: VAL("PENDING", "APPROVED") }, { name: "password_hash", type: "varchar", kind: "secret", redacted: true }], relations: [{ column: "employee_id", references: "atlas_hrapp_employee.id", declared: true }] }],
    org_rules: [{ id: 3, text: "Pending = awaiting HOD" }],
  },
  miraLimited: { status: STATUS, scope: "limited", org_rules: [{ id: 3, text: "Pending = awaiting HOD" }] },
  sage: {
    status: { ...STATUS, scan: "complete" }, gaps: [{ table: "big", error: "budget" }], orgRules: [{ id: 1, text: "At risk = below 60%" }],
    tables: [{ table: "lx_courses", rows: 140, newest: null, oldest: null, purpose: "Courses", columns: [{ name: "status", type: "varchar", fill: 100 }], vocab: { status: [["published", 120], ["draft", 20]] }, relationships: [{ column: "school_id", to: "lx_schools", declared: true }] }],
    note: "As of the last scan",
  },
  arya: {
    agent: "ARYA", builtAt: STATUS.builtAt, version: 1, status: STATUS, gaps: [], orgRules: [{ id: 7, text: "Verified = documents checked" }],
    tables: [{ table: "applications", rows: 9000, purpose: "Applications", columns: [{ name: "stage", type: "varchar", fill: 100 }], vocab: { stage: VAL("Submitted", "Verified") }, relations: [{ column: "program_id", to: "programs" }] }],
  },
};

const EXPECT = {
  aila: { table: "leads", count: 52310, vocab: ["leads.leadStage", "Counselling Given"], rule: /hot leads: Lead Temperature/, link: /leads\.assignedCounselorId → users/, gap: /auditlogs/ },
  kairo: { table: "placement_drives", count: 320, vocab: ["placement_drives.status", "open"], rule: /recruitment event/, link: /company_id → companies/, gap: /logs/ },
  voya: { table: "applicants", count: 880, vocab: ["applicants.visa_status", "Granted"], rule: /exchange: Semester/, link: /partner_universities/ },
  nova: { table: "dash_exam_schedule", count: 12000, vocab: ["dash_exam_schedule.exam_type", "End term"], rule: /academic session/ },
  mira: { table: "atlas_hrapp_leave_request", count: 5400, vocab: ["atlas_hrapp_leave_request.status", "PENDING"], rule: /awaiting HOD/, link: /employee_id → atlas_hrapp_employee\.id/, gap: /audit_log/ },
  sage: { table: "lx_courses", count: 140, vocab: ["lx_courses.status", "published"], rule: /At risk/, link: /school_id → lx_schools/, gap: /big/ },
  arya: { table: "applications", count: 9000, vocab: ["applications.stage", "Verified"], rule: /documents checked/, link: /program_id → programs/ },
};

for (const [name, want] of Object.entries(EXPECT)) {
  test(`${name}: the real memory shape is condensed (tables, counts, vocabularies, rules, links, gaps)`, () => {
    const persona = name.toUpperCase();
    const entry = core.condensePortal({
      project: { id: name, name: `ATLAS ${persona}` },
      agent: { portal: `ATLAS ${persona}`, persona, id: name },
      results: [{ action: `${name}_memory`, ok: true, data: FIXTURES[name] }],
    });
    assert.equal(entry.status, "ok", JSON.stringify(entry.gaps));
    const c = entry.collections.find((x) => x.name === want.table);
    assert.ok(c, `table ${want.table}`);
    assert.equal(c.count, want.count);
    const v = entry.vocabularies.find((x) => x.name === want.vocab[0]);
    assert.ok(v && v.values.includes(want.vocab[1]), `vocab ${want.vocab.join(" ")}: ${JSON.stringify(entry.vocabularies)}`);
    assert.ok(entry.rules.some((r) => want.rule.test(r)), JSON.stringify(entry.rules));
    if (want.link) assert.ok(entry.relations.some((r) => want.link.test(r)), JSON.stringify(entry.relations));
    if (want.gap) assert.ok(entry.gaps.some((g) => want.gap.test(g)), JSON.stringify(entry.gaps));
    assert.equal(entry.portalBuiltAt, STATUS.builtAt);
    assert.doesNotMatch(JSON.stringify(entry), /password_hash.*top|contact_email.*values/);
    assert.match(core.summarizeSuperMemory({ builtAt: "x", portals: { [name]: entry } }), new RegExp(want.table));
  });
}

test("mira: a status-only (limited) answer is recorded as a 'runs as' gap, not an error", () => {
  const entry = core.condensePortal({ project: { id: "hr", name: "ATLAS HRMS" }, agent: { portal: "ATLAS HRMS", persona: "MIRA", id: "hrms" }, results: [{ action: "mira_memory", ok: true, data: FIXTURES.miraLimited }] });
  assert.equal(entry.status, "limited");
  assert.match(entry.gaps[0], /Super memory runs as/);
  assert.ok(entry.rules.some((r) => /awaiting HOD/.test(r)), "org rules still kept");
});

// --- "runs as" over HTTP ------------------------------------------------------
const hits = [];
let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    const user = req.headers["x-intelligenceos-user"] || null;
    hits.push({ url: req.url, user });
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/mira/memory")) {
      if (!user) return res.writeHead(403).end(JSON.stringify({ error: "X-IntelligenceOS-User is required" }));
      return res.end(JSON.stringify(user === "hradmin@atlasuniversity.edu.in" ? FIXTURES.mira : FIXTURES.miraLimited));
    }
    res.writeHead(404).end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/agent-api`;
});
after(() => server.close());

const hrProject = (runAs) => ({
  id: "hrms", name: "ATLAS HRMS", baseUrl: base, enabled: true, status: "connected", delegated: true,
  keyBox: encryptSecret("k".repeat(24)), keyLast4: "kkkk", ...(runAs !== undefined ? { superMemoryRunAs: runAs } : {}),
  manifest: { actions: [{ id: "mira_memory", name: "m", method: "GET", path: "/mira/memory", risk: "read", params: [] }] },
});

test("runs as: no email → 403 becomes a clear gap; staff email → status only; HR admin → full memory", async () => {
  // Paths are relative to the server root; point baseUrl at it.
  const list = (runAs) => async () => [{ ...hrProject(runAs), baseUrl: base.replace("/agent-api", "") }];
  await sm.rebuildSuperMemory({}, { listProjects: list(undefined) });
  let s = await sm.readSuperMemory();
  assert.equal(hits.at(-1).user, null);
  assert.equal(s.portals.hrms.status, "limited");
  assert.match(s.portals.hrms.gaps[0], /refused mira_memory.*Super memory runs as/);

  await sm.rebuildSuperMemory({}, { listProjects: list("staff@atlasuniversity.edu.in") });
  s = await sm.readSuperMemory();
  assert.equal(hits.at(-1).user, "staff@atlasuniversity.edu.in");
  assert.equal(s.portals.hrms.status, "limited");
  assert.match(s.portals.hrms.gaps[0], /shared only its status/);

  await sm.rebuildSuperMemory({}, { listProjects: list("hradmin@atlasuniversity.edu.in") });
  s = await sm.readSuperMemory();
  assert.equal(hits.at(-1).user, "hradmin@atlasuniversity.edu.in");
  assert.equal(s.portals.hrms.status, "ok");
  assert.equal(s.portals.hrms.collections[0].count, 5400);
  assert.equal(s.portals.hrms.runAs, "hradmin@atlasuniversity.edu.in");
});

test("runs as: the email is validated", () => {
  assert.deepEqual(core.cleanRunAs(" HRAdmin@Atlas.edu "), { value: "hradmin@atlas.edu" });
  assert.deepEqual(core.cleanRunAs(""), { value: "" });
  assert.ok(core.cleanRunAs("not an email").error);
});
