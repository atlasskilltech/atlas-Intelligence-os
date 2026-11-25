import "server-only";
import { randomBytes } from "node:crypto";
import { getAgent } from "../agents/agentRepo.js";
import { getTool } from "../catalog/toolCatalog.js";
import { callModel as realCallModel } from "../ai/index.js";
import { getSecretValues } from "../config/env.js";
import { addNotification } from "../notifications/notificationRepo.js";
import { emailForActorId } from "../users/userRepo.js";
import {
  ACTIVE_STATUSES,
  RunConflict,
  RunNotFound,
  createRun,
  getRun,
  listRuns,
  loadRun,
  logEvent,
  updateRun,
} from "../runs/runRepo.js";
import { redact } from "../security/redact.js";
import { validateArgs } from "../tools/argsValidator.js";
import { EXECUTORS } from "../connectors/index.js";
import { pushAgentById } from "../connectors/projects/agentPush.js";
import { PLAN_TOOL_NAME, fromFunctionName, hasExternalEffect, planToolDefinition, resolveTools, toolDefinitions } from "../tools/registry.js";
import { runStartMessage, runSystemPrompt } from "./prompt.js";

/**
 * Execution engine (Milestone 5): a bounded tool-calling loop.
 *
 *  queued → running → (waiting_approval → queued → running)* → succeeded | failed | cancelled | timed_out
 *
 * Safety is enforced here, in code: only the agent's own tools, arguments
 * validated against each tool's schema, approvals for write/send/destructive
 * tools, a cap on actions and time, side effects simulated in test runs, tool
 * output sent back to the model as untrusted data, secrets redacted from logs.
 *
 * Runs execute in this server process (see docs/ARCHITECTURE.md). A run whose
 * process died is detected by its stale heartbeat and marked interrupted.
 */

const TOOL_TIMEOUT_MS = 60_000;
const MODEL_CALL_TIMEOUT_MS = 120_000;
const TOOL_RESULT_MAX = 8_000;
const STALE_AFTER_MS = 3 * 60_000;
const APPROVAL_TTL_MS = 7 * 24 * 60 * 60_000;

const RUNNING = new Set(); // run ids executing in this process

