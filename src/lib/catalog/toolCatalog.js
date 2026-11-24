/**
 * Tool catalog — every tool an agent may use, grouped by connector.
 *
 * Pure data (safe to import on client and server). The planner may ONLY pick
 * tool ids from this list. Connectors (src/lib/connectors) supply the code for
 * these tools; `availableIn` marks the milestone that makes a tool
 * actually executable, so the UI can be honest about what works today.
 *
 * Risk levels (enforced by code, never by the model):
 *   read        – reads data, no side effects                → runs automatically
 *   internal    – writes only inside IntelligenceOS          → runs automatically
 *   write       – creates/changes data in another system     → needs approval
 *   send        – sends a message to people                  → needs approval
 *   destructive – deletes or irreversible change             → always needs approval
 */

export const RISK_LEVELS = {
  read: { label: "Read only", tone: "success", approval: false },
  internal: { label: "Internal", tone: "neutral", approval: false },
  write: { label: "Changes data", tone: "warning", approval: true },
  send: { label: "Sends messages", tone: "warning", approval: true },
  destructive: { label: "Destructive", tone: "danger", approval: true },
};

export const CONNECTORS = [
  {
    id: "report",
    name: "Reports",
    category: "built-in",
    description: "Create the agent's report inside IntelligenceOS.",
    availableIn: 5,
    actions: [
      { id: "create_report", name: "Create report", risk: "internal", description: "Save a formatted report (title, summary, sections, tables) as the run's result, visible in the dashboard." },
    ],
  },
  {
    id: "notify",
    name: "Dashboard notifications",
    category: "built-in",
    description: "Notify the agent's owner inside IntelligenceOS.",
    availableIn: 5,
    actions: [
      { id: "notify_owner", name: "Notify owner", risk: "internal", description: "Show a notification to the agent's owner in the dashboard." },
    ],
  },
  {
    id: "atlas_project",
    name: "ATLAS projects",
    category: "atlas",
    description: "ATLAS apps (CRM, ERP, LMS…) connected with a project key. Only the actions that key allows.",
    availableIn: 7,
    actions: [
      { id: "read", name: "Read from project", risk: "read", description: "Run a read-only action that a connected ATLAS project allows, e.g. search leads or get a report." },
      { id: "write", name: "Change data in project", risk: "write", description: "Run an action that changes data in a connected ATLAS project, e.g. add a note or update a status." },
    ],
  },
  {
    id: "http_api",
    name: "Custom REST API",
    category: "general",
    description: "Call an administrator-approved REST API endpoint.",
    availableIn: 6,
    actions: [
      { id: "get", name: "GET request", risk: "read", description: "Read data from an approved API endpoint." },
      { id: "post", name: "POST request", risk: "write", description: "Send data to an approved API endpoint." },
    ],
  },
];

/** Flat list: one entry per tool, id = "connector.action". */
export const TOOLS = CONNECTORS.flatMap((c) =>
  c.actions.map((a) => ({
    ...a,
    id: `${c.id}.${a.id}`, // after the spread, so the action's short id can't overwrite it
    actionId: a.id,
    connectorId: c.id,
    connectorName: c.name,
    category: c.category,
    availableIn: c.availableIn,
    requiresApproval: RISK_LEVELS[a.risk].approval,
  })),
);

export const TOOL_IDS = TOOLS.map((t) => t.id);

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
export const getTool = (id) => BY_ID.get(id) || null;

/** Latest completed milestone; tools with availableIn <= this can actually run. Bump as connectors ship. */
export const CURRENT_MILESTONE = 7;
export const isToolAvailable = (id) => (getTool(id)?.availableIn ?? Infinity) <= CURRENT_MILESTONE;
