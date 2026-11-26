import "server-only";
import { getSecretValues } from "../../config/env.js";
import { redact } from "../../security/redact.js";
import { defineConnector } from "../defineConnector.js";
import { parseBody } from "../http/parseBody.js";
import { safeFetch } from "../http/safeFetch.js";
import { checkParams } from "./manifest.js";
import { USER_AGENT, USER_HEADER, fetchManifest, getProject, listProjects, markProjectError, projectKey } from "./projectRepo.js";

/**
 * ATLAS projects connector (catalog id `atlas_project`).
 *   atlas_project.read  → actions the project marks "read"  (runs automatically)
 *   atlas_project.write → actions that change data          (approval; simulated in test runs)
 * The agent names a project + action from the manifest; everything else
 * (URL, method, key) comes from the stored connection.
 *
 * Delegated projects (spec v1.1, `project.delegated`) act as the agent's OWNER:
 * every call carries X-IntelligenceOS-User: <owner email>, and the actions an
 * agent may see and use come from the manifest fetched for that user.
 */

const clean = (s) => redact(String(s ?? ""), getSecretValues());
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}… [truncated]` : s);
const headerSafe = (s) => String(s || "").replace(/[^\x20-\x7e]/g, "").slice(0, 120);
const ofKind = (kind) => (a) => (kind === "read" ? a.risk === "read" : a.risk !== "read");

const usable = (p) => p.enabled && p.status === "connected";
const PROJECT_MAX_BYTES = 8_000_000;

// ---------------------------------------------------------------------------
// Per-user manifests (delegated projects), cached for 10 minutes
// ---------------------------------------------------------------------------

const USER_MANIFEST_TTL_MS = 10 * 60_000;
const userManifests = new Map(); // `${projectId}|${keyLast4}|${email}` → { at, actions, refused }

/**
 * Actions this user may use in this project.
 * Returns { actions, refused?: message, source: "user" | "project" }.
 * Falls back to the project-wide list when there is no email or the project
 * can't be reached (the project still checks every call itself).
 */
export async function actionsFor(p, userEmail, { now = Date.now() } = {}) {
  if (!p.delegated || !userEmail) return { actions: p.manifest.actions, source: "project" };
  const key = `${p.id}|${p.keyLast4}|${userEmail.toLowerCase()}`;
  const hit = userManifests.get(key);
  if (hit && now - hit.at < USER_MANIFEST_TTL_MS) return hit.value;
  let value;
  try {
    const m = await fetchManifest(p.baseUrl, projectKey(p), { userEmail });
    value = { actions: m.actions, source: "user" };
  } catch (err) {
    if (err?.userRefused) value = { actions: [], refused: err.publicMessage, source: "user" };
    else return { actions: p.manifest.actions, source: "project" }; // not cached: try again next time
  }
  userManifests.set(key, { at: now, value });
  return value;
}

/** Tests / after a key change. */
export function clearUserManifestCache() {
  userManifests.clear();
}

// ---------------------------------------------------------------------------
// Links returned by a project (draft_url / confirm_url) → buttons on the run page
// ---------------------------------------------------------------------------

const LINK_KEYS = { draft_url: "draft", confirm_url: "confirm" };

/**
 * Finds draft_url / confirm_url values in a response (up to 3 levels deep, max 10).
 * Only https links on the project's own site are kept, so text from the
 * project (or injected into it) can't turn into a button to another website.
 */
export function extractLinks(data, project) {
  const origin = new URL(project.baseUrl).origin;
  const out = [];
  const walk = (v, depth) => {
    if (out.length >= 10 || depth > 3 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    for (const [k, val] of Object.entries(v)) {
      if (LINK_KEYS[k] && typeof val === "string") {
        try {
          const u = new URL(val, origin);
          if (u.origin === origin && (u.protocol === "https:" || u.hostname === "127.0.0.1")) {
            out.push({ kind: LINK_KEYS[k], url: u.toString(), projectId: project.id, projectName: project.name });
          }
        } catch {
          /* not a URL */
        }
      } else walk(val, depth + 1);
    }
  };
  walk(data, 0);
  return out.filter((l, i) => out.findIndex((x) => x.url === l.url) === i);
}

// ---------------------------------------------------------------------------
// Calling an action
// ---------------------------------------------------------------------------

/**
 * Runs one action. `tool` is "read" / "write" from the agent, or null for the admin test.
 * `userEmail` is the agent owner's (or, for the admin test, the admin's) email;
 * delegated projects require it.
 * Returns { status, data, truncated, durationMs, links, project }; throws Error with a plain message.
 */
export async function callAction({ projectId, actionId, tool = null, params = {}, run = null, userEmail = null, allowDisabled = false }) {
  let p;
  try {
    p = await getProject(projectId);
  } catch {
    throw new Error(`Unknown project "${projectId}". Use one of the projects listed in the tool description.`);
  }
  if (!p.enabled && !allowDisabled) throw new Error(`The project "${p.name}" is disabled by an administrator.`);
  if (p.status !== "connected" && !allowDisabled) throw new Error(`The project "${p.name}" is not connected right now: ${p.lastError || "re-sync it"}.`);
  const email = userEmail || run?.ownerEmail || null;
  if (p.delegated && !email) {
    throw new Error(`${p.name} acts as the signed-in user, but this agent's owner has no email (sign-in is off). Ask an administrator.`);
  }

  const allowed = await actionsFor(p, email);
  if (allowed.refused) throw new Error(`${allowed.refused} Ask the ${p.name} administrator for access.`);
  const action = allowed.actions.find((a) => a.id === actionId);
  if (!action) {
    const who = allowed.source === "user" ? ` for ${email}` : "";
    throw new Error(`"${actionId}" is not allowed in ${p.name}${who}. Allowed: ${allowed.actions.map((a) => a.id).join(", ") || "none"}.`);
  }
  if (tool === "read" && action.risk !== "read") throw new Error(`"${actionId}" changes data. Use atlas_project.write for it.`);
  if (tool === "write" && action.risk === "read") throw new Error(`"${actionId}" only reads data. Use atlas_project.read for it.`);

  const values = checkParams(action, params);
  const path = action.path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => encodeURIComponent(String(values.path[n])));
  const url = new URL(p.baseUrl + path);
  for (const [k, v] of Object.entries(values.query)) url.searchParams.set(k, String(v));

  const headers = {
    Authorization: `Bearer ${projectKey(p)}`,
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    ...(run ? { "X-IntelligenceOS-Agent": headerSafe(run.agentName), "X-IntelligenceOS-Run": headerSafe(run.id) } : {}),
    ...(p.delegated ? { [USER_HEADER]: headerSafe(email) } : {}),
  };
  let body;
  if (action.method === "POST") {
    body = JSON.stringify(values.body);
    headers["Content-Type"] = "application/json";
  }

  // Project APIs can return whole timetables / registers: allow up to 8 MB. The
  // engine turns big lists into datasets the agent can query (engine/dataTool.js).
  const res = await safeFetch(url, { method: action.method, headers, body, maxBytes: PROJECT_MAX_BYTES });
  const data = parseBody(res);
  if (res.status === 401) {
    const msg = "The project rejected the key (revoked or expired). An administrator must replace it.";
    await markProjectError(p.id, msg);
    throw new Error(`${p.name}: ${msg}`);
  }
  if (res.status === 403) {
    const why = clean(typeof data?.error === "string" ? data.error : typeof data === "string" ? data : "").slice(0, 300);
    if (p.delegated) {
      // A per-user refusal: tell this user why; the project itself is fine.
      throw new Error(`${p.name} refused "${actionId}" for ${email}${why ? `: ${why}` : "."} Ask the ${p.name} administrator if you need this.`);
    }
    throw new Error(`${p.name} refused "${actionId}": this key does not allow it any more. Ask an administrator to re-sync the project.`);
  }
  if (res.status < 200 || res.status >= 300) {
    const detail = typeof data === "string" ? data : JSON.stringify(data ?? "");
    throw new Error(clean(`${p.name} returned HTTP ${res.status}.${detail ? ` Response: ${clip(detail, 500)}` : ""}`));
  }
  const safeData = JSON.parse(clean(JSON.stringify(data)));
  return { status: res.status, data: safeData, truncated: res.truncated, durationMs: res.durationMs, links: extractLinks(safeData, p), project: p };
}

