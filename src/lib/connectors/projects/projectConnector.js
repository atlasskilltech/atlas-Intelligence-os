import "server-only";
import { getSecretValues } from "../../config/env.js";
import { redact } from "../../security/redact.js";
import { defineConnector } from "../defineConnector.js";
import { parseBody } from "../http/parseBody.js";
import { safeFetch } from "../http/safeFetch.js";
import { checkParams } from "./manifest.js";
import { USER_AGENT, getProject, listProjects, markProjectError, projectKey } from "./projectRepo.js";

/**
 * ATLAS projects connector (catalog id `atlas_project`).
 *   atlas_project.read  → actions the project marks "read"  (runs automatically)
 *   atlas_project.write → actions that change data          (approval; simulated in test runs)
 * The agent names a project + action from the manifest; everything else
 * (URL, method, key) comes from the stored connection.
 */

const clean = (s) => redact(String(s ?? ""), getSecretValues());
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}… [truncated]` : s);
const headerSafe = (s) => String(s || "").replace(/[^\x20-\x7e]/g, "").slice(0, 120);

const usable = (p) => p.enabled && p.status === "connected";

/**
 * Runs one action. `tool` is "read" / "write" from the agent, or null for the admin test.
 * Returns { status, data, truncated, durationMs }; throws Error with a plain message.
 */
export async function callAction({ projectId, actionId, tool = null, params = {}, run = null, allowDisabled = false }) {
  let p;
  try {
    p = await getProject(projectId);
  } catch {
    throw new Error(`Unknown project "${projectId}". Use one of the projects listed in the tool description.`);
  }
  if (!p.enabled && !allowDisabled) throw new Error(`The project "${p.name}" is disabled by an administrator.`);
  if (p.status !== "connected" && !allowDisabled) throw new Error(`The project "${p.name}" is not connected right now: ${p.lastError || "re-sync it"}.`);
  const action = p.manifest.actions.find((a) => a.id === actionId);
  if (!action) {
    throw new Error(`"${actionId}" is not allowed for ${p.name}. Allowed: ${p.manifest.actions.map((a) => a.id).join(", ") || "none"}.`);
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
  };
  let body;
  if (action.method === "POST") {
    body = JSON.stringify(values.body);
    headers["Content-Type"] = "application/json";
  }

  const res = await safeFetch(url, { method: action.method, headers, body });
  const data = parseBody(res);
  if (res.status === 401) {
    const msg = "The project rejected the key (revoked or expired). An administrator must replace it.";
    await markProjectError(p.id, msg);
    throw new Error(`${p.name}: ${msg}`);
  }
  if (res.status === 403) throw new Error(`${p.name} refused "${actionId}": this key does not allow it any more. Ask an administrator to re-sync the project.`);
  if (res.status < 200 || res.status >= 300) {
    const detail = typeof data === "string" ? data : JSON.stringify(data ?? "");
    throw new Error(clean(`${p.name} returned HTTP ${res.status}.${detail ? ` Response: ${clip(detail, 500)}` : ""}`));
  }
  return { status: res.status, data: JSON.parse(clean(JSON.stringify(data))), truncated: res.truncated, durationMs: res.durationMs };
}

const paramText = (a) =>
  a.params.length
    ? ` [params: ${a.params
        .map((p) => `${p.name}${p.required ? "*" : ""} (${p.type}${p.enum ? `: ${p.enum.join("|")}` : ""})${p.description ? ` ${p.description}` : ""}`)
        .join("; ")}]`
    : "";

/** Connected projects and their actions of one kind ("read" or "write"), for tool descriptions and the planner. */
export async function describeProjects(kind) {
  const lines = [];
  for (const p of await listProjects()) {
    if (!usable(p)) continue;
    const acts = p.manifest.actions.filter((a) => (kind === "read" ? a.risk === "read" : a.risk !== "read"));
    if (!acts.length) continue;
    lines.push(`Project "${p.id}" — ${p.name}`);
    for (const a of acts) lines.push(`  - action "${a.id}": ${a.name}${a.description ? ` — ${a.description}` : ""}${paramText(a)}`);
  }
  return lines.length ? `Connected projects (* = required):\n${lines.join("\n")}` : "";
}

async function hasActions(kind) {
  return (await listProjects()).some((p) => usable(p) && p.manifest.actions.some((a) => (kind === "read" ? a.risk === "read" : a.risk !== "read")));
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
  isReady: () => hasActions(kind),
  describe: () => describeProjects(kind),
  async execute(args, ctx) {
    const r = await callAction({ projectId: args.project, actionId: args.action, tool: kind, params: args.params || {}, run: ctx?.run });
    return { status: r.status, data: r.data, ...(r.truncated ? { note: "The response was too large and was cut off." } : {}) };
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