const DEFAULT_DEPS = {
  callModel: realCallModel,
  executors: EXECUTORS,
  notify: addNotification,
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}… [truncated ${s.length - n} characters]` : s);
const safeText = (s) => redact(String(s ?? ""), getSecretValues());
const ms = (n) => `${(n / 1000).toFixed(1)}s`;

class StopRun extends Error {}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a run for an agent. The caller schedules `executeRun(run.id)` (e.g. with `after()`). */
export async function startRun(actor, agentId, { mode = "test", input = "", trigger = "manual" } = {}) {
  const agent = await getAgent(actor, agentId);
  if (!["test", "live"].includes(mode)) throw new RunConflict("Unknown run mode.");
  if (mode === "live" && agent.status !== "active") {
    throw new RunConflict(`This agent is ${agent.status}. Activate it to run it for real, or use a test run.`);
  }
  const active = await listRuns(actor, { agentId, status: "active" });
  for (const r of active) await reconcileStale(r.id);
  if ((await listRuns(actor, { agentId, status: "active" })).length) {
    throw new RunConflict("This agent already has a run in progress. Wait for it to finish or cancel it.");
  }
  // Projects that act as the signed-in user need the OWNER's email (not whoever pressed Run).
  const ownerEmail = agent.ownerId === actor.id ? actor.email || null : await emailForActorId(agent.ownerId);
  return createRun({ agent, actor, mode, trigger, ownerEmail, input: String(input || "").trim().slice(0, 2000) });
}

/** Cancel a queued, running or waiting run. A running step finishes, then the run stops. */
export async function cancelRun(actor, runId) {
  await getRun(actor, runId);
  return updateRun(runId, async (run) => {
    if (!ACTIVE_STATUSES.includes(run.status)) throw new RunConflict(`This run already ${run.status.replace("_", " ")}.`);
    run.status = "cancelled";
    run.finishedAt = new Date().toISOString();
    run.pendingApproval = null;
    run.resumeAction = null;
    await logEvent(run, { type: "run_cancelled", level: "warning", message: `Cancelled by ${actor.name || actor.id}` });
  });
}

/** Approve or reject the pending action. The caller then schedules `executeRun(runId)`. */
export async function decideApproval(actor, runId, { decision, note = "" }) {
  if (!["approve", "reject"].includes(decision)) throw new RunConflict("Decision must be approve or reject.");
  await getRun(actor, runId);
  return updateRun(runId, async (run) => {
    const p = run.pendingApproval;
    if (run.status !== "waiting_approval" || !p) throw new RunConflict("This run is not waiting for an approval.");
    const decidedAt = new Date().toISOString();
    const cleanNote = String(note || "").trim().slice(0, 500);
    run.approvals.push({ ...p, decision, decidedBy: actor.id, decidedByName: actor.name || actor.id, decidedAt, note: cleanNote });
    run.resumeAction = { decision, toolId: p.toolId, toolCallId: p.toolCallId, args: p.args, note: cleanNote };
    run.pendingApproval = null;
    run.status = "queued";
    run.heartbeatAt = decidedAt;
    await logEvent(run, {
      type: decision === "approve" ? "approval_granted" : "approval_rejected",
      level: decision === "approve" ? "info" : "warning",
      message: `${getTool(p.toolId)?.name || p.toolId} ${decision === "approve" ? "approved" : "rejected"} by ${actor.name || actor.id}${cleanNote ? ` — "${cleanNote}"` : ""}`,
      toolId: p.toolId,
    });
  });
}

/**
 * Marks a run whose process is gone (stale heartbeat) as failed, and expires
 * approvals nobody answered. Safe to call any time; returns the current run.
 */
export async function reconcileStale(runId, now = Date.now()) {
  const run = await loadRun(runId);
  if (!run) return null;
  const staleExec = ["queued", "running"].includes(run.status) && !RUNNING.has(runId) && now - Date.parse(run.heartbeatAt) > STALE_AFTER_MS;
  const expired = run.status === "waiting_approval" && run.pendingApproval && now - Date.parse(run.pendingApproval.requestedAt) > APPROVAL_TTL_MS;
  if (!staleExec && !expired) return run;
  return updateRun(runId, async (r) => {
    if (!ACTIVE_STATUSES.includes(r.status)) return false;
    r.status = "failed";
    r.finishedAt = new Date(now).toISOString();
    r.error = expired
      ? "The approval request expired after 7 days without an answer."
      : "Interrupted — the server stopped while this run was in progress. Start it again.";
    r.retryable = !expired;
    r.pendingApproval = null;
    await logEvent(r, { type: "run_failed", level: "error", message: r.error });
  });
}

/** Runs (or resumes) a run until it finishes, pauses for approval, or is cancelled. Never throws. */
export async function executeRun(runId, deps = DEFAULT_DEPS) {
  if (RUNNING.has(runId)) return;
  RUNNING.add(runId);
  try {
    await loop(runId, { ...DEFAULT_DEPS, ...deps });
  } catch (err) {
    console.error(`[engine] run ${runId} crashed:`, safeText(err?.message));
    try {
      await updateRun(runId, async (r) => {
        if (!ACTIVE_STATUSES.includes(r.status)) return false;
        r.status = "failed";
        r.finishedAt = new Date().toISOString();
        r.error = "Internal error while running the agent.";
        await logEvent(r, { type: "run_failed", level: "error", message: r.error });
      });
    } catch {}
  } finally {
    RUNNING.delete(runId);
  }
}

export const isExecuting = (runId) => RUNNING.has(runId);

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

async function loop(runId, deps) {
  // Claim the run.
  let run = await updateRun(runId, async (r) => {
    if (r.status !== "queued" && r.status !== "running") return false;
    r.status = "running";
    r.startedAt ??= new Date().toISOString();
    r.heartbeatAt = new Date().toISOString();
  });
  if (run.status !== "running") return;

  const config = run.config;
  // Tools that can run now: connected AND set up (e.g. an API has been added).
  if (run.ownerEmail === undefined) run.ownerEmail = await emailForActorId(run.ownerId); // runs created before v1.1
  run.output.links ??= [];
  const projectIds = config.connectors?.projects?.length ? config.connectors.projects : null; // agent locked to chosen connectors
  const resolved = await resolveTools(config.tools, deps.executors, { ownerEmail: run.ownerEmail, projectIds });
  const executable = (id) => resolved.ready.has(id);
  const actionTools = toolDefinitions(config.tools, deps.executors, resolved);
  const planTool = planToolDefinition(config.steps);
  const tools = [...actionTools, planTool];
  const budgetMs = config.limits.timeoutMinutes * 60_000;
  const maxModelCalls = config.limits.maxSteps * 2 + 5 + config.steps.length; // + progress updates
  const segmentStart = Date.now();
  const elapsed = () => run.activeMs + (Date.now() - segmentStart);

  // Persist the working copy unless the run was cancelled meanwhile.
  const save = async () => {
    let cancelled = false;
    run.heartbeatAt = new Date().toISOString();
    const stored = await updateRun(runId, async (cur) => {
      if (cur.status === "cancelled") {
        cancelled = true;
        return false;
      }
      Object.assign(cur, run);
    });
    if (cancelled) throw new StopRun();
    return stored;
  };

  // `retryable`: a temporary problem (AI rate limit, timeout, network) — the scheduler may retry once.
  const finish = async (status, { error = null, event, level = "info", retryable = false } = {}) => {
    run.status = status;
    run.retryable = retryable;
    run.finishedAt = new Date().toISOString();
    run.activeMs = elapsed();
    run.error = error;
    await logEvent(run, { type: `run_${status}`, level, message: event || error || "Run finished", durationMs: run.activeMs });
    await save();
    // §2c: projects that list this agent see its last run. Best effort, never throws.
    if (run.mode === "live") await pushAgentById(run.agentId);
    if (run.mode === "live" || status !== "succeeded") {
      await safeNotify(deps, run, {
        level: status === "succeeded" ? "success" : "error",
        message: status === "succeeded" ? `"${run.agentName}" finished.` : `"${run.agentName}" ${status.replace("_", " ")}: ${error || ""}`.trim(),
      });
    }
  };

  try {
    if (run.messages.length === 0) {
      run.messages = [
        { role: "system", content: runSystemPrompt(config, { mode: run.mode, executable }) },
        { role: "user", content: runStartMessage({ input: run.input }) },
      ];
      const missing = config.tools.filter((id) => !executable(id));
      await logEvent(run, {
        type: "run_started",
        message: `${run.mode === "test" ? "Test run" : "Run"} started · ${actionTools.length} tool${actionTools.length === 1 ? "" : "s"} available`,
      });
      if (missing.length) {
        await logEvent(run, {
          type: "tools_unavailable",
          level: "warning",
          message: `Not connected yet, steps using them will be skipped: ${missing.map((id) => getTool(id)?.name || id).join(", ")}`,
        });
      }
      await save();
    } else {
      await logEvent(run, { type: "run_resumed", message: "Run resumed" });
    }

    // Resume after an approval decision.
    if (run.resumeAction) {
      const a = run.resumeAction;
      run.resumeAction = null;
      if (a.decision === "approve") {
        await executeTool(run, a.toolId, a.toolCallId, a.args, deps);
      } else {
        pushToolResult(run, a.toolCallId, {
          ok: false,
          error: `The owner rejected this action${a.note ? `: "${a.note}"` : ""}. Do not try it again; continue without it.`,
        });
      }
      await save();
    }

    for (;;) {
      if (elapsed() >= budgetMs) {
        return await finish("timed_out", { error: `Stopped: the run reached its ${config.limits.timeoutMinutes}-minute time limit.`, level: "error" });
      }
      if (run.stats.modelCalls >= maxModelCalls) {
        return await finish("failed", { error: "Stopped: too many AI calls without finishing.", level: "error" });
      }

      const limitHit = run.stats.actions >= config.limits.maxSteps;
      if (limitHit && !run.output.limitReached) {
        run.output.limitReached = true;
        run.messages.push({
          role: "user",
          content: `You have reached the limit of ${config.limits.maxSteps} actions for this run. Do not call any more action tools. You may record progress with update_plan (mark unfinished steps as skipped), then write your final summary, including what is left undone.`,
        });
        await logEvent(run, { type: "limit_reached", level: "warning", message: `Action limit reached (${config.limits.maxSteps})` });
      }

      let res;
      try {
        res = await deps.callModel(
          "chatWithTools",
          {
            messages: run.messages,
            tools: limitHit ? [planTool] : tools,
            timeoutMs: Math.max(5_000, Math.min(MODEL_CALL_TIMEOUT_MS, budgetMs - elapsed())),
          },
          { purpose: "agent_run", agentId: run.agentId, runId: run.id, actorId: run.ownerId },
        );
      } catch (err) {
        return await finish("failed", { error: `AI request failed: ${err?.message || "unknown error"}`, level: "error", retryable: err?.retryable === true });
      }

      run.stats.modelCalls += 1;
      run.stats.inputTokens += res.usage?.inputTokens || 0;
      run.stats.outputTokens += res.usage?.outputTokens || 0;
      if (res.costUsd == null) run.stats.priced = false;
      else run.stats.costUsd = Math.round((run.stats.costUsd + res.costUsd) * 1e6) / 1e6;
      await logEvent(run, {
        type: "model_call",
        message: `AI step ${run.stats.modelCalls} · ${res.model || ""} · ${(res.usage?.inputTokens || 0) + (res.usage?.outputTokens || 0)} tokens · ${ms(res.latencyMs || 0)}`,
        model: res.model,
        tokens: (res.usage?.inputTokens || 0) + (res.usage?.outputTokens || 0),
        costUsd: res.costUsd ?? null,
      });

      const first = res.toolCalls?.[0];
      const call = first && (!limitHit || first.name === PLAN_TOOL_NAME) ? first : null;
      if (!call) {
        run.output.summary = clip(safeText(res.text || "").trim(), 20_000) || "(The agent finished without a summary.)";
        run.messages.push({ role: "assistant", content: res.text || "" });
        return await finish("succeeded", {
          event: run.output.limitReached ? "Finished at the action limit" : "Run succeeded",
          level: run.output.limitReached ? "warning" : "info",
        });
      }

      run.messages.push({ role: "assistant", content: res.text || "", toolCalls: [call] });
      if (res.text?.trim()) await logEvent(run, { type: "agent_note", message: clip(safeText(res.text.trim()), 500) });

      const paused = await handleToolCall(run, call, deps, res.text, executable);
      await save();
      if (paused) {
        run.activeMs = elapsed();
        await save();
        await safeNotify(deps, run, {
          level: "warning",
          message: `"${run.agentName}" is waiting for your approval to ${getTool(run.pendingApproval.toolId)?.name.toLowerCase() || "continue"}.`,
        });
        return;
      }
    }
  } catch (err) {
    if (err instanceof StopRun || err instanceof RunNotFound) return; // cancelled or deleted
    throw err;
  }
}

/** Returns true when the run must pause for approval. */
async function handleToolCall(run, call, deps, reasonText, executable = (id) => !!deps.executors[id]) {
  if (call.name === PLAN_TOOL_NAME) return recordProgress(run, call);
  const toolId = fromFunctionName(call.name);
  const tool = getTool(toolId);
  const reject = async (message) => {
    pushToolResult(run, call.id, { ok: false, error: message });
    await logEvent(run, { type: "tool_rejected", level: "warning", message: `${call.name}: ${message}`, toolId });
    return false;
  };

  if (!tool || !run.config.tools.includes(toolId)) return reject("This tool is not part of the agent's plan. Use only the tools listed.");
  const executor = deps.executors[toolId];
  if (!executor || !executable(toolId)) return reject("This tool is not connected yet. Skip this step and mention it in your final summary.");
  if (call.arguments == null) return reject("The arguments were not valid JSON. Try again with valid JSON.");
  const problems = validateArgs(executor.parameters, call.arguments);
  if (problems.length) return reject(`Invalid arguments: ${problems.join("; ")}.`);

  run.stats.actions += 1;

  if (run.mode === "test" && hasExternalEffect(toolId)) {
    pushToolResult(run, call.id, { ok: true, simulated: true, result: "TEST RUN: this action was simulated and not actually performed." });
    await logEvent(run, { type: "tool_simulated", level: "warning", message: `${tool.connectorName} · ${tool.name} simulated (test run)`, toolId, args: redactArgs(call.arguments) });
    recordProjectCall(run, toolId, call.arguments, "simulated");
    return false;
  }

  if (run.config.permissions.toolsRequiringApproval.includes(toolId)) {
    run.pendingApproval = {
      id: `ap_${randomBytes(6).toString("hex")}`,
      toolId,
      toolCallId: call.id,
      args: call.arguments,
      reason: clip(safeText(reasonText || "").trim(), 1000),
      requestedAt: new Date().toISOString(),
    };
    run.status = "waiting_approval";
    await logEvent(run, {
      type: "approval_requested",
      level: "warning",
      message: `Waiting for approval: ${tool.connectorName} · ${tool.name}`,
      toolId,
      args: redactArgs(call.arguments),
    });
    return true;
  }

  await executeTool(run, toolId, call.id, call.arguments, deps);
  return false;
}

/** update_plan: log step progress for the run page. Never pauses, never counts as an action. */
async function recordProgress(run, call) {
  const problems = call.arguments == null ? ["the arguments were not valid JSON"] : validateArgs(planToolDefinition(run.config.steps).parameters, call.arguments);
  if (problems.length) {
    pushToolResult(run, call.id, { ok: false, error: `Invalid progress update: ${problems.join("; ")}.` });
    await logEvent(run, { type: "tool_rejected", level: "warning", message: `${PLAN_TOOL_NAME}: ${problems.join("; ")}` });
    return false;
  }
  const titles = new Map(run.config.steps.map((s, i) => [s.id, `${i + 1}. ${s.title}`]));
  for (const u of call.arguments.steps) {
    const note = u.note ? clip(safeText(u.note.trim()), 300) : "";
    await logEvent(run, {
      type: "step_progress",
      level: u.status === "failed" ? "warning" : "info",
      message: `Step ${titles.get(u.id)} — ${u.status}${note ? `: ${note}` : ""}`,
      stepId: u.id,
      stepStatus: u.status,
    });
  }
  pushToolResult(run, call.id, { ok: true, recorded: call.arguments.steps.length });
  return false;
}

async function executeTool(run, toolId, toolCallId, args, deps) {
  const tool = getTool(toolId);
  const executor = deps.executors[toolId];
  const started = Date.now();
  const ctx = {
    run: { id: run.id, agentId: run.agentId, agentName: run.agentName, ownerId: run.ownerId, ownerEmail: run.ownerEmail ?? null, mode: run.mode, projectIds: run.config?.connectors?.projects?.length ? run.config.connectors.projects : null },
    addReport: async (report) => {
      run.output.reports.push({ ...report, createdAt: new Date().toISOString() });
      if (run.output.reports.length > 10) run.output.reports.shift();
    },
    notify: async ({ message, level }) => safeNotify(deps, run, { message, level }),
    // A project returned a draft / confirm link: show it as a button and tell the owner.
    addLink: async (link) => {
      run.output.links ??= [];
      if (run.output.links.some((l) => l.url === link.url)) return;
      run.output.links.push({ ...link, toolId, createdAt: new Date().toISOString() });
      if (run.output.links.length > 20) run.output.links.shift();
      const what = link.kind === "confirm" ? "needs your confirmation" : "has a draft ready for you to check and submit";
      await logEvent(run, { type: "link_ready", message: `${link.projectName} ${what}`, toolId });
      await safeNotify(deps, run, { level: "warning", message: `"${run.agentName}": ${link.projectName} ${what}. Open the run to continue.` });
    },
  };
  try {
    if (!executor) throw new Error("This tool is not connected yet.");
    let timer;
    const data = await Promise.race([
      executor.execute(args, ctx),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`Timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS))),
    ]).finally(() => clearTimeout(timer));
    pushToolResult(run, toolCallId, { ok: true, result: data });
    recordProjectCall(run, toolId, args, "ok");
    await logEvent(run, {
      type: "tool_call",
      message: `${tool.connectorName} · ${tool.name} ✓ (${ms(Date.now() - started)})`,
      toolId,
      args: redactArgs(args),
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = safeText(err?.message || "Tool failed");
    pushToolResult(run, toolCallId, { ok: false, error: message });
    recordProjectCall(run, toolId, args, "failed");
    await logEvent(run, { type: "tool_error", level: "error", message: `${tool?.name || toolId} failed: ${message}`, toolId, durationMs: Date.now() - started });
  }
}