// ---------------------------------------------------------------------------
// Tool descriptions and readiness (per agent owner)
// ---------------------------------------------------------------------------

const paramText = (a) =>
  a.params.length
    ? ` [params: ${a.params
        .map((p) => `${p.name}${p.required ? "*" : ""} (${p.type}${p.enum ? `: ${p.enum.join("|")}` : ""})${p.description ? ` ${p.description}` : ""}`)
        .join("; ")}]`
    : "";

/**
 * Connected projects and their actions of one kind ("read" or "write"), for tool
 * descriptions and the planner. With `userEmail`, delegated projects list only
 * what that user may do.
 */
export async function describeProjects(kind, { userEmail = null, onlyIds = null } = {}) {
  const lines = [];
  const only = Array.isArray(onlyIds) && onlyIds.length ? new Set(onlyIds) : null;
  for (const p of await listProjects()) {
    if (!usable(p)) continue;
    if (only && !only.has(p.id)) continue;
    const { actions } = await actionsFor(p, userEmail);
    const acts = actions.filter(ofKind(kind));
    if (!acts.length) continue;
    lines.push(`Project "${p.id}" — ${p.name}`);
    for (const a of acts) lines.push(`  - action "${a.id}": ${a.name}${a.description ? ` — ${a.description}` : ""}${paramText(a)}`);
  }
  return lines.length ? `Connected projects (* = required):\n${lines.join("\n")}` : "";
}

