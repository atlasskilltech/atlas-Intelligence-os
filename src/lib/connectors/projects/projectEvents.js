import "server-only";
import crypto from "node:crypto";
import { getAppUrl, registerSecret } from "../../config/env.js";
import { decryptSecret, encryptSecret } from "../../security/secretBox.js";
import { readJson, updateJson } from "../../storage/jsonFile.js";
import { parseBody } from "../http/parseBody.js";
import { safeFetch } from "../http/safeFetch.js";
import { callAction } from "./projectConnector.js";
import { ProjectError, USER_AGENT, getProject, patchProject, projectKey } from "./projectRepo.js";

/**
 * Two-way projects (ATLAS CRM, ATLAS Career Services …).
 *
 * A project whose manifest carries `events: { register: "/connect" }` can tell
 * IntelligenceOS when its own agents change. After connecting, IntelligenceOS
 * POSTs { callbackUrl, webhookSecret, platformName } to <baseUrl><register>
 * with the project key; the project then POSTs signed events to
 *   <APP_URL>/api/connectors/projects/<id>/events
 * (x-atlas-signature: sha256=<HMAC-SHA256 of the raw body>). Those events keep
 * a MIRROR of the project's agents (`project-agents.json`) that the project page
 * shows, with Activate / Deactivate / Run buttons that go through the project's
 * own manifest actions (so the key's scopes still decide what is possible).
 *
 * Rules
 *   - One secret per project, generated here, stored encrypted (secretBox).
 *   - Every event must be signed; unsigned / wrong signature → 401 and dropped.
 *   - Replays: a delivery id seen before is ignored; an event older than
 *     MAX_AGE_MS (or from the future) is refused.
 *   - The mirror is a convenience view: "Refresh from project" rebuilds it from
 *     list_agents at any time, so a lost event is never permanent.
 */

const FILE = "project-agents.json";
const EMPTY = { projects: {} };
export const CALLBACK_PATH = (id) => `/api/connectors/projects/${encodeURIComponent(id)}/events`;
export const MAX_EVENT_BYTES = 1_000_000;
export const MAX_AGE_MS = 15 * 60_000;
const MAX_RUNS = 50;
const MAX_LOG = 50;
const MAX_DELIVERIES = 300;
const MAX_AGENTS = 500;
const OPS = { activate: "activate_agent", deactivate: "deactivate_agent", run: "run_agent" };

const now = () => new Date().toISOString();
const str = (v, n = 300) => (v == null ? "" : String(v)).slice(0, n);

// ---------------------------------------------------------------------------
// Registration (IntelligenceOS → project)
// ---------------------------------------------------------------------------

/**
 * Registers our callback with the project. Best effort: never throws for a
 * project-side problem; the outcome is stored on the project (`events`).
 * Returns the public events status.
 */
