import { CONNECTORS as CATALOG } from "../catalog/toolCatalog.js";

/**
 * Connector SDK. A connector supplies the CODE for actions already declared in
 * the tool catalog (`src/lib/catalog/toolCatalog.js`) — the catalog stays the
 * single list of what exists, with names, descriptions and risk levels.
 *
 * defineConnector({
 *   id: "my_connector",                       // must exist in the catalog
 *   actions: {
 *     some_action: {
 *       parameters: { type: "object", ... },  // JSON schema for the arguments (validated before execute)
 *       execute: async (args, ctx) => data,   // returns data for the model (treated as untrusted)
 *       isReady: async () => true,            // optional: false → "not connected yet", the step is skipped
 *       describe: async () => "extra text",   // optional: appended to the tool description at run time
 *     },
 *   },
 *   status: async () => ({ ready, message }), // optional: shown on the Connectors page
 * })
 *
 * Risk / approval rules come from the catalog, never from the connector.
 */
export function defineConnector(def) {
  const entry = CATALOG.find((c) => c.id === def?.id);
  if (!entry) throw new Error(`defineConnector: "${def?.id}" is not in the tool catalog.`);
  for (const [actionId, a] of Object.entries(def.actions || {})) {
    if (!entry.actions.some((x) => x.id === actionId)) throw new Error(`defineConnector: ${def.id}.${actionId} is not in the tool catalog.`);
    if (a?.parameters?.type !== "object") throw new Error(`defineConnector: ${def.id}.${actionId} needs an object parameters schema.`);
    if (typeof a.execute !== "function") throw new Error(`defineConnector: ${def.id}.${actionId} needs an execute() function.`);
  }
  return Object.freeze({ ...def, actions: Object.freeze({ ...def.actions }) });
}

/** Flattens connectors into { "connector.action": executor }. */
export function executorsOf(connectors) {
  const out = {};
  for (const c of connectors) for (const [actionId, a] of Object.entries(c.actions)) out[`${c.id}.${actionId}`] = a;
  return out;
}
