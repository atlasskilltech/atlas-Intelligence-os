# ATLAS portal agents

Every ATLAS portal that connects to IntelligenceOS as a two-way project has its **own AI agent**
inside that portal. The agent has a **brain** (its own scan of the portal's data, workflows and
what needs attention) and an **ask** action (it reads live data, reasons and *proposes* changes,
which a person confirms inside the portal).

The list below lives in ONE registry: `src/lib/portals/portalAgents.js`. It drives:

- the **Connect a project** presets (Connectors page, `ProjectsSection.js`),
- the persona shown on the plugin row and the project's agents card (`ProjectAgents.js`),
- the planner and Home assistant prompts (which portal owns which data, which `ask_*` /
  `*_brain` action to use),
- the tag on each connected project in tool descriptions (`describeProjects()`):
  `Project "hrms" — ATLAS HRMS [portal agent MIRA, ask via "ask_mira", brain "mira_brain"]`.

Adding a portal is one entry in the registry plus its example chips in
`src/components/agents/suggestions.js`.

## The seven agents

| Agent | Portal | Name meaning | Connect URL (UAT) | Acts as signed-in user | Ask action | Brain action |
|---|---|---|---|---|---|---|
| **Aila** | ATLAS CRM | Artificial Intelligence & Learning Assistant | `https://uat-crm.atlasskilltech.app/api/intos/v1` | No (preset unticked) | `ask_aila` | `aila_brain` |
| **KAIRO** | ATLAS Career Services | Set by the portal team (not confirmed here) | `https://uat-careerconnect.atlasskilltech.app/api/intos/v1` | No (preset unticked) | `ask_kairo` | `kairo_brain` |
| **VOYA** | ATLAS International | Set by the portal team (not confirmed here) | per install — `NEXT_PUBLIC_ATLAS_INTERNATIONAL_AGENT_URL` (no preset otherwise) | Yes | `ask_voya` | `voya_brain` |
| **NOVA** | ATLAS Dashboard | Navigating Operations, Visibility & Academics | `https://uat-dashboard.atlasskilltech.app/agent-api` | Yes | `ask_nova` | `nova_brain` |
| **MIRA** | ATLAS HRMS | My Intelligent Resource Assistant | `https://uat-hr.atlasskilltech.app/agent-api` | Yes | `ask_mira` | `mira_brain` |
| **SAGE** | ATLAS LearnX | Smart Academic Guide for Education | `/agent-api` on the LearnX host — `NEXT_PUBLIC_ATLAS_LEARNX_AGENT_URL`, else a placeholder | Yes | `ask_sage` | `sage_brain` |
| **ARYA** | ATLAS Admissions | Admissions Response & Yield Assistant | `/agent-api` on the Admissions host — `NEXT_PUBLIC_ATLAS_ADMISSIONS_AGENT_URL`, else a placeholder | Yes | `ask_arya` | `arya_brain` |

KAIRO's and VOYA's ask action may be published as a generic `ask` / `agent_ask` on older portal
builds; the project is then matched to its agent by name, and the planner is told to accept those ids.

Name meanings are recorded in the registry (`meaning`); KAIRO and VOYA are left blank until those portal teams confirm theirs — never
invent one. The `NEXT_PUBLIC_*` hosts are read at **build time** (the Connect form runs in the
browser). With no value the preset shows `https://your-<portal>-host/agent-api`, which the admin
must replace before connecting.

## What each portal covers

| Agent | Data it owns | Key scopes to tick on the portal's key |
|---|---|---|
| Aila | Admissions leads, counsellors, follow-ups, applications, payments, campaigns | Read leads / reports; Aila ask; agents (list, activate, run) |
| KAIRO | Placements, internships, recruiters, drives, student applications, offers | Read; KAIRO ask; agents |
| VOYA | International applicants, partner universities, exchange, visa progress | Read; VOYA ask; agents |
| NOVA | Timetable, exams & invigilation, attendance, rooms, events, tickets, admissions figures | Read areas; Drafts (optional); NOVA ask & brain; agents |
| MIRA | Employees, attendance & irregularities, leave, pending approvals | Read; MIRA ask & brain; agents |
| SAGE | Courses, assignments & grading queue, learner progress, at-risk students | Read; SAGE ask & brain; agents |
| ARYA | Applications, document verification backlog, chatbot leads, admissions pipeline | Read; ARYA ask & brain; agents |

Exact scope names are those on each portal's IntelligenceOS key screen.

## Connecting a portal, end to end

1. **On the portal** (admin): open its IntelligenceOS Connector / Keys page, create a key with the
   read scopes, the ask/brain scopes and the agent-sync scopes. For NOVA, MIRA, SAGE and ARYA keep
   **Acts as the signed-in user** on.
2. **IntelligenceOS → Connectors → Connect project**: click the portal's chip (e.g.
   *ATLAS HRMS · MIRA*). Name, URL and the *acts as the signed-in user* box are filled; fix the
   host if it differs (LearnX / Admissions: replace the placeholder), paste the key, **Connect**.
   IntelligenceOS fetches `GET <url>/manifest`, which lists `ask_<agent>`, `<agent>_brain`,
   `list_agents`, `activate_agent`, `deactivate_agent`, `run_agent` and the portal's own actions.
3. **Two-way sync (§2b):** IntelligenceOS calls `POST <url>/connect` with its callback URL and
   signing secret. From then on the portal sends signed webhooks when its own agents change, and
   the project page's *Agents in …* card shows them with Activate / Deactivate / Run.
4. **IntelligenceOS agents in the portal (§2c):** agents built here that use the portal are pushed
   to `<url>/intos-agents`, so the portal shows them too.
5. **Using the agent:** the planner and the Home assistant see the project tagged with its agent.
   A broad question reads `<agent>_brain` first; detail goes to `ask_<agent>` in plain language.
   Writes are only *proposed*: the answer carries `waiting_for_confirmation[]` and `confirm_url`,
   which become buttons on the run page — the person confirms inside the portal.
6. Emails must match in both apps (acting-as-user checks the owner's email on every call).

## Example chips (recipes)

| Agent | Chip | What it does |
|---|---|---|
| NOVA | Ask NOVA: what needs attention | Reads NOVA's brain and summarises today's campus issues |
| NOVA | Morning campus brief, Weekly attendance watch, … | See `docs/ATLAS_DASHBOARD_AGENTS.md` |
| MIRA | Pending approvals nudge | Weekdays 10:00 — approvals older than 2 days by approver |
| MIRA | Weekly attendance irregularities | Mondays 09:00 — last week's irregularities by department |
| SAGE | Grading queue | Weekdays 17:00 — ungraded submissions by course and faculty |
| SAGE | At-risk students | Mondays 08:30 — at-risk students by course with reasons |
| ARYA | Daily admissions brief | Daily 18:30 — applications, payments, documents, flags |
| ARYA | Document backlog watch | Weekdays 11:00 — documents waiting > 2 days by school |
| ARYA | Bot leads not pushed | Daily 19:00 — chatbot leads not yet in the CRM, with confirm link |
| Aila | Daily admission lead report, Counsellor workload report, Follow-up reminders | CRM recipes |

Chips live in `src/components/agents/suggestions.js`.
