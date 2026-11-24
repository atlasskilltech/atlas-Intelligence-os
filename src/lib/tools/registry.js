import { RISK_LEVELS, getTool } from "../catalog/toolCatalog.js";
import { EXECUTORS } from "../connectors/index.js";

/**
 * Tool registry: which catalog tools can actually EXECUTE, and their
 * function-calling definitions. Executors come from the connector registry
 * (`src/lib/connectors/index.js`); the catalog stays the single list of what exists.
 */

export function getExecutor(toolId) {
  return EXECUTORS[toolId] || null;
}

/** OpenAI function names allow [a-zA-Z0-9_-]; catalog ids use a dot. */
export const toFunctionName = (toolId) => toolId.replace(".", "__");
export const fromFunctionName = (name) => String(name || "").replace("__", ".");

/** Is this tool a side effect outside IntelligenceOS (write / send / destructive)? */
export const hasExternalEffect = (toolId) => RISK_LEVELS[getTool(toolId)?.risk]?.approval === true;

/**
 * Which of the agent's tools can run right now: an executor exists and, if it
 * has an isReady() check (e.g. "an API has been added"), that check passes.
 * Also collects run-time description extras. Never throws.
 */
export async function resolveTools(toolIds, executors = EXECUTORS) {
  const ready = new Set();
  const extra = {};
  for (const id of toolIds) {
    const ex = executors[id];
    if (!ex) continue;
    try {
      if (ex.isReady && !(await ex.isReady())) continue;
      ready.add(id);
      if (ex.describe) extra[id] = String((await ex.describe()) || "").slice(0, 6000);
    } catch (err) {
      console.error(`[tools] readiness check failed for ${id}:`, err?.message);
    }
  }
  return { ready, extra };
}

/** Function definitions for the given ready tools. */
export function toolDefinitions(toolIds, executors = EXECUTORS, { ready, extra = {} } = {}) {
  return toolIds
    .filter((id) => executors[id] && (!ready || ready.has(id)))
    .map((id) => {
      const t = getTool(id);
      const description = [`${t.connectorName}: ${t.description}`, extra[id]].filter(Boolean).join("\n\n");
      return { name: toFunctionName(id), description, parameters: executors[id].parameters };
    });
}
