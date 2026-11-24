# Implementation Checklist

Status: ✅ done · 🔄 in progress · ⬜ not started

| # | Milestone | Status |
|---|---|---|
| 1 | Project foundation (JS, Tailwind, dashboard shell) | ✅ |
| 2 | OpenAI integration & provider abstraction | ✅ |
| 2.1 | UI redesign (ChatGPT/Claude layout, CRM palette) + Vercel storage fix | ✅ |
| 3 | Prompt-to-Agent Builder | ✅ |
| 4 | Agent config, storage, plans & approval workflow | ✅ |
| 4.1 | Logo, favicon, light/dark mode | ✅ |
| 5 | Execution engine & tool-calling loop | ⬜ |
| 6 | Connector framework & custom REST connector | ⬜ |
| 7 | First ATLAS internal connector | ⬜ |
| 8 | External connectors (Gmail, Calendar) | ⬜ |
| 9 | Scheduling, background execution, error recovery | ⬜ |
| 10 | Dashboard data, history, usage, security & tests | ⬜ |
| 11 | Production readiness & DB/auth plan | ⬜ |

## Milestone 1 — Project foundation ✅

- [x] Converted TypeScript → JavaScript (`jsconfig.json` keeps `@/*` imports)
- [x] Removed TypeScript dependencies and config
- [x] Disabled `cacheComponents` / `partialPrefetching` (live data dashboard)
- [x] Tailwind design tokens (`brand-*` colours) in `globals.css`
- [x] Responsive app shell: desktop sidebar, mobile/tablet drawer, top bar
- [x] Reusable UI: Button, Card, Badge, PageHeader, StatCard, Icon, Empty/Loading/Error/Alert states
- [x] Pages: Overview, Create Agent, My Agents, Execution History, Execution Logs, Connectors, Model Settings, API Usage
- [x] Loading, error and 404 pages
- [x] `.env.example`, `docs/ARCHITECTURE.md`, this checklist
- [x] Verified: lint, production build, all routes return 200, desktop + mobile screenshots

## Milestone 2 — OpenAI integration & provider abstraction ✅

- [x] `ModelProvider` interface (`src/lib/ai/provider.js`) with a provider-independent message/tool format
- [x] OpenAI provider (Chat Completions): text, structured JSON (strict schema), tool calling, model list
- [x] Error classification (`AIError`): auth, quota, rate limit, timeout, connection, server, model not found…
- [x] Retry with exponential backoff + jitter, honouring `retry-after`; permanent errors are not retried
- [x] AI service (`src/lib/ai/index.js`) — single entry point; picks model by purpose (planner / agent)
- [x] Token usage + estimated cost logged per call (`DATA_DIR/usage.jsonl`), editable pricing table
- [x] Model settings stored in `DATA_DIR/settings.json` (models, max tokens, timeout, retries, prices)
- [x] API: `/api/ai/status`, `/api/ai/test`, `/api/ai/models`, `/api/settings/models`, `/api/usage`
- [x] Model Settings page (connection test, model list, limits, pricing) and API Usage page
- [x] Live AI status badge in top bar; Overview shows real monthly cost
- [x] Secrets: key read only server-side, redacted from logs; never in responses or pages
- [x] Tests: 14 unit tests (`npm test`) + end-to-end against a mock OpenAI server (retry, errors, cost, no key leak)
- [ ] Live check with the real OpenAI key (run "Test connection" on the server)

## Milestone 2.1 — UI redesign & Vercel fixes ✅

- [x] ChatGPT/Claude-style layout: collapsible navy sidebar (remembered per browser), “New agent” button, recent agents, user/status footer
- [x] Home = centred prompt box with suggestions; Enter submits and carries the prompt to “Create an agent”
- [x] ATLAS CRM palette and font (Inter, emerald #10b981, navy #1e293b, slate neutrals, emerald page titles)
- [x] Vercel: data stored in `/tmp/atlas-data` with an on-screen “temporary storage” warning
- [x] Storage failures no longer break AI calls; failed saves return a clear message (503)
- [x] Tests: 15 unit tests; end-to-end with mock OpenAI incl. unwritable storage and simulated Vercel; desktop/tablet/mobile checks

## Milestone 3 — Prompt-to-Agent Builder ✅

- [x] Tool catalog (`src/lib/catalog/toolCatalog.js`): connectors, actions, risk levels, milestone availability
- [x] Agent config format (`src/lib/agents/agentConfig.js`): strict planner JSON schema + zod validation
- [x] Normaliser: removes unknown tools, derives tools/approvals/limits in code (model cannot grant itself permissions), clamps sizes
- [x] Schedules: friendly fields → cron + readable text (`src/lib/agents/schedule.js`)
- [x] Planner (`src/lib/planner/`): catalog-aware system prompt, prompt-injection rules, generate + refine
- [x] `POST /api/agents/generate` (generate or refine; input validation; 120 s max duration for Vercel)
- [x] Builder UI: Describe → Planning → Review; edit name/description/steps (reorder, add, delete, change tool)/schedule/instructions
- [x] “Refine with AI” chat panel; clarifying questions with one-click “Answer”; assumptions & missing capabilities
- [x] Summary: trigger, tools with risk + availability, approvals, limits; plan cost/tokens shown
- [x] Draft kept in the browser tab (survives refresh); Download JSON; Start over
- [x] Tests: 23 unit tests (schema strict-mode check, normaliser safety, schedules, planner against fake OpenAI); full browser flow incl. mobile
- [x] Saving agents → done in Milestone 4

## Milestone 4 — Agent storage, plans & approval workflow ✅

- [x] Agent repository (`src/lib/agents/agentRepo.js`) on `agents.json`: create / get / list / update / status / delete; ids `ag_<12 hex>`; owner + created/updated by
- [x] Safe writes: per-file lock (`updateJson`) so concurrent saves never lose data; a corrupt file is never overwritten
- [x] Stale-edit protection: saving an agent changed elsewhere returns 409 "reload to see the latest"
- [x] Status workflow: draft → active ⇄ paused (invalid transitions refused, repeats are no-ops)
- [x] Approval settings: per-tool "Ask me first"; only write/send tools can be pre-approved, destructive always asks; computed by code
- [x] Editable run limits (max actions 1–30, time limit 1–15 min); kept through AI refine
- [x] API: `GET/POST /api/agents`, `GET/PUT/DELETE /api/agents/[id]`, `POST /api/agents/[id]/status`
- [x] Create page: Save & activate / Save as draft
- [x] My Agents page: filters (All / Active / Paused / Drafts), quick pause/resume/delete, empty state
- [x] Agent page: edit + save changes, discard, unsaved-changes warning, pause/resume/activate, delete with confirmation, AI refine
- [x] Sidebar "Recent agents" and Home "Active agents" use real data
- [x] Tests: 33 unit tests (+10: approvals, repository, permissions, concurrency, corrupt-file safety); full browser flow
- [ ] Running agents (Run test) → Milestone 5
