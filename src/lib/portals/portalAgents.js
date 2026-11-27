/**
 * ATLAS portal agents — the ONE registry of the in-portal AI agents that
 * connect to IntelligenceOS as two-way projects (Agent API §2a/§2b/§2c).
 *
 * Read by:
 *   - the Connect form presets       (src/components/connectors/ProjectsSection.js)
 *   - the project card / agents list (persona name, ProjectAgents.js)
 *   - the planner and the assistant  (which ask/brain action belongs to which portal)
 *   - describeProjects()             (each connected project is labelled with its agent)
 *
 * Plain data, no server-only imports: the client components import it too.
 *
 * `meaning` is filled only where the portal has published what its agent's
 * name stands for; null means "ask the portal team" — never invent one.
 *
 * Adding a portal is one entry here. A connected project is matched to its
 * entry by the manifest actions it exposes (`<agent>_brain` / `ask_<agent>`),
 * falling back to the project name, so a renamed project still finds its agent.
 */

// Hosts for portals whose URL is not fixed yet can be set at build time
// (NEXT_PUBLIC_* — the Connect form runs in the browser, so Next inlines these
// literal references). Without one the preset shows a placeholder host that
// the admin must replace before connecting.
const ENV_HOSTS = {
  learnx: process.env.NEXT_PUBLIC_ATLAS_LEARNX_AGENT_URL,
  admissions: process.env.NEXT_PUBLIC_ATLAS_ADMISSIONS_AGENT_URL,
  international: process.env.NEXT_PUBLIC_ATLAS_INTERNATIONAL_AGENT_URL,
};

export const PORTAL_AGENTS = [
  {
    id: "crm",
    portal: "ATLAS CRM",
    persona: "Aila",
    meaning: "Artificial Intelligence & Learning Assistant",
    focus: "admissions leads, counsellors, follow-ups, applications, payments and campaigns",
    askAction: "ask_aila",
    brainAction: "aila_brain",
    nameMatch: /\bcrm\b/i,
    preset: {
      baseUrl: "https://uat-crm.atlasskilltech.app/api/intos/v1",
      keyHint: "CRM → Settings → IntelligenceOS Connector → Generate API key.",
      delegated: false,
    },
  },
  {
    id: "career_services",
    portal: "ATLAS Career Services",
    persona: "KAIRO",
    meaning: null,
    focus: "placements, internships, recruiters, drives, student applications and offers",
    askAction: "ask_kairo",
    brainAction: "kairo_brain",
    nameMatch: /career\s*(services|connect)/i,
    preset: {
      baseUrl: "https://uat-careerconnect.atlasskilltech.app/api/intos/v1",
      keyHint: "Career Services → Admin → Settings → IntelligenceOS Connector → Generate API key.",
      delegated: false,
    },
  },
  {
    id: "international",
    portal: "ATLAS International",
    persona: "VOYA",
    meaning: null,
    focus: "international applicants, partner universities, exchange and visa progress",
    askAction: "ask_voya",
    brainAction: "voya_brain",
    nameMatch: /international/i,
    // No preset yet: the International host is set per install.
    preset: ENV_HOSTS.international
      ? { baseUrl: ENV_HOSTS.international, keyHint: "ATLAS International → Settings → IntelligenceOS Connector → Generate API key.", delegated: true }
      : null,
  },
  {
    id: "dashboard",
    portal: "ATLAS Dashboard",
    persona: "NOVA",
    meaning: null,
    focus: "timetable, exams and invigilation, attendance, rooms, student events, tickets and admissions figures",
    askAction: "ask_nova",
    brainAction: "nova_brain",
    nameMatch: /\bdashboard\b/i,
    preset: {
      baseUrl: "https://uat-dashboard.atlasskilltech.app/agent-api",
      keyHint: "ATLAS Dashboard → Access Management → IntelligenceOS Keys → + New key (keep “Acts as the signed-in user” ticked).",
      delegated: true,
    },
  },
  {
    id: "hrms",
    portal: "ATLAS HRMS",
    persona: "MIRA",
    meaning: null,
    focus: "employees, attendance and irregularities, leave balances and pending approvals",
    askAction: "ask_mira",
    brainAction: "mira_brain",
    nameMatch: /\b(hrms|hr)\b/i,
    preset: {
      baseUrl: "https://uat-hr.atlasskilltech.app/agent-api",
      keyHint: "ATLAS HRMS → Admin → IntelligenceOS Connector → Generate API key.",
      delegated: true,
    },
  },
  {
    id: "learnx",
    portal: "ATLAS LearnX",
    persona: "SAGE",
    meaning: null,
    focus: "courses, assignments and the grading queue, learner progress and at-risk students",
    askAction: "ask_sage",
    brainAction: "sage_brain",
    nameMatch: /learn\s*x/i,
    preset: {
      baseUrl: ENV_HOSTS.learnx || "https://your-learnx-host/agent-api",
      hostPlaceholder: !ENV_HOSTS.learnx,
      keyHint: "ATLAS LearnX → Admin → IntelligenceOS Connector → Generate API key.",
      delegated: true,
    },
  },
  {
    id: "admissions",
    portal: "ATLAS Admissions",
    persona: "ARYA",
    meaning: null,
    focus: "applications, documents and verification backlog, chatbot leads and the admissions pipeline",
    askAction: "ask_arya",
    brainAction: "arya_brain",
    nameMatch: /admissions?\b/i,
    preset: {
      baseUrl: ENV_HOSTS.admissions || "https://your-admissions-host/agent-api",
      hostPlaceholder: !ENV_HOSTS.admissions,
      keyHint: "ATLAS Admissions → Admin → IntelligenceOS Connector → Generate API key.",
      delegated: true,
    },
  },
];

