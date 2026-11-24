import "server-only";
import { randomBytes } from "node:crypto";
import { readJson, updateJson } from "../storage/jsonFile.js";
import { draftErrors, normalizeAgentConfig, validateAgentConfig } from "./agentConfig.js";

/**
 * Agent repository — the ONLY module that reads or writes stored agents.
 * Backed by one JSON file today; swapping in MySQL later replaces this file
 * and nothing else (routes and pages only call these functions).
 *
 * Stored record = normalised agent config + metadata:
 *   { id, ownerId, status, createdAt, updatedAt, createdBy, updatedBy, config }
 */

const FILE = "agents.json";
const EMPTY = { version: 1, agents: [] };

export const STATUSES = ["draft", "active", "paused"];

/** Which status changes are allowed, by action. */
const TRANSITIONS = {
  activate: { from: ["draft", "paused"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
};

export class AgentNotFound extends Error {
  constructor() {
    super("Agent not found.");
    this.publicMessage = "Agent not found — it may have been deleted.";
    this.status = 404;
    this.type = "not_found";
  }
}

export class AgentInvalid extends Error {
  constructor(fields, message = "The agent has errors — fix the highlighted fields.") {
    super(message);
    this.publicMessage = message;
    this.fields = fields;
    this.status = 400;
    this.type = "validation";
  }
}

export class AgentConflict extends Error {
  constructor(message) {
    super(message);
    this.publicMessage = message;
    this.status = 409;
    this.type = "conflict";
  }
}

const newId = () => `ag_${randomBytes(6).toString("hex")}`;
export const isAgentId = (id) => typeof id === "string" && /^ag_[a-f0-9]{12}$/.test(id);

function load(data) {
  return data && Array.isArray(data.agents) ? data : { ...EMPTY, agents: [] };
}

/** Normalise + validate a client draft. Throws AgentInvalid with field messages. */
export function prepareConfig(raw) {
  const errs = draftErrors(raw);
  if (Object.keys(errs).length) throw new AgentInvalid(errs);
  const { config } = normalizeAgentConfig(raw);
  const v = validateAgentConfig(config);
  if (!v.ok) {
    const fields = {};
    for (const e of v.errors) fields[e.path.split(".")[0] || "_"] ??= e.message;
    throw new AgentInvalid(fields);
  }
  return v.value;
}

/** A summary row for lists (no instructions / full plan). */
export function summarize(rec) {
  const c = rec.config;
  return {
    id: rec.id,
    name: c.name,
    description: c.description,
    status: rec.status,
    trigger: c.trigger,
    stepCount: c.steps.length,
    tools: c.tools,
    approvals: c.permissions.toolsRequiringApproval.length,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

const visibleTo = (actor) => (rec) => actor.role === "admin" || rec.ownerId === actor.id;

export async function listAgents(actor, { status } = {}) {
  const { agents } = load(await readJson(FILE, EMPTY));
  return agents
    .filter(visibleTo(actor))
    .filter((a) => !status || a.status === status)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function countAgents(actor) {
  const all = await listAgents(actor);
  const out = { total: all.length, draft: 0, active: 0, paused: 0 };
  for (const a of all) out[a.status] = (out[a.status] || 0) + 1;
  return out;
}

export async function getAgent(actor, id) {
  if (!isAgentId(id)) throw new AgentNotFound();
  const { agents } = load(await readJson(FILE, EMPTY));
  const rec = agents.find((a) => a.id === id);
  if (!rec || !visibleTo(actor)(rec)) throw new AgentNotFound();
  return rec;
}

export async function createAgent(actor, rawConfig, { activate = false } = {}) {
  const config = prepareConfig(rawConfig);
  const now = new Date().toISOString();
  const rec = {
    id: newId(),
    ownerId: actor.id,
    status: activate ? "active" : "draft",
    createdAt: now,
    updatedAt: now,
    createdBy: actor.id,
    updatedBy: actor.id,
    config,
  };
  return updateJson(FILE, EMPTY, (data) => {
    const d = load(data);
    return { value: { ...d, agents: [...d.agents, rec] }, result: rec };
  });
}

/** Replace an agent's config. `expectedUpdatedAt` (optional) prevents overwriting a newer save. */
export async function updateAgent(actor, id, rawConfig, { expectedUpdatedAt } = {}) {
  if (!isAgentId(id)) throw new AgentNotFound();
  const config = prepareConfig(rawConfig);
  return updateJson(FILE, EMPTY, (data) => {
    const d = load(data);
    const i = d.agents.findIndex((a) => a.id === id);
    if (i < 0 || !visibleTo(actor)(d.agents[i])) throw new AgentNotFound();
    const cur = d.agents[i];
    if (expectedUpdatedAt && expectedUpdatedAt !== cur.updatedAt) {
      throw new AgentConflict("This agent was changed elsewhere since you opened it. Reload to see the latest version.");
    }
    const next = { ...cur, config, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    const agents = d.agents.slice();
    agents[i] = next;
    return { value: { ...d, agents }, result: next };
  });
}

export async function setAgentStatus(actor, id, action) {
  const rule = TRANSITIONS[action];
  if (!rule) throw new AgentInvalid({ action: "Unknown action." }, `Unknown action "${action}".`);
  if (!isAgentId(id)) throw new AgentNotFound();
  return updateJson(FILE, EMPTY, (data) => {
    const d = load(data);
    const i = d.agents.findIndex((a) => a.id === id);
    if (i < 0 || !visibleTo(actor)(d.agents[i])) throw new AgentNotFound();
    const cur = d.agents[i];
    if (cur.status === rule.to) return { value: undefined, result: cur }; // already there — no write
    if (!rule.from.includes(cur.status)) {
      throw new AgentConflict(`Can't ${action} an agent that is ${cur.status}.`);
    }
    const next = { ...cur, status: rule.to, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    const agents = d.agents.slice();
    agents[i] = next;
    return { value: { ...d, agents }, result: next };
  });
}

export async function deleteAgent(actor, id) {
  if (!isAgentId(id)) throw new AgentNotFound();
  return updateJson(FILE, EMPTY, (data) => {
    const d = load(data);
    const rec = d.agents.find((a) => a.id === id);
    if (!rec || !visibleTo(actor)(rec)) throw new AgentNotFound();
    return { value: { ...d, agents: d.agents.filter((a) => a.id !== id) }, result: { id } };
  });
}
