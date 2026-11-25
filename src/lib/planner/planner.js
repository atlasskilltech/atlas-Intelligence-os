import "server-only";
import { callModel } from "../ai/index.js";
import { PLANNER_JSON_SCHEMA, normalizeAgentConfig, validateAgentConfig } from "../agents/agentConfig.js";
import { describeProjects } from "../connectors/projects/projectConnector.js";
import { plannerSystemPrompt, plannerUserPrompt, refineUserPrompt } from "./prompts.js";

/**
 * Planner: natural-language prompt → validated agent configuration.
 * Uses the "planner" model from Model Settings via the AI service.
 */

export const PROMPT_MIN = 10;
export const PROMPT_MAX = 4000;

const PLANNER_CALL = {
  maxOutputTokens: 16_000, // reasoning models spend tokens thinking before the JSON
  timeoutMs: 110_000,
  reasoningEffort: "low",
};

/**
 * Connected ATLAS projects, so the planner can name real actions (best-effort).
 * Projects that act as the signed-in user list only what THIS user may do there.
 */
async function projectContext(userEmail, onlyIds = null) {
  try {
    const [read, write] = await Promise.all([
      describeProjects("read", { userEmail, onlyIds }),
      describeProjects("write", { userEmail, onlyIds }),
    ]);
    return [read && `READ (atlas_project.read):\n${read}`, write && `CHANGE DATA (atlas_project.write):\n${write}`].filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}

async function plan(userContent, { prompt, agentId, keep, userEmail = null, actorId = null, projectIds = null }) {
  let projects = await projectContext(userEmail, projectIds);
  if (projectIds?.length && projects) {
    projects = `The employee chose these connectors for this agent — use only them:\n\n${projects}`;
  }
  const result = await callModel(
    "generateStructured",
    {
      ...PLANNER_CALL,
      schema: PLANNER_JSON_SCHEMA,
      schemaName: "agent_plan",
      messages: [
        { role: "system", content: plannerSystemPrompt({ projects }) },
        { role: "user", content: userContent },
      ],
    },
    { purpose: "planner", agentId, actorId, maxRetries: 1 },
  );

  // `keep` carries the employee's own settings the model never sees as editable
  // (pre-approvals, run limits) through a revision.
  const { config, warnings } = normalizeAgentConfig({ ...result.data, ...keep, connectors: { projects: projectIds || [] } }, { prompt });
  const check = validateAgentConfig(config);
  if (!check.ok) {
    // Should not happen: the normaliser always produces a valid shape.
    console.error("[planner] normalised config invalid:", check.errors.slice(0, 3));
  }
  return {
    agent: config,
    warnings,
    meta: { model: result.model, usage: result.usage, costUsd: result.costUsd, latencyMs: result.latencyMs },
  };
}

/** `who` = { userEmail, actorId, projectIds? } — projectIds limits the planner to the connectors the employee picked. */
export function generateAgent(prompt, who = {}) {
  return plan(plannerUserPrompt(prompt), { prompt, ...who });
}

export function refineAgent(currentAgent, instruction, who = {}) {
  return plan(refineUserPrompt(currentAgent, instruction), {
    ...who,
    prompt: currentAgent.source?.prompt || "",
    projectIds: who.projectIds ?? (currentAgent.connectors?.projects?.length ? currentAgent.connectors.projects : null),
    keep: { permissions: { preApproved: currentAgent.permissions?.preApproved || [] }, limits: currentAgent.limits },
  });
}