export async function registerEvents(projectId, { appUrl = getAppUrl() } = {}) {
  const p = await getProject(projectId);
  const spec = p.manifest?.events;
  if (!spec?.register) return null;
  if (!appUrl) {
    const events = { registered: false, at: now(), error: "Set APP_URL on the IntelligenceOS server so projects can reach it, then Re-check access." };
    await patchProject(projectId, { events });
    return events;
  }
  let secret = null;
  try {
    secret = p.eventsBox ? decryptSecret(p.eventsBox) : null;
  } catch {
    secret = null;
  }
  if (!secret) secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  registerSecret(secret);
  const callbackUrl = `${appUrl.replace(/\/+$/, "")}${CALLBACK_PATH(projectId)}`;
  // Saved BEFORE registering: a project may send its first event (ping /
  // snapshot) while our POST is still in flight, and it must verify.
  const eventsBox = encryptSecret(secret);
  await patchProject(projectId, { eventsBox });
  let error = null;
  try {
    const res = await safeFetch(`${p.baseUrl}${spec.register}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${projectKey(p)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ callbackUrl, webhookSecret: secret, platformName: "ATLAS IntelligenceOS" }),
      timeoutMs: 20_000,
      maxBytes: 200_000,
    });
    if (res.status < 200 || res.status >= 300) {
      const data = parseBody(res);
      const why = typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : "";
      error = `${p.name} answered HTTP ${res.status}${why ? `: ${str(why, 200)}` : ""}.`;
    }
  } catch (err) {
    error = `Could not reach ${p.name}: ${str(err.message, 200)}`;
  }
  const prev = p.events || {};
  const events = {
    registered: !error,
    at: now(),
    callbackUrl,
    error,
    lastEventAt: prev.lastEventAt || null,
    lastEvent: prev.lastEvent || null,
  };
  await patchProject(projectId, { events });
  return events;
}

// ---------------------------------------------------------------------------
// Receiving (project → IntelligenceOS)
// ---------------------------------------------------------------------------

export class EventError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.type = status === 401 ? "unauthenticated" : status === 404 ? "not_found" : "validation";
  }
}

export function sign(secret, raw) {
  return `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Keeps only what the page shows about an agent (the project's own object, bounded). */
export function slimAgent(a) {
  if (!a || typeof a !== "object" || typeof a.id !== "string") return null;
  return {
    id: str(a.id, 80),
    kind: str(a.kind, 30),
    name: str(a.name, 150) || str(a.id, 80),
    description: str(a.description, 300),
    active: a.active === true,
    status: str(a.status, 30),
    source: str(a.source, 20),
    scheduleText: str(a.scheduleText, 120),
    owner: a.owner && typeof a.owner === "object" ? { name: str(a.owner.name, 120), email: str(a.owner.email, 200) } : null,
    lastRunAt: str(a.lastRunAt, 40) || null,
    lastStatus: str(a.lastStatus, 30) || null,
    nextRunAt: str(a.nextRunAt, 40) || null,
    capabilities: a.capabilities && typeof a.capabilities === "object"
      ? Object.fromEntries(["activate", "deactivate", "run", "update", "delete"].map((k) => [k, !!a.capabilities[k]]))
      : {},
  };
}

/**
 * Applies one event to a project's mirror (pure — exported for tests).
 * Returns the new mirror.
 */
export function applyEvent(mirror, payload) {
  const m = {
    agents: { ...(mirror?.agents || {}) },
    runs: [...(mirror?.runs || [])],
    log: [...(mirror?.log || [])],
    deliveries: [...(mirror?.deliveries || [])],
    policy: mirror?.policy ?? null,
    lastEventAt: mirror?.lastEventAt || null,
    syncedAt: mirror?.syncedAt || null,
  };
  const event = str(payload.event, 60);
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const agent = slimAgent(data.agent);
  switch (event) {
    case "agent.created":
    case "agent.updated":
    case "agent.activated":
    case "agent.deactivated":
      if (agent) m.agents[agent.id] = agent;
      break;
    case "agent.deleted":
      if (agent) delete m.agents[agent.id];
      break;
    case "agents.snapshot":
      if (Array.isArray(data.agents)) {
        m.agents = {};
        for (const a of data.agents.slice(0, MAX_AGENTS)) {
          const s = slimAgent(a);
          if (s) m.agents[s.id] = s;
        }
        m.syncedAt = str(payload.occurredAt, 40) || now();
      }
      if (data.policy && typeof data.policy === "object") m.policy = data.policy;
      break;
    case "agent.run.completed": {
      if (agent) m.agents[agent.id] = agent;
      const run = data.run && typeof data.run === "object" ? data.run : {};
      m.runs.unshift({
        at: str(payload.occurredAt, 40) || now(),
        agentId: agent?.id || "",
        agentName: agent?.name || "",
        status: str(run.status, 30),
        manual: !!run.manual,
        error: str(run.error, 300) || null,
        summary: str(run.summary || data.answer, 600),
      });
      m.runs = m.runs.slice(0, MAX_RUNS);
      break;
    }
    case "policy.updated":
      if (data.policy && typeof data.policy === "object") m.policy = data.policy;
      break;
    default:
      break; // connector.ping and anything newer: logged only
  }
  if (Object.keys(m.agents).length > MAX_AGENTS) {
    m.agents = Object.fromEntries(Object.entries(m.agents).slice(-MAX_AGENTS));
  }
  m.log.unshift({ at: now(), event, origin: str(payload.origin, 20), agentId: agent?.id || null, agentName: agent?.name || null });
  m.log = m.log.slice(0, MAX_LOG);
  if (payload.id) m.deliveries = [str(payload.id, 80), ...m.deliveries].slice(0, MAX_DELIVERIES);
  m.lastEventAt = now();
  return m;
}

/**
 * Verifies and stores one delivery. `headers` is a Headers-like (get()).
 * Returns { accepted, duplicate?, event }. Throws EventError (401 for a bad signature).
 */
export async function receiveEvent(projectId, raw, headers, { nowMs = Date.now() } = {}) {
  if (typeof raw !== "string" || !raw) throw new EventError("Empty body.");
  if (raw.length > MAX_EVENT_BYTES) throw new EventError("Body too large.", 413);
  let p;
  try {
    p = await getProject(projectId);
  } catch {
    throw new EventError("Unknown project.", 404);
  }
  let secret = null;
  try {
    secret = p.eventsBox ? decryptSecret(p.eventsBox) : null;
  } catch {
    secret = null;
  }
  if (!secret) throw new EventError("Events are not registered for this project.", 401);
  if (!safeEqual(headers.get("x-atlas-signature"), sign(secret, raw))) throw new EventError("Bad signature.", 401);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new EventError("Body must be JSON.");
  }
  if (!payload || typeof payload !== "object" || typeof payload.event !== "string") throw new EventError("Missing event.");
  const at = Date.parse(payload.occurredAt || headers.get("x-atlas-timestamp") || "");
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > MAX_AGE_MS) throw new EventError("Event is too old or its time is wrong.", 400);

  const result = await updateJson(FILE, EMPTY, (data) => {
    const all = { ...(data?.projects || {}) };
    const cur = all[projectId] || {};
    if (payload.id && (cur.deliveries || []).includes(String(payload.id))) {
      return { value: undefined, result: { accepted: true, duplicate: true, event: payload.event } };
    }
    all[projectId] = applyEvent(cur, payload);
    return { value: { projects: all }, result: { accepted: true, event: payload.event } };
  });
  if (!result.duplicate) {
    await patchProject(projectId, { events: { ...(p.events || {}), lastEventAt: now(), lastEvent: str(payload.event, 60) } }).catch(() => {});
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mirror reads, pull refresh and agent controls (admin, from the project page)
// ---------------------------------------------------------------------------

export async function getMirror(projectId) {
  const data = await readJson(FILE, EMPTY);
  const m = data?.projects?.[projectId] || null;
  return {
    agents: m ? Object.values(m.agents || {}).sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name)) : [],
    runs: m?.runs || [],
    log: m?.log || [],
    policy: m?.policy ?? null,
    lastEventAt: m?.lastEventAt || null,
    syncedAt: m?.syncedAt || null,
  };
}

const requireAdmin = (actor) => {
  if (actor?.role !== "admin") throw new ProjectError("Only administrators can manage a project's agents.", 403);
};

/** Rebuilds the mirror from the project's own list_agents action. */
export async function refreshMirror(actor, projectId) {
  requireAdmin(actor);
  const r = await callAction({ projectId, actionId: "list_agents", params: {}, userEmail: actor.email || null });
  const list = Array.isArray(r.data?.agents) ? r.data.agents : [];
  await updateJson(FILE, EMPTY, (data) => {
    const all = { ...(data?.projects || {}) };
    const cur = all[projectId] || {};
    const agents = {};
    for (const a of list.slice(0, MAX_AGENTS)) {
      const s = slimAgent(a);
      if (s) agents[s.id] = s;
    }
    all[projectId] = { ...cur, agents, syncedAt: now() };
    return { value: { projects: all }, result: null };
  });
  return getMirror(projectId);
}

/**
 * Activate / deactivate / run one of the project's agents through its manifest
 * action (the key's scopes still apply). Updates the mirror with the answer.
 */
export async function agentOp(actor, projectId, agentId, op) {
  requireAdmin(actor);
  const actionId = OPS[op];
  if (!actionId) throw new ProjectError("Unknown operation.", 400);
  if (typeof agentId !== "string" || !/^[A-Za-z0-9_\-:.]{1,80}$/.test(agentId)) throw new ProjectError("Unknown agent.", 400);
  let r;
  try {
    r = await callAction({ projectId, actionId, params: { agentId }, userEmail: actor.email || null });
  } catch (err) {
    throw new ProjectError(err.message, 400);
  }
  const updated = slimAgent(r.data?.agent);
  if (updated) {
    await updateJson(FILE, EMPTY, (data) => {
      const all = { ...(data?.projects || {}) };
      const cur = all[projectId] || {};
      all[projectId] = { ...cur, agents: { ...(cur.agents || {}), [updated.id]: updated } };
      return { value: { projects: all }, result: null };
    });
  }
  return {
    agent: updated,
    warnings: Array.isArray(r.data?.warnings) ? r.data.warnings.map((w) => str(w, 300)) : [],
    answer: op === "run" ? str(r.data?.answer, 4000) : null,
    run: op === "run" && r.data?.run ? { status: str(r.data.run.status, 30), error: str(r.data.run.error, 300) || null } : null,
  };
}

/** When a project is removed: forget its mirror too. */
export async function dropMirror(projectId) {
  await updateJson(FILE, EMPTY, (data) => {
    if (!data?.projects?.[projectId]) return { value: undefined, result: null };
    const all = { ...data.projects };
    delete all[projectId];
    return { value: { projects: all }, result: null };
  });
}
