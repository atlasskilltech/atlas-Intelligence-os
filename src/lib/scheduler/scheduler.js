import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listAgents } from "../agents/agentRepo.js";
import { getDataDir, isAuthEnabled, isServerless } from "../config/env.js";
import { RunConflict, listRuns, loadRun } from "../runs/runRepo.js";
import { executeRun, reconcileStale, startRun } from "../engine/runner.js";
import { addNotification } from "../notifications/notificationRepo.js";
import { readJson, updateJson } from "../storage/jsonFile.js";
import { emailForActorId } from "../users/userRepo.js";
import { nextRunAfter, scheduleSignature } from "./nextRun.js";

/**
 * Scheduler (Milestone 9). Every 30 s it checks active agents with a schedule
 * and starts a LIVE run, as the agent's owner, when one is due.
 *
 * Error recovery:
 *  - a run still in progress → this time is skipped (no pile-up)
 *  - the server was down: a run missed by more than 15 min is skipped, not back-filled
 *  - a run that failed for a temporary reason (AI rate limit/timeout/network,
 *    server restart) is retried once, 5 minutes later
 *  - several server processes: a claim file per (agent, time) means each run starts once
 *  - runs left "running" by a crash are marked interrupted at start-up
 *
 * State: DATA_DIR/schedules.json. On Vercel there is no long-running process:
 * call GET /api/scheduler/tick from a cron instead (see docs).
 */

const FILE = "schedules.json";
const EMPTY = { agents: {}, heartbeatAt: null, pid: null };
export const TICK_MS = 30_000;
export const GRACE_MS = 15 * 60_000;
export const RETRY_AFTER_MS = 5 * 60_000;
export const RETRY_WITHIN_MS = 60 * 60_000;
export const MAX_RETRIES = 1;
const SYSTEM = { id: "system", name: "Scheduler", role: "admin" };

const claimDir = () => path.resolve(getDataDir(), "schedule-claims");

/** Atomic across processes on the same disk: only the first caller gets true. */
async function claim(agentId, dueMs) {
  await fs.mkdir(claimDir(), { recursive: true });
  try {
    const fh = await fs.open(path.join(claimDir(), `${agentId}-${dueMs}.claim`), "wx");
    await fh.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
    await fh.close();
    return true;
  } catch (err) {
    if (err.code === "EEXIST") return false;
    throw err;
  }
}

async function cleanClaims(now) {
  try {
    for (const f of await fs.readdir(claimDir())) {
      const file = path.join(claimDir(), f);
      const { mtimeMs } = await fs.stat(file);
      if (now - mtimeMs > 2 * 86_400_000) await fs.unlink(file).catch(() => {});
    }
  } catch {
    /* nothing to clean */
  }
}

/** The actor a scheduled run acts as: the agent's owner. Null when the owner no longer exists. */
async function ownerActor(agent) {
  const email = await emailForActorId(agent.ownerId);
  if (isAuthEnabled() && /^u_\d+$/.test(agent.ownerId) && !email) return null;
  return { id: agent.ownerId, name: "Scheduler", role: "user", email, scheduler: true };
}

const notifyOwner = (agent, message, level = "warning") =>
  addNotification({ ownerId: agent.ownerId, message, level, agentId: agent.id, agentName: agent.config.name }).catch(() => {});

/**
 * One pass. Returns what happened (for logs, the cron route and tests).
 * deps: { start(actor, agentId, opts) → run, execute(runId) } — injectable for tests.
 */
