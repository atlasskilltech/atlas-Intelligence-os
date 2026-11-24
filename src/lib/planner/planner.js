import "server-only";
import { callModel } from "../ai/index.js";
import { PLANNER_JSON_SCHEMA, normalizeAgentConfig, validateAgentConfig } from "../agents/agentConfig.js";
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

async function plan(userContent, { prompt, agentId }) {
  const result = await callModel(
    "generateStructured",
    {
      ...PLANNER_CALL,
      schema: PLANNER_JSON_SCHEMA,
      schemaName: "agent_plan",
      messages: [
        { role: "system", content: plannerSystemPrompt() },
        { role: "user", content: userContent },
      ],
    },
    { purpose: "planner", agentId, maxRetries: 1 },
  );

  const { config, warnings } = normalizeAgentConfig(result.data, { prompt });
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

export function generateAgent(prompt) {
  return plan(plannerUserPrompt(prompt), { prompt });
}

export function refineAgent(currentAgent, instruction) {
  return plan(refineUserPrompt(currentAgent, instruction), { prompt: currentAgent.source?.prompt || "" });
}
