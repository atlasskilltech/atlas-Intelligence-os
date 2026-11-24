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
| 5 | Execution engine & tool-calling loop | ✅ |
| 6 | Connector framework & custom REST connector | ✅ |
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
- [x] Running agents (Run test) → done in Milestone 5

## Milestone 5 — Execution engine ✅

- [x] Engine (`src/lib/engine/runner.js`): bounded tool-calling loop, one action at a time
- [x] Safety in code: only the agent's own connected tools; arguments validated against each tool's schema; unknown/unconnected tools refused and the run continues
- [x] Tool output returned to the AI as labelled untrusted data; secrets redacted from logs and results
- [x] Limits: max actions (then a forced final summary), time limit, AI-call cap, per-tool 60 s timeout
- [x] Test runs simulate write/send actions; live runs need an active agent
- [x] Approval workflow: run pauses, owner approves/rejects with a note, run resumes; pre-approved tools run directly; approvals expire after 7 days
- [x] Cancel (stops after the current step, never overwritten); interrupted runs detected by stale heartbeat
- [x] One active run per agent; usage/tokens/cost tracked per run
- [x] Built-in tools that work now: Reports · Create report, Notify owner
- [x] Storage: one file per run + index; global event log (`run-events.jsonl`); notifications
- [x] UI: Run test / Run now (with optional extra instructions), live run page (polling, report, step-by-step log, approval card, cancel), Execution History with filters, Execution Logs, recent runs on agent page, Home counts + latest updates
- [x] Tests: 46 unit tests (+13 engine: happy path, refusals, simulation, approve/reject, pre-approval, limits, AI failure, redaction, cancel, stale runs); browser flow incl. approval card, dark mode, mobile
- [x] Custom REST connector → done in Milestone 6
- [ ] ATLAS connectors (CRM, website), Gmail, Calendar → Milestones 7–8

## Milestone 6 — Connector framework & custom REST connector ✅

- [x] Connector SDK `defineConnector()` (`src/lib/connectors/`): code for actions declared in the tool catalog; risk/approval still come only from the catalog
- [x] Registry (`connectors/index.js`) feeds the engine; built-in Reports / Notify moved onto it
- [x] Readiness: a connector can be "built but not set up" (`isReady`) → its steps are skipped like unconnected tools; run-time tool descriptions (`describe`)
- [x] Custom REST API connections (`api-connections.json`): base URL, auth (none / bearer / header / basic), explicit endpoint list (GET/POST, path template, allowed query params); admin-only changes; id fixed after creation
- [x] Agents call only listed endpoints by API id + endpoint id; values are URL-encoded into `{placeholders}`, unknown parameters refused
- [x] `http_api.get` reads run automatically; `http_api.post` needs approval and is simulated in test runs
- [x] Secrets only in server env vars `CONNECTOR_SECRET_*` (the connection stores the name); never in responses, logs or runs; echoed secrets redacted
- [x] SSRF guard (`security/netGuard.js`): https only, private/loopback/metadata addresses blocked unless the host is in `INTERNAL_ALLOWED_HOSTS` (then http allowed too), checked at connect time (DNS rebinding), every redirect re-checked, credentials dropped on cross-site redirects, 20 s timeout, 1 MB response cap
- [x] Planner sees the registered APIs and names real endpoints in steps
- [x] Connectors page: live status for every connector; add / edit / disable / delete APIs; "Test endpoint" (GET only) with response preview
- [x] API: `GET /api/connectors`, `GET/POST /api/connectors/http-api`, `GET/PUT/DELETE /api/connectors/http-api/[id]`, `POST /api/connectors/http-api/[id]/test`
- [x] Tests: 62 unit tests (+16: guard, validation, URL building, auth, redaction, redirects, size cap, DNS check, disabled APIs, engine read / simulated POST / approved POST / bad calls); browser flow incl. agent run against a mock API, dark mode, mobile
- [ ] Per-agent API restriction (today any agent with the REST tools may use every enabled API)
- [ ] Outbound HTTP proxy support (connectors connect directly)
