// ATLAS portal agents registry: presets, persona matching, prompt wiring, suggestions.
import { test } from "node:test";
import assert from "node:assert/strict";

const reg = await import("../src/lib/portals/portalAgents.js");
const { plannerSystemPrompt } = await import("../src/lib/planner/prompts.js");
const { PROMPT_SUGGESTIONS } = await import("../src/components/agents/suggestions.js");

const PERSONAS = { crm: "Aila", career_services: "KAIRO", international: "VOYA", dashboard: "NOVA", hrms: "MIRA", learnx: "SAGE", admissions: "ARYA" };

test("registry: seven portal agents, unique ids and actions, ask_/_brain naming", () => {
  assert.equal(reg.PORTAL_AGENTS.length, 7);
  const ids = new Set();
  const actions = new Set();
  for (const p of reg.PORTAL_AGENTS) {
    assert.equal(PERSONAS[p.id], p.persona, p.id);
    const slug = p.persona.toLowerCase();
    assert.equal(p.askAction, `ask_${slug}`);
    assert.equal(p.brainAction, `${slug}_brain`);
    assert.ok(!ids.has(p.id));
    ids.add(p.id);
    for (const a of [p.askAction, p.brainAction]) {
      assert.ok(!actions.has(a));
      actions.add(a);
    }
    assert.ok(p.focus && p.portal.startsWith("ATLAS "));
  }
});

test("presets: existing CRM / Career Services unchanged, four new portals delegated", () => {
  const presets = reg.portalPresets();
  const by = Object.fromEntries(presets.map((p) => [p.id, p]));
  assert.equal(by.crm.baseUrl, "https://uat-crm.atlasskilltech.app/api/intos/v1");
  assert.equal(by.crm.delegated, false);
  assert.equal(by.career_services.baseUrl, "https://uat-careerconnect.atlasskilltech.app/api/intos/v1");
  assert.equal(by.dashboard.baseUrl, "https://uat-dashboard.atlasskilltech.app/agent-api");
  assert.equal(by.hrms.baseUrl, "https://uat-hr.atlasskilltech.app/agent-api");
  for (const id of ["dashboard", "hrms", "learnx", "admissions"]) {
    assert.equal(by[id].delegated, true, id);
    assert.ok(by[id].baseUrl.endsWith("/agent-api"), id);
    assert.equal(by[id].persona, PERSONAS[id]);
    assert.equal(by[id].name, by[id].label);
    assert.ok(by[id].keyHint);
  }
  // LearnX and Admissions default to their UAT hosts (env overrides).
  if (!process.env.NEXT_PUBLIC_ATLAS_LEARNX_AGENT_URL) assert.equal(by.learnx.baseUrl, "https://uat-learnx.atlasskilltech.app/agent-api");
  if (!process.env.NEXT_PUBLIC_ATLAS_ADMISSIONS_AGENT_URL) assert.equal(by.admissions.baseUrl, "https://uat-admissions.atlasskilltech.app/agent-api");
  assert.equal(by.learnx.hostPlaceholder, false);
  assert.equal(by.admissions.hostPlaceholder, false);
  assert.equal(by.dashboard.hostPlaceholder, false);
  // No International preset unless a host is configured.
  if (!process.env.NEXT_PUBLIC_ATLAS_INTERNATIONAL_AGENT_URL) assert.equal(by.international, undefined);
});

test("portalAgentFor: actions win over the name, name is the fallback", () => {
  const act = (...ids) => ids.map((id) => ({ id }));
  assert.equal(reg.portalAgentFor({ name: "Something", manifest: { actions: act("list_agents", "nova_brain") } }).persona, "NOVA");
  assert.equal(reg.portalAgentFor({ name: "ATLAS CRM", actions: act("ask_mira") }).persona, "MIRA");
  assert.equal(reg.portalAgentFor({ name: "ATLAS LearnX" }).persona, "SAGE");
  assert.equal(reg.portalAgentFor({ name: "ATLAS Admissions" }).persona, "ARYA");
  assert.equal(reg.portalAgentFor({ name: "ATLAS HRMS" }).persona, "MIRA");
  assert.equal(reg.portalAgentFor({ name: "ATLAS Dashboard" }).persona, "NOVA");
  assert.equal(reg.portalAgentFor({ name: "ATLAS CRM" }).persona, "Aila");
  assert.equal(reg.portalAgentFor({ name: "ATLAS Career Services" }).persona, "KAIRO");
  assert.equal(reg.portalAgentFor({ name: "ATLAS Procurement" }), null);
  assert.equal(reg.portalAgentFor(null), null);
});

test("portalAgentTag names only the actions the project actually exposes", () => {
  assert.equal(reg.portalAgentTag({ name: "ATLAS HRMS", actions: [{ id: "ask_mira" }, { id: "mira_brain" }] }), ' [portal agent MIRA, ask via "ask_mira", brain "mira_brain"]');
  assert.equal(reg.portalAgentTag({ name: "ATLAS HRMS", actions: [] }), " [portal agent MIRA]");
  assert.equal(reg.portalAgentTag({ name: "Other", actions: [] }), "");
});

test("planner prompt lists every portal agent with its ask and brain action", () => {
  const prompt = plannerSystemPrompt({ projects: "" });
  for (const p of reg.PORTAL_AGENTS) {
    assert.ok(prompt.includes(p.persona), p.persona);
    assert.ok(prompt.includes(p.askAction), p.askAction);
    assert.ok(prompt.includes(p.brainAction), p.brainAction);
  }
});

test("suggestions: chips for every new portal agent, unique labels", () => {
  const labels = PROMPT_SUGGESTIONS.map((s) => s.label);
  assert.equal(new Set(labels).size, labels.length);
  const text = PROMPT_SUGGESTIONS.map((s) => s.prompt).join("\n");
  for (const name of ["NOVA", "MIRA", "SAGE", "ARYA"]) assert.ok(text.includes(name), name);
  for (const l of ["Pending approvals nudge", "Weekly attendance irregularities", "Grading queue", "At-risk students", "Daily admissions brief", "Document backlog watch", "Bot leads not pushed"]) {
    assert.ok(labels.includes(l), l);
  }
});
