import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir, getSecretValues, isServerless } from "../config/env.js";
import { parseBody } from "../connectors/http/parseBody.js";
import { safeFetch } from "../connectors/http/safeFetch.js";
import { USER_AGENT, listProjects, projectKey } from "../connectors/projects/projectRepo.js";
import { redact } from "../security/redact.js";
import { readJson, updateJson } from "../storage/jsonFile.js";
import { MEMORY_VERSION, condensePortal, crossPortalLinks, memoryActionsFor, nightlyDue } from "./memoryCore.js";

/**
 * NEXUS super memory (spec B5). A background job fetches, for every connected
 * ATLAS project, its `<agent>_memory` and/or `<agent>_brain` (only the ones its
 * manifest lists) with the project's own connecting key and NO user header,
 * condenses + redacts them (memoryCore.condensePortal) and stores the result in
 * `super-memory.json` with per-portal status and gaps.
 *
 * When: nightly (IST 02:30–04:30, a missed night is skipped, not replayed), on
 * boot when no memory exists yet, after a project connects / re-syncs, and on
 * the admin "Rebuild now" button. Never on a request path (callers fire and forget).
 * Single-flight: one build per process (promise) and across processes (lock file).
 */

const FILE = "super-memory.json";
const EMPTY = { version: MEMORY_VERSION, builtAt: null, portals: {}, links: [], lastNightly: null, lastRun: null };
const CALL_TIMEOUT_MS = 20_000;
const CALL_MAX_BYTES = 3_000_000;
const TOTAL_BUDGET_MS = 5 * 60_000;
const LOCK_STALE_MS = 15 * 60_000;
const SWEEP_MS = 10 * 60_000;
export const REFRESH_DELAY_MS = 45_000; // after asking portals to rebuild their own memory
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lockFile = () => path.resolve(getDataDir(), "super-memory.lock");
const clean = (s) => redact(String(s ?? ""), getSecretValues());

export const readSuperMemory = () => readJson(FILE, EMPTY);

async function takeLock(now) {
  await fs.mkdir(path.resolve(getDataDir()), { recursive: true });
  try {
    const fh = await fs.open(lockFile(), "wx");
    await fh.writeFile(`${process.pid} ${new Date(now).toISOString()}\n`);
    await fh.close();
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    try {
      const { mtimeMs } = await fs.stat(lockFile());
      if (now - mtimeMs > LOCK_STALE_MS) {
        await fs.unlink(lockFile()).catch(() => {});
        return takeLock(now);
      }
    } catch {
      /* lock vanished: next run */
    }
    return false;
  }
}
const releaseLock = () => fs.unlink(lockFile()).catch(() => {});

/** GET one memory/brain action with the project key (no user header). Never throws. */
async function fetchAction(project, action, { refresh = false } = {}) {
  try {
    const res = await safeFetch(project.baseUrl + action.path + (refresh ? "?refresh=1" : ""), {
      method: "GET",
      headers: { Authorization: `Bearer ${projectKey(project)}`, Accept: "application/json", "User-Agent": USER_AGENT, "X-IntelligenceOS-Purpose": "super-memory" },
      timeoutMs: CALL_TIMEOUT_MS,
      maxBytes: CALL_MAX_BYTES,
    });
    const data = parseBody(res);
    if (res.status < 200 || res.status >= 300) {
      const why = typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : "";
      return { action: action.id, ok: false, error: clean(`HTTP ${res.status}${why ? `: ${why}` : ""}`).slice(0, 300) };
    }
    if (!data || typeof data !== "object") return { action: action.id, ok: false, error: "did not return JSON" };
    return { action: action.id, ok: true, data: JSON.parse(clean(JSON.stringify(data))) };
  } catch (err) {
    return { action: action.id, ok: false, error: clean(err?.message || "could not be reached").slice(0, 300) };
  }
}

/**
 * Builds (part of) the super memory. Returns the stored summary of the run, or
 * { skipped: "running" } when another build holds the lock.
 * `refreshPortals` (admin "Rebuild now" option, default off): first asks each
 * portal to rebuild its OWN memory (`<agent>_memory?refresh=1`), waits
 * REFRESH_DELAY_MS, then fetches as usual. Brain actions are never refreshed.
 * deps (tests): { listProjects, fetchAction, now, sleep, refreshDelayMs }
 */