export async function tick({ now = Date.now(), start = startRun, execute = (id) => executeRun(id), wait = false } = {}) {
  const agents = (await listAgents(SYSTEM)).filter((a) => a.status === "active" && a.config.trigger?.type === "schedule" && a.config.trigger.schedule);
  const state = (await readJson(FILE, EMPTY)) || EMPTY;
  const next = { ...EMPTY, agents: {}, heartbeatAt: new Date(now).toISOString(), pid: process.pid };
  const result = { started: [], skipped: [], missed: [], retried: [], errors: [] };
  const pending = [];

  const launch = async (agent, st, trigger) => {
    const actor = await ownerActor(agent);
    if (!actor) {
      st.lastResult = "skipped";
      st.lastError = "The agent's owner no longer has an account, so it can't run.";
      result.skipped.push({ agentId: agent.id, reason: st.lastError });
      return null;
    }
    try {
      const run = await start(actor, agent.id, { mode: "live", trigger });
      st.lastRunId = run.id;
      st.lastResult = "started";
      st.lastError = null;
      pending.push(Promise.resolve(execute(run.id)).catch((err) => console.error("[scheduler] run failed:", err?.message)));
      return run;
    } catch (err) {
      st.lastResult = "skipped";
      st.lastError = err instanceof RunConflict ? "Skipped: the previous run was still in progress." : err?.publicMessage || err?.message || "Could not start.";
      result.skipped.push({ agentId: agent.id, reason: st.lastError });
      if (!(err instanceof RunConflict)) result.errors.push({ agentId: agent.id, error: st.lastError });
      return null;
    }
  };

  for (const agent of agents) {
    const sched = agent.config.trigger.schedule;
    const sig = scheduleSignature(sched);
    const st = { ...(state.agents?.[agent.id] || {}) };
    next.agents[agent.id] = st;
    try {
      // New, re-activated or edited schedule: start counting from now (no surprise run).
      if (st.signature !== sig || !st.nextRunAt) {
        Object.assign(st, { signature: sig, nextRunAt: nextRunAfter(sched, now).toISOString(), retries: 0 });
        continue;
      }

      const due = Date.parse(st.nextRunAt);
      if (now >= due) {
        st.nextRunAt = nextRunAfter(sched, now).toISOString(); // never catch up on several missed runs
        st.retries = 0;
        if (now - due > GRACE_MS) {
          st.lastResult = "missed";
          st.lastError = `Missed the run at ${new Date(due).toISOString()} (the server was not running).`;
          result.missed.push({ agentId: agent.id, due: new Date(due).toISOString() });
          await notifyOwner(agent, `"${agent.config.name}" missed its scheduled run because the server was down. It will run at the next scheduled time.`);
          continue;
        }
        if (!(await claim(agent.id, due))) continue; // another process took it
        st.lastFiredAt = new Date(now).toISOString();
        const run = await launch(agent, st, "schedule");
        if (run) result.started.push({ agentId: agent.id, runId: run.id });
        continue;
      }

      // Retry once after a temporary failure of the last scheduled run.
      if (st.lastRunId && (st.retries || 0) < MAX_RETRIES) {
        const last = await loadRun(st.lastRunId);
        const finished = last?.finishedAt ? Date.parse(last.finishedAt) : null;
        if (last?.status === "failed" && last.retryable && finished && now - finished >= RETRY_AFTER_MS && now - finished <= RETRY_WITHIN_MS) {
          if (await claim(agent.id, `retry${finished}`)) {
            st.retries = (st.retries || 0) + 1;
            const run = await launch(agent, st, "schedule_retry");
            if (run) result.retried.push({ agentId: agent.id, runId: run.id, retryOf: last.id });
          }
        }
      }
    } catch (err) {
      st.lastError = `Scheduler error: ${err?.message || "unknown"}`;
      result.errors.push({ agentId: agent.id, error: st.lastError });
    }
  }

  await updateJson(FILE, EMPTY, () => ({ value: next, result: null }));
  if (wait) await Promise.all(pending);
  return result;
}

/** Schedule info for one agent (agent page). `schedule` gives an expected next time before the first tick. */
export async function scheduleInfo(agentId, schedule = null) {
  const state = (await readJson(FILE, EMPTY)) || EMPTY;
  let st = state.agents?.[agentId] || null;
  if (schedule && (!st?.nextRunAt || st.signature !== scheduleSignature(schedule))) {
    st = { ...st, nextRunAt: nextRunAfter(schedule, Date.now()).toISOString(), estimated: true };
  }
  const heartbeatAge = state.heartbeatAt ? Date.now() - Date.parse(state.heartbeatAt) : null;
  return {
    nextRunAt: st?.nextRunAt || null,
    estimated: Boolean(st?.estimated),
    lastFiredAt: st?.lastFiredAt || null,
    lastRunId: st?.lastRunId || null,
    lastResult: st?.lastResult || null,
    lastError: st?.lastError || null,
    schedulerRunning: heartbeatAge != null && heartbeatAge < 3 * TICK_MS,
    heartbeatAt: state.heartbeatAt,
  };
}

/** Marks runs a crash left in progress as interrupted (retryable). */
export async function recoverRuns() {
  for (const r of await listRuns(SYSTEM, { status: "active", limit: 500 })) await reconcileStale(r.id).catch(() => {});
}

// ---------------------------------------------------------------------------
// Background loop (always-on server only)
// ---------------------------------------------------------------------------

export function schedulerEnabled() {
  if (/^(0|false|no|off)$/i.test(process.env.SCHEDULER_ENABLED || "")) return false;
  return !isServerless();
}

export function startScheduler() {
  const g = globalThis;
  if (g.__atlasScheduler || !schedulerEnabled()) return false;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await tick();
      if (r.started.length || r.retried.length || r.missed.length || r.errors.length) console.log("[scheduler]", JSON.stringify(r));
      if (Math.random() < 0.02) await cleanClaims(Date.now());
    } catch (err) {
      console.error("[scheduler] tick failed:", err?.message);
    } finally {
      busy = false;
    }
  };
  g.__atlasScheduler = setInterval(run, TICK_MS);
  g.__atlasScheduler.unref?.();
  // First pass shortly after start-up: recover crashed runs, then check schedules.
  setTimeout(() => recoverRuns().finally(run), 5_000).unref?.();
  console.log("[scheduler] started (checks every 30 s)");
  return true;
}
