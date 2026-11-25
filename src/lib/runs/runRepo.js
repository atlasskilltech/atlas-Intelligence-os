import "server-only";
import { randomBytes } from "node:crypto";
import { appendJsonLine, readJson, readJsonLines, updateJson } from "../storage/jsonFile.js";

/**
 * Run storage. Each run is one file (`run_<id>.json`) so long conversations
 * don't make every save rewrite everything; `runs-index.json` keeps the
 * summaries for lists. Every event is also appended to `run-events.jsonl`,
 * which feeds the Execution Logs page.
 */

const INDEX = "runs-index.json";
const EVENTS = "run-events.jsonl";
const EMPTY_INDEX = { runs: [] };
const MAX_INDEX = 1000;
const MAX_EVENTS_PER_RUN = 400;

export const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"];
export const FINAL_STATUSES = ["succeeded", "failed", "cancelled", "timed_out"];

export class RunNotFound extends Error {
  constructor() {
    super("Run not found.");
    this.publicMessage = "Run not found.";
    this.status = 404;
    this.type = "not_found";
  }
}

export class RunConflict extends Error {
  constructor(message) {
    super(message);
    this.publicMessage = message;
    this.status = 409;
    this.type = "conflict";
  }
}

export const isRunId = (id) => typeof id === "string" && /^run_[a-f0-9]{12}$/.test(id);
const fileOf = (id) => `${id}.json`;
const canSee = (actor, run) => actor.role === "admin" || run.ownerId === actor.id;

export function summarizeRun(run) {
  return {
    id: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    ownerId: run.ownerId,
    mode: run.mode,
    trigger: run.trigger,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    actions: run.stats.actions,
    costUsd: run.stats.costUsd,
    priced: run.stats.priced,
    tokens: run.stats.inputTokens + run.stats.outputTokens,
    pendingApproval: run.pendingApproval ? { toolId: run.pendingApproval.toolId, requestedAt: run.pendingApproval.requestedAt } : null,
    error: run.error ? run.error.slice(0, 200) : null,
    reportTitle: run.output.reports.at(-1)?.title || null,
  };
}

async function writeIndex(run) {
  const summary = summarizeRun(run);
  await updateJson(INDEX, EMPTY_INDEX, (d) => {
    const runs = (d?.runs || []).filter((r) => r.id !== run.id);
    return { value: { runs: [summary, ...runs].slice(0, MAX_INDEX) }, result: null };
  });
}

export async function createRun({ agent, actor, mode, trigger, input, ownerEmail = null }) {
  const now = new Date().toISOString();
  const run = {
    id: `run_${randomBytes(6).toString("hex")}`,
    agentId: agent.id,
    agentName: agent.config.name,
    ownerId: agent.ownerId,
    ownerEmail, // projects that act as the signed-in user receive this
    startedBy: actor.id,
    mode,
    trigger,
    input: input || "",
    status: "queued",
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: now,
    activeMs: 0,
    config: agent.config, // snapshot: edits made during the run don't change it
    stats: { modelCalls: 0, actions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, priced: true },
    output: { summary: "", reports: [], links: [], limitReached: false },
    pendingApproval: null,
    approvals: [],
    messages: [],
    events: [],
    error: null,
  };
  await logEvent(run, { type: "run_queued", message: `${mode === "test" ? "Test run" : "Run"} queued` });
  await updateJson(fileOf(run.id), null, () => ({ value: run, result: null }));
  await writeIndex(run);
  return run;
}

/** Appends an event to the run log (in memory; persisted with the next save) and to the global log. */
export async function logEvent(run, event) {
  const e = { at: new Date().toISOString(), level: "info", ...event };
  run.events.push(e);
  if (run.events.length > MAX_EVENTS_PER_RUN) run.events.splice(0, run.events.length - MAX_EVENTS_PER_RUN);
  try {
    await appendJsonLine(EVENTS, { ...e, runId: run.id, agentId: run.agentId, agentName: run.agentName, ownerId: run.ownerId, mode: run.mode });
  } catch (err) {
    console.error("[runs] could not write event log:", err.message);
  }
  return e;
}

export async function loadRun(id) {
  if (!isRunId(id)) return null;
  return readJson(fileOf(id), null);
}

/**
 * Read-modify-write a run. `mutate(run)` may change it in place and return
 * false to skip the write. Returns the stored run (or null when missing).
 */
export async function updateRun(id, mutate) {
  if (!isRunId(id)) throw new RunNotFound();
  const run = await updateJson(fileOf(id), null, async (cur) => {
    if (!cur) throw new RunNotFound();
    const keep = await mutate(cur);
    return { value: keep === false ? undefined : cur, result: cur };
  });
  await writeIndex(run);
  return run;
}

/** Full run for the API/UI (without the raw model conversation). */
export function publicRun(run) {
  const { messages: _messages, ...rest } = run;
  return rest;
}

export async function getRun(actor, id) {
  const run = await loadRun(id);
  if (!run || !canSee(actor, run)) throw new RunNotFound();
  return run;
}

export async function listRuns(actor, { agentId, status, limit = 100 } = {}) {
  const { runs = [] } = (await readJson(INDEX, EMPTY_INDEX)) || {};
  return runs
    .filter((r) => canSee(actor, r))
    .filter((r) => !agentId || r.agentId === agentId)
    .filter((r) => !status || (status === "active" ? ACTIVE_STATUSES.includes(r.status) : r.status === status))
    .slice(0, limit);
}

export async function runStats(actor) {
  const runs = await listRuns(actor, { limit: MAX_INDEX });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
  return {
    today: runs.filter((r) => day(r.createdAt) === today).length,
    awaitingApproval: runs.filter((r) => r.status === "waiting_approval").length,
    active: runs.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
  };
}

/** Most recent events across runs, newest first. */
export async function listEvents(actor, { limit = 300, level, runId } = {}) {
  const all = await readJsonLines(EVENTS);
  const out = [];
  for (let i = all.length - 1; i >= 0 && out.length < limit; i--) {
    const e = all[i];
    if (actor.role !== "admin" && e.ownerId !== actor.id) continue;
    if (level && e.level !== level) continue;
    if (runId && e.runId !== runId) continue;
    out.push(e);
  }
  return out;
}