const BY_ACTION = new Map();
for (const p of PORTAL_AGENTS) {
  BY_ACTION.set(p.askAction, p);
  BY_ACTION.set(p.brainAction, p);
}

/** Connect-form presets, in display order (only portals with a known or placeholder URL). */
export function portalPresets() {
  return PORTAL_AGENTS.filter((p) => p.preset).map((p) => ({
    id: p.id,
    label: p.portal,
    name: p.portal,
    persona: p.persona,
    baseUrl: p.preset.baseUrl,
    keyHint: p.preset.keyHint,
    delegated: !!p.preset.delegated,
    hostPlaceholder: !!p.preset.hostPlaceholder,
  }));
}

export const getPortalAgent = (id) => PORTAL_AGENTS.find((p) => p.id === id) || null;

/**
 * The portal agent behind a connected project, or null.
 * Matches the manifest's ask/brain action ids first (exact), then the name.
 * Accepts a project ({ name, manifest: { actions } }) or { name, actions }.
 */
export function portalAgentFor(project) {
  if (!project) return null;
  const actions = project.manifest?.actions || project.actions || [];
  for (const a of actions) {
    const hit = BY_ACTION.get(a?.id);
    if (hit) return hit;
  }
  const name = String(project.name || project.manifest?.project?.name || "");
  if (!name) return null;
  // Longest-specific first: "ATLAS Dashboard admissions" is the Dashboard, not Admissions.
  const order = ["dashboard", "career_services", "international", "learnx", "hrms", "crm", "admissions"];
  for (const id of order) {
    const p = getPortalAgent(id);
    if (p.nameMatch.test(name)) return p;
  }
  return null;
}

/** One line for prompts: `ATLAS CRM → Aila (ask_aila, aila_brain)` … */
export function portalAgentsSummary() {
  return PORTAL_AGENTS.map((p) => `${p.portal} → ${p.persona} (ask: ${p.askAction}, brain: ${p.brainAction}; covers ${p.focus})`).join("\n");
}

/** Short tag appended to a connected project's line in tool descriptions. */
export function portalAgentTag(project) {
  const p = portalAgentFor(project);
  if (!p) return "";
  const ids = new Set((project.manifest?.actions || project.actions || []).map((a) => a?.id));
  const parts = [`portal agent ${p.persona}`];
  if (ids.has(p.askAction)) parts.push(`ask via "${p.askAction}"`);
  if (ids.has(p.brainAction)) parts.push(`brain "${p.brainAction}"`);
  return ` [${parts.join(", ")}]`;
}
