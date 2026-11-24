import "server-only";
import { CONNECTORS as CATALOG } from "../catalog/toolCatalog.js";
import { notifyConnector, reportConnector } from "./builtin.js";
import { executorsOf } from "./defineConnector.js";
import { httpApiConnector } from "./http/httpApiConnector.js";

/**
 * Connector registry: every connector with code behind it.
 * Add new connectors (Milestones 7–8) to this list.
 */
export const REGISTERED = [reportConnector, notifyConnector, httpApiConnector];

/** { "connector.action": executor } for the engine. */
export const EXECUTORS = executorsOf(REGISTERED);

/** Catalog entries + live status, for the Connectors page and API. */
export async function connectorOverview() {
  return Promise.all(
    CATALOG.map(async (c) => {
      const impl = REGISTERED.find((r) => r.id === c.id);
      let status = { ready: false, message: `Coming in Milestone ${c.availableIn}` };
      if (impl) {
        try {
          status = (await impl.status?.()) || { ready: true, message: "Ready" };
        } catch (err) {
          status = { ready: false, message: `Status check failed: ${err?.message || "error"}` };
        }
      }
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        description: c.description,
        availableIn: c.availableIn,
        built: Boolean(impl),
        ...status,
        actions: c.actions.map((a) => ({ id: `${c.id}.${a.id}`, name: a.name, risk: a.risk, description: a.description })),
      };
    }),
  );
}
