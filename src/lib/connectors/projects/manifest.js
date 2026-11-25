import { z } from "zod";

/**
 * ATLAS Agent API manifest (docs/AGENT_API_SPEC.md) — what a project key allows.
 * A project returns it from GET <baseUrl>/manifest. This module validates it and
 * applies IntelligenceOS's own safety rules on top (pure, no I/O):
 *   - "destructive" actions are never imported
 *   - POST actions are always treated as "write" (approval), whatever they claim
 *   - GET actions can't take a body
 */

export const SPEC_VERSION = "atlas-agent-api/1";
export const MAX_ACTIONS = 100;

const KEY_RE = /^[a-z][a-z0-9_]{1,59}$/;
const PARAM_RE = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/;
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]{0,59})\}/g;
const PATH_RE = /^\/[A-Za-z0-9\-._~/{}:@]*$/;

export const placeholders = (path) => [...String(path).matchAll(PLACEHOLDER_RE)].map((m) => m[1]);

const paramSchema = z.object({
  name: z.string().regex(PARAM_RE),
  in: z.enum(["path", "query", "body"]).default("query"),
  type: z.enum(["string", "number", "integer", "boolean"]).default("string"),
  required: z.boolean().default(false),
  description: z.string().max(300).default(""),
  enum: z.array(z.string().max(100)).max(50).optional(),
});

const actionSchema = z.object({
  id: z.string().regex(KEY_RE),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
  method: z.enum(["GET", "POST"]),
  path: z.string().max(300).regex(PATH_RE),
  risk: z.enum(["read", "write", "destructive"]).default("write"),
  params: z.array(paramSchema).max(30).default([]),
});

const manifestSchema = z.object({
  spec: z.literal(SPEC_VERSION),
  project: z.object({ name: z.string().trim().min(1).max(100), version: z.string().max(40).optional() }),
  key: z
    .object({
      name: z.string().max(100).optional(),
      access: z.string().max(60).optional(),
      expiresAt: z.string().max(40).nullable().optional(),
    })
    .default({}),
  actions: z.array(z.unknown()).max(MAX_ACTIONS),
  // Two-way projects (ATLAS CRM, Career Services): where IntelligenceOS registers
  // its callback so the project's agent events reach it. Optional; anything
  // malformed here is ignored rather than refusing the whole manifest.
  events: z.unknown().optional(),
});

const eventsSchema = z.object({
  register: z.string().max(200).regex(PATH_RE),
  types: z.array(z.string().max(60)).max(30).optional(),
});

/** { register, types } or null — the register path must be a plain relative path. */
export function parseEvents(raw) {
  const r = eventsSchema.safeParse(raw);
  if (!r.success) return null;
  if (/[{}]/.test(r.data.register) || r.data.register.split("/").some((x) => x === "." || x === "..")) return null;
  return { register: r.data.register, types: (r.data.types || []).filter((t) => /^[a-z][a-z0-9_.]{0,59}$/.test(t)) };
}

export class ManifestError extends Error {}

/**
 * Returns { project, key, actions, skipped: [{ id, reason }] }.
 * Throws ManifestError when the document as a whole is unusable.
 */
export function parseManifest(doc) {
  const top = manifestSchema.safeParse(doc);
  if (!top.success) {
    const i = top.error.issues[0];
    const where = i.path.join(".") || "manifest";
    if (i.path[0] === "spec") throw new ManifestError(`This project speaks a different Agent API version (expected "${SPEC_VERSION}").`);
    throw new ManifestError(`The project's manifest is not valid (${where}: ${i.message}).`);
  }
  const { project, key, actions: raw } = top.data;
  const events = parseEvents(top.data.events);
  const actions = [];
  const skipped = [];
  const seen = new Set();

  for (const item of raw) {
    const parsed = actionSchema.safeParse(item);
    const id = typeof item?.id === "string" ? item.id.slice(0, 60) : "?";
    if (!parsed.success) {
      skipped.push({ id, reason: `invalid (${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message})` });
      continue;
    }
    const a = parsed.data;
    if (seen.has(a.id)) {
      skipped.push({ id: a.id, reason: "duplicate id" });
      continue;
    }
    if (a.risk === "destructive") {
      skipped.push({ id: a.id, reason: "deleting actions are never allowed for agents" });
      continue;
    }
    if (a.path.split("/").some((s) => s === "." || s === "..") || /[{}]/.test(a.path.replace(PLACEHOLDER_RE, ""))) {
      skipped.push({ id: a.id, reason: "invalid path" });
      continue;
    }
    if (a.method === "GET" && a.params.some((p) => p.in === "body")) {
      skipped.push({ id: a.id, reason: "a GET action cannot have body parameters" });
      continue;
    }
    // Path placeholders must be required path params; add any the manifest forgot.
    const names = new Set(a.params.map((p) => p.name));
    if (names.size !== a.params.length) {
      skipped.push({ id: a.id, reason: "a parameter name is used twice" });
      continue;
    }
    for (const ph of placeholders(a.path)) {
      const p = a.params.find((x) => x.name === ph);
      if (!p) a.params.push({ name: ph, in: "path", type: "string", required: true, description: "" });
      else Object.assign(p, { in: "path", required: true });
    }
    if (a.params.some((p) => p.in === "path" && !placeholders(a.path).includes(p.name))) {
      skipped.push({ id: a.id, reason: "a path parameter is missing from the path" });
      continue;
    }
    seen.add(a.id);
    actions.push({ ...a, risk: a.method === "POST" ? "write" : a.risk });
  }
  return { project, key, actions, skipped, ...(events ? { events } : {}) };
}

/**
 * Checks and converts the agent's params for one action. Pure.
 * Returns { path: {..}, query: {..}, body: {..} } or throws Error with a plain message.
 */
export function checkParams(action, params) {
  if (params == null) params = {};
  if (typeof params !== "object" || Array.isArray(params)) throw new Error("params must be an object.");
  const out = { path: {}, query: {}, body: {} };
  const byName = new Map(action.params.map((p) => [p.name, p]));
  for (const k of Object.keys(params)) {
    if (!byName.has(k)) {
      throw new Error(`Unknown parameter "${k}" for ${action.id}. Allowed: ${action.params.map((p) => p.name).join(", ") || "none"}.`);
    }
  }
  for (const p of action.params) {
    let v = params[p.name];
    if (v == null || v === "") {
      if (p.required) throw new Error(`Missing required parameter "${p.name}".`);
      continue;
    }
    if (p.type === "number" || p.type === "integer") {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n) || (p.type === "integer" && !Number.isInteger(n))) {
        throw new Error(`"${p.name}" must be ${p.type === "integer" ? "a whole number" : "a number"}.`);
      }
      v = n;
    } else if (p.type === "boolean") {
      if (v === "true" || v === "false") v = v === "true";
      if (typeof v !== "boolean") throw new Error(`"${p.name}" must be true or false.`);
    } else {
      if (!["string", "number"].includes(typeof v)) throw new Error(`"${p.name}" must be text.`);
      v = String(v);
      if (v.length > 2000) throw new Error(`"${p.name}" is too long.`);
      if (p.in === "path" && (v === "." || v === "..")) throw new Error(`Invalid value for "${p.name}".`);
    }
    if (p.enum && !p.enum.includes(String(v))) throw new Error(`"${p.name}" must be one of: ${p.enum.join(", ")}.`);
    out[p.in][p.name] = v;
  }
  return out;
}
