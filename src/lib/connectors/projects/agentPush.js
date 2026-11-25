import "server-only";
import { listAgents } from "../../agents/agentRepo.js";
import { describeTrigger } from "../../agents/schedule.js";
import { getAppUrl } from "../../config/env.js";
import { listRuns } from "../../runs/runRepo.js";
import { getUserById } from "../../users/userRepo.js";
import { parseBody } from "../http/parseBody.js";
import { safeFetch } from "../http/safeFetch.js";
import { USER_AGENT, getProject, listProjects, patchProject, projectKey } from "./projectRepo.js";

/**
 * §2c of docs/AGENT_API_SPEC.md: IntelligenceOS agents shown inside the project.
 *
 * A project whose manifest carries `intosAgents: { push: "/intos-agents" }` gets
 * the IntelligenceOS agents that use it, so its administrators can see which
 * agents work on their data. We POST with the project key:
 *   agents.snapshot  → replaces everything the project stored for this key
 *   agent.upserted   → one agent created / edited / activated / paused / ran
 *   agent.deleted    → deleted, or it no longer uses this project
 * Pushes are best effort: a failure never breaks saving or running an agent.
 * The outcome is kept on the project (`agentPush`) and shown on its page;
 * "Send agents now" (a snapshot) repairs anything a lost push left behind.
 */

const SYSTEM = { id: "system", role: "admin" };
const TIMEOUT_MS = 10_000;
const MAX_IDS = 500;
const str = (v, n) => (v == null ? "" : String(v)).slice(0, n);
const now = () => new Date().toISOString();

/** Does this stored agent work on this project? Pure. */
export function usesProject(rec, projectId) {
  const c = rec?.config;
  if (!c || !Array.isArray(c.tools) || !c.tools.some((t) => String(t).startsWith("atlas_project."))) return false;
  const list = c.connectors?.projects || [];
  return list.length === 0 || list.includes(projectId);
}

/** The IntosAgent object of the spec (§2c). Pure. */
export function toIntosAgent(rec, { owner = null, lastRun = null, appUrl = "" } = {}) {
  const c = rec.config;
  return {
    id: rec.id,
    name: str(c.name, 150),
    description: str(c.description, 500),
    status: rec.status,
    trigger: c.trigger?.type || "manual",
    scheduleText: str(describeTrigger(c.trigger), 120),
    owner: owner && (owner.name || owner.email) ? { name: str(owner.name, 120), email: str(owner.email, 200) } : null,
    writes: c.tools.includes("atlas_project.write"),
    lastRunAt: lastRun?.finishedAt || lastRun?.startedAt || null,
    lastStatus: lastRun?.status || null,
    updatedAt: rec.updatedAt || null,
    url: appUrl ? str(`${appUrl}/agents/${rec.id}`, 500) : "",
  };
}

/** Projects that asked for our agents and can be called right now. */
export const pushable = (p) => !!p?.manifest?.intosAgents?.push && p.enabled && p.status === "connected";

async function ownerOf(ownerId) {
  const m = /^u_(\d+)$/.exec(String(ownerId || ""));
  if (!m) return null;
  try {
    const u = await getUserById(Number(m[1]));
    return u ? { name: u.name || "", email: u.email || "" } : null;
  } catch {
    return null; // no database (local mode)
  }
}

async function lastRuns() {
  const out = new Map();
  try {
    for (const r of await listRuns(SYSTEM, { limit: 5000 })) {
      if (r.mode === "live" && !out.has(r.agentId)) out.set(r.agentId, r);
    }
  } catch {
    /* no runs yet */
  }
  return out;
}

async function build(recs) {
  const runs = await lastRuns();
  const appUrl = getAppUrl() || "";
  const owners = new Map();
  const list = [];
  for (const rec of recs) {
    if (!owners.has(rec.ownerId)) owners.set(rec.ownerId, await ownerOf(rec.ownerId));
    list.push(toIntosAgent(rec, { owner: owners.get(rec.ownerId), lastRun: runs.get(rec.id), appUrl }));
  }
  return list;
}

/** One POST to the project. Returns { ok, error }. Never throws. */
async function send(p, body) {
  try {
    const res = await safeFetch(`${p.baseUrl}${p.manifest.intosAgents.push}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${projectKey(p)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ ...body, occurredAt: now(), platformName: "ATLAS IntelligenceOS" }),
      timeoutMs: TIMEOUT_MS,
      maxBytes: 100_000,
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, error: null };
    const data = parseBody(res);
    const why = typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : "";
    return { ok: false, error: `${p.name} answered HTTP ${res.status}${why ? `: ${str(why, 200)}` : ""}.` };
  } catch (err) {
    return { ok: false, error: `Could not reach ${p.name}: ${str(err?.message, 200)}` };
  }
}

async function record(p, event, outcome, ids) {
  const prev = p.agentPush || {};
  await patchProject(p.id, {
    agentPush: {
      at: now(),
      event,
      ok: outcome.ok,
      error: outcome.error,
      // Ids the project holds for us (so we know whom to send agent.deleted). Only moves on success.
      ids: outcome.ok ? [...ids].slice(0, MAX_IDS) : prev.ids || [],
      lastOkAt: outcome.ok ? now() : prev.lastOkAt || null,
    },
  }).catch(() => {});
}

/** Sends every agent that uses the project (replaces what it holds). Returns the project's push status. */
export async function pushSnapshot(projectId) {
  const p = await getProject(projectId);
  if (!pushable(p)) return null;
  const recs = (await listAgents(SYSTEM)).filter((r) => usesProject(r, p.id));
  const agents = await build(recs);
  const outcome = await send(p, { event: "agents.snapshot", agents });
  await record(p, "agents.snapshot", outcome, agents.map((a) => a.id));
  return { ...outcome, count: agents.length };
}

/**
 * One agent changed (or was deleted: pass `{ id, deleted: true }`). Each project
 * that asked for agents gets an upsert when the agent uses it, or a delete when
 * it held the agent before and no longer should. Never throws.
 */
export async function pushAgentChange(recOrId, { deleted = false } = {}) {
  try {
    const projects = (await listProjects()).filter(pushable);
    if (!projects.length) return;
    const rec = deleted ? null : recOrId;
    const id = deleted ? String(recOrId?.id || recOrId) : rec.id;
    const [agent] = rec ? await build([rec]) : [null];
    await Promise.all(
      projects.map(async (p) => {
        const held = new Set(p.agentPush?.ids || []);
        if (agent && usesProject(rec, p.id)) {
          const outcome = await send(p, { event: "agent.upserted", agent });
          held.add(id);
          await record(p, "agent.upserted", outcome, held);
        } else if (held.has(id)) {
          const outcome = await send(p, { event: "agent.deleted", agentId: id });
          held.delete(id);
          await record(p, "agent.deleted", outcome, held);
        }
      }),
    );
  } catch (err) {
    console.error("[agentPush] failed:", str(err?.message, 200));
  }
}

/** Same, by agent id (e.g. after a run finished). Never throws. */
export async function pushAgentById(agentId) {
  try {
    const rec = (await listAgents(SYSTEM)).find((a) => a.id === agentId);
    if (rec) await pushAgentChange(rec);
  } catch (err) {
    console.error("[agentPush] failed:", str(err?.message, 200));
  }
}
