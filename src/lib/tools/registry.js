import { RISK_LEVELS, getTool } from "../catalog/toolCatalog.js";
import { BUILTIN_TOOLS } from "./builtins.js";

/**
 * Tool registry: which catalog tools can actually EXECUTE, and their
 * function-calling definitions. Connectors added in Milestones 6–8 register
 * their executors here; the catalog stays the single list of what exists.
 */

const EXECUTORS = { ...BUILTIN_TOOLS };

export function getExecutor(toolId) {
  return EXECUTORS[toolId] || null;
}

export const isExecutable = (toolId) => !!EXECUTORS[toolId];

/** OpenAI function names allow [a-zA-Z0-9_-]; catalog ids use a dot. */
export const toFunctionName = (toolId) => toolId.replace(".", "__");
export const fromFunctionName = (name) => String(name || "").replace("__", ".");

/** Is this tool a side effect outside IntelligenceOS (write / send / destructive)? */
export const hasExternalEffect = (toolId) => RISK_LEVELS[getTool(toolId)?.risk]?.approval === true;

/** Function definitions for the agent's tools that can run today. */
export function toolDefinitions(toolIds, executors = EXECUTORS) {
  return toolIds
    .filter((id) => executors[id])
    .map((id) => {
      const t = getTool(id);
      return { name: toFunctionName(id), description: `${t.connectorName}: ${t.description}`, parameters: executors[id].parameters };
    });
}