async function hasActions(kind, userEmail, onlyIds = null) {
  const only = Array.isArray(onlyIds) && onlyIds.length ? new Set(onlyIds) : null;
  for (const p of await listProjects()) {
    if (!usable(p)) continue;
    if (only && !only.has(p.id)) continue;
    if ((await actionsFor(p, userEmail)).actions.some(ofKind(kind))) return true;
  }
  return false;
}

const tool = (kind) => ({
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["project", "action"],
    properties: {
      project: { type: "string", maxLength: 40, description: "Project id, from the list of connected projects." },
      action: { type: "string", maxLength: 60, description: "Action id within that project." },
      params: { type: "object", description: "The action's parameters, e.g. {\"status\": \"new\", \"limit\": 20}." },
    },
  },
  isReady: (ctx) => hasActions(kind, ctx?.ownerEmail || null, ctx?.projectIds),
  describe: (ctx) => describeProjects(kind, { userEmail: ctx?.ownerEmail || null, onlyIds: ctx?.projectIds }),
  async execute(args, ctx) {
    // An agent locked to chosen connectors may only call those projects.
    const locked = ctx?.run?.projectIds;
    if (Array.isArray(locked) && locked.length && !locked.includes(args.project)) {
      throw new Error(`Project "${args.project}" is not one of this agent's connectors (${locked.join(", ")}). Use only those.`);
    }
    const r = await callAction({ projectId: args.project, actionId: args.action, tool: kind, params: args.params || {}, run: ctx?.run });
    for (const link of r.links) await ctx?.addLink?.(link);
    const note = r.links.length
      ? `Nothing is final yet: the owner must open ${r.links.length === 1 ? "the link" : "the links"} in ${r.project.name} to ${r.links.some((l) => l.kind === "confirm") ? "confirm" : "review and submit"}. Say so in your summary.`
      : null;
    return {
      status: r.status,
      data: r.data,
      ...(r.truncated
        ? { note: `The response was larger than ${PROJECT_MAX_BYTES / 1_000_000} MB and was cut off. Call the action again with filters (e.g. a date, school or limit parameter) to get a smaller result.` }
        : {}),
      ...(note ? { nextStep: note } : {}),
    };
  },
});

export const projectConnector = defineConnector({
  id: "atlas_project",
  actions: { read: tool("read"), write: tool("write") },
  async status() {
    const list = await listProjects();
    const ok = list.filter(usable);
    if (ok.length) return { ready: true, message: `${ok.length} project${ok.length === 1 ? "" : "s"} connected` };
    return { ready: false, message: list.length ? "No project is usable — check its key" : "No projects connected yet" };
  },
});