export async function buildSuperMemory({ projectIds = null, reason = "manual", refreshPortals = false } = {}, deps = {}) {
  const list = deps.listProjects || listProjects;
  const fetchOne = deps.fetchAction || fetchAction;
  const now = deps.now || Date.now;
  const started = now();
  const only = Array.isArray(projectIds) && projectIds.length ? new Set(projectIds) : null;
  const projects = (await list()).filter((p) => p.enabled && p.status === "connected" && (!only || only.has(p.id)));
  const portals = {};
  const noMemory = []; // connected, but the manifest lists no memory/brain action
  const refreshed = [];
  if (refreshPortals === true) {
    for (const p of projects) {
      const { actions } = memoryActionsFor(p);
      const memId = actions.find((id) => id.endsWith("_memory"));
      if (!memId) continue;
      const r = await fetchOne(p, p.manifest.actions.find((a) => a.id === memId), { refresh: true });
      refreshed.push({ projectId: p.id, ok: !!r.ok, ...(r.ok ? {} : { error: r.error }) });
    }
    if (refreshed.length) await (deps.sleep || sleep)(deps.refreshDelayMs ?? REFRESH_DELAY_MS);
  }
  for (const p of projects) {
    const { agent, actions } = memoryActionsFor(p);
    if (!actions.length) {
      noMemory.push(p.id);
      continue;
    }
    if (now() - started > TOTAL_BUDGET_MS) {
      portals[p.id] = { projectId: p.id, projectName: p.name, portal: agent?.portal || p.name, persona: agent?.persona || null, status: "error", gaps: ["time budget used up — fetched on the next run"], fetchedAt: null };
      continue;
    }
    const results = [];
    for (const id of actions) results.push(await fetchOne(p, p.manifest.actions.find((a) => a.id === id)));
    portals[p.id] = { ...condensePortal({ project: p, agent, results }), fetchedAt: new Date(now()).toISOString() };
  }
  const connectedIds = new Set((await list()).map((p) => p.id));
  return updateJson(FILE, EMPTY, (cur) => {
    const prev = cur && typeof cur === "object" ? cur : EMPTY;
    const merged = { ...(only ? prev.portals || {} : {}) , ...portals };
    // Keep an earlier good entry when this run failed for that portal (status shows the failure).
    for (const [id, entry] of Object.entries(portals)) {
      const old = prev.portals?.[id];
      if (entry.status === "error" && old && old.status !== "error") merged[id] = { ...old, status: "stale", gaps: entry.gaps, lastFailedAt: new Date(now()).toISOString() };
    }
    for (const id of Object.keys(merged)) if (!connectedIds.has(id)) delete merged[id];
    const value = {
      ...prev,
      version: MEMORY_VERSION,
      builtAt: new Date(now()).toISOString(),
      portals: merged,
      links: crossPortalLinks(Object.values(merged).filter((x) => x.status !== "error").map((x) => x.agentId).filter(Boolean)),
      lastRun: {
        at: new Date(now()).toISOString(),
        reason,
        durationMs: now() - started,
        fetched: Object.keys(portals),
        noMemory,
        ok: Object.values(portals).filter((x) => x.status === "ok").length,
        failed: Object.values(portals).filter((x) => x.status === "error").length,
        ...(refreshPortals === true ? { refreshed } : {}),
      },
    };
    return { value, result: value.lastRun };
  });
}

let inFlight = null;

/** Single-flight build (process + lock file). Never throws. */
export async function rebuildSuperMemory(opts = {}, deps = {}) {
  if (inFlight) return { skipped: "running" };
  inFlight = (async () => {
    const now = (deps.now || Date.now)();
    if (!(await takeLock(now).catch(() => false))) return { skipped: "running" };
    try {
      return await buildSuperMemory(opts, deps);
    } catch (err) {
      console.error("[superMemory] build failed:", clean(err?.message).slice(0, 200));
      return { error: clean(err?.message || "failed").slice(0, 200) };
    } finally {
      await releaseLock();
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export const isBuilding = () => !!inFlight;

/** Fire-and-forget, for request paths (after a project connects). */
export function scheduleSuperMemory(opts = {}) {
  setTimeout(() => void rebuildSuperMemory(opts), 0);
}

/** Nightly sweep check: claims the IST date in the store first, then builds. */
export async function nightlyTick(now = Date.now()) {
  const date = nightlyDue(await readSuperMemory(), now);
  if (!date) return null;
  const claimed = await updateJson(FILE, EMPTY, (cur) =>
    cur?.lastNightly === date ? { value: undefined, result: false } : { value: { ...EMPTY, ...cur, lastNightly: date }, result: true },
  );
  return claimed ? rebuildSuperMemory({ reason: "nightly" }) : null;
}

/** Started from instrumentation.js on an always-on server. */
export function startSuperMemory() {
  const g = globalThis;
  if (g.__atlasSuperMemory || isServerless() || /^(0|false|no|off)$/i.test(process.env.SUPER_MEMORY_ENABLED || "")) return false;
  g.__atlasSuperMemory = setInterval(() => void nightlyTick().catch(() => {}), SWEEP_MS);
  g.__atlasSuperMemory.unref?.();
  // First memory: build in the background shortly after boot when none exists yet.
  setTimeout(async () => {
    const cur = await readSuperMemory();
    if (!cur.builtAt) await rebuildSuperMemory({ reason: "boot" });
  }, 60_000).unref?.();
  return true;
}