const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ACTION_ID_RE = /^[A-Za-z0-9_.-]{1,60}$/;

/**
 * Which ATLAS projects this run actually called, for the history and run pages:
 * run.output.projectCalls = [{ project, ok, failed, simulated, actions: [action ids] }].
 * Ids come from the model's arguments, so only well-formed ones are kept.
 */
export function recordProjectCall(run, toolId, args, outcome) {
  if (!String(toolId).startsWith("atlas_project.")) return;
  const project = args?.project;
  if (typeof project !== "string" || !PROJECT_ID_RE.test(project)) return;
  run.output.projectCalls ??= [];
  let entry = run.output.projectCalls.find((e) => e.project === project);
  if (!entry) {
    if (run.output.projectCalls.length >= 30) return;
    entry = { project, ok: 0, failed: 0, simulated: 0, actions: [] };
    run.output.projectCalls.push(entry);
  }
  entry[outcome] = (entry[outcome] || 0) + 1;
  const action = args?.action;
  if (typeof action === "string" && ACTION_ID_RE.test(action) && !entry.actions.includes(action) && entry.actions.length < 20) {
    entry.actions.push(action);
  }
}

/** Tool output goes back to the model as clearly-labelled untrusted data. */
function pushToolResult(run, toolCallId, payload) {
  const body = clip(safeText(JSON.stringify(payload)), TOOL_RESULT_MAX);
  run.messages.push({ role: "tool", toolCallId, content: `<tool_result untrusted="true">\n${body}\n</tool_result>` });
}

function redactArgs(args) {
  try {
    return JSON.parse(clip(safeText(JSON.stringify(args ?? {})), 2_000));
  } catch {
    return { note: "arguments too long to log" };
  }
}

async function safeNotify(deps, run, { message, level }) {
  try {
    await deps.notify({ ownerId: run.ownerId, message, level, agentId: run.agentId, agentName: run.agentName, runId: run.id });
  } catch (err) {
    console.error("[engine] notification failed:", err?.message);
  }
}
