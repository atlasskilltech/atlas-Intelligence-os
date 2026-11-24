import { BUILTIN_TOOLS } from "../tools/builtins.js";
import { defineConnector } from "./defineConnector.js";

/** Built-in connectors (Milestone 5 tools, wrapped in the connector SDK). */
export const reportConnector = defineConnector({
  id: "report",
  actions: { create_report: BUILTIN_TOOLS["report.create_report"] },
  status: async () => ({ ready: true, message: "Built in" }),
});

export const notifyConnector = defineConnector({
  id: "notify",
  actions: { notify_owner: BUILTIN_TOOLS["notify.notify_owner"] },
  status: async () => ({ ready: true, message: "Built in" }),
});
