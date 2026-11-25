# ATLAS IntelligenceOS — Architecture

Internal AI Agent Builder for ATLAS SkillTech University employees.
Employees describe a task in plain language; the platform turns it into an
agent with a reviewable plan, then runs it with approved tools.

## Stack

- Next.js 16 (App Router), **JavaScript only**, React 19
- Tailwind CSS v4 (all styling; design tokens in `src/app/globals.css`)
- Server-side API routes for all AI and connector work
- MySQL for users (tables prefixed `intelligence_os_`); other data still in JSON files
- Sign in with Google; roles admin / user

> This Next.js version differs from older ones. Check `node_modules/next/dist/docs/`
> before using an API. Notably: `middleware` is now `proxy.js`; `instrumentation.js`
> `register()` runs once at server start (used for the scheduler).

## Design system

The UI mirrors the **ATLAS CRM** (`atlasskilltech/uat-crm`: `src/public/css/style.css`,
`docs/BRAND_ASSETS.md`) in a ChatGPT/Claude-style layout:

- Font **Inter** (UI) and **JetBrains Mono** (code), loaded with `next/font`.
- `brand-*` = CRM emerald: `#10b981` primary, `#059669` hover, `#ecfdf5` tint.
- `navy-*` = CRM navy `#1e293b` (sidebar, body text); neutrals are Tailwind `slate`.
- Dark navy collapsible sidebar; active item = emerald fill + navy text (CRM rule).
- Page titles are emerald, extra-bold (CRM `.page-title`). Info alerts use CRM blue `#3b82f6`.
- Home page is a centred prompt box ("What would you like to automate?").
- All tokens live in `src/app/globals.css` — change colours there only.

### Brand & themes

- Logos in `public/brand/`: `logo-dark.svg` (white text — navy sidebar and dark mode),
  `logo-light.svg` (dark text — light mode), `logo.svg` (original), `favicon.svg`.
  `src/app/icon.svg` is the favicon (served by Next automatically).
- Light / Dark / System theme (toggle in the header). Class-based (`html.dark`), applied
  before paint by `THEME_BOOT_SCRIPT` (`src/lib/theme.js`), choice kept in localStorage.
- Dark mode remaps the slate neutrals and tint colours in `globals.css`, plus two semantic
  tokens: `bg-surface` (cards/inputs) and `text-ink` (headings). Use those instead of
  `bg-white` / `text-navy-800` in new UI. The sidebar is navy in both themes.

## Folder layout

```
src/
├── app/
│   ├── (dashboard)/        pages sharing the sidebar layout
│   └── api/                server-only routes (planner, agents, runs, connectors, webhooks)
├── components/
│   ├── ui/                 Button, Card, Badge, PageHeader, StatCard, States, Icon
│   └── layout/             AppShell, Sidebar, navigation config
├── lib/                    server-only core (added from Milestone 2)
│   ├── ai/                 ModelProvider interface + OpenAI provider + pricing
│   ├── planner/            prompt → validated agent config
│   ├── engine/             tool-calling loop, limits, retries, verification
│   ├── connectors/         defineConnector SDK, registry, built-in connectors
│   ├── scheduler/          cron + webhook triggers
│   ├── memory/             run context + task history
│   ├── storage/            repositories (JSON files now, MySQL later)
│   ├── security/           SSRF guard, validation, secret redaction
│   └── context.js          "actor" (fixed local user until auth exists)
└── instrumentation.js      boots the scheduler
data/                       JSON storage (git-ignored)
```

## Agent lifecycle

```
Prompt → Planner (structured JSON, validated) → Agent config → Employee review/edit
→ Test (dry run: reads real, writes previewed) → Activate
→ Trigger (manual | schedule | webhook) → Engine loop:
     model picks tool → allow-list check → input validation
     → approval gate for write/send/destructive → execute w/ timeout
     → classify errors (retryable / fixable / fatal) → bounded retry
     → result returned to model as UNTRUSTED data
→ Verify success criteria → Final report → status
```

Permissions are enforced in code, never by the model.

## AI layer (Milestone 2)

```
planner / engine ──► callModel(method, opts, { purpose, agentId, runId })   src/lib/ai/index.js
                        │  model chosen by purpose from Model Settings
                        │  timeout + retry (retry.js) + usage/cost logging
                        ▼
                   ModelProvider (provider.js)  ──►  providers/openai.js  (Chat Completions)
```

- Methods: `generateText`, `generateStructured` (strict JSON schema), `chatWithTools`, `listModels`.
- All provider errors become `AIError` with a `type` and `retryable` flag (errors.js).
- Usage: one JSON line per call in `DATA_DIR/usage.jsonl`; prices in `pricing.js`
  plus per-model overrides in Model Settings. Unknown prices are reported, never guessed.
- Pages that show live data call `await connection()` (`export const dynamic` no longer exists).
- Tests: `npm test` (Node test runner, `--conditions=react-server` so `server-only` imports work).

## Prompt-to-Agent planner (Milestone 3)

```
prompt ─► POST /api/agents/generate ─► planner.generateAgent()
            │   system prompt = rules + TOOL CATALOG (exact ids)
            │   callModel("generateStructured", strict JSON schema, purpose "planner")
            ▼
         normalizeAgentConfig()  ← tools, approvals, limits, cron computed by CODE
            ▼
         { agent, warnings, meta } ─► Review UI (edit / refine) ─► (M4) save
```

- The planner may only choose tool ids from `toolCatalog.js` (enforced by a JSON-schema enum
  and again by the normaliser). Unmet needs go to `notes.missingCapabilities`.
- Approval rules come from each tool's risk level, never from the model.
- Refinement sends the current (re-normalised) draft plus the employee's change request.

## Connectors

The tool catalog (`lib/catalog/toolCatalog.js`) declares every connector and action with its
risk level. A connector module built with `defineConnector()` (`lib/connectors/`) supplies the
code: per action a JSON-schema `parameters`, `execute(args, ctx)`, and optionally `isReady()`
(built but not set up → the step is skipped) and `describe()` (extra run-time tool text).
`defineConnector` refuses actions that are not in the catalog, and approvals always come from
the catalog's risk level. Register new connectors in `lib/connectors/index.js`.

### ATLAS projects (Milestone 7)

```
project admin ─► creates key with scopes (inside the project)
IntelligenceOS admin ─► Connect project { name, url, key } ─► GET url/manifest (Bearer key)
     └► project-connections.json  { id, baseUrl, keyBox (AES-GCM), manifest{actions}, status }
agent ─► atlas_project.read / .write { project, action, params }
     └► callAction: action in manifest? right tool? params valid? ─► safeFetch with the key
```

Contract: `docs/AGENT_API_SPEC.md`. Reference add-on: `examples/agent-api-node/`.

**Acting as the user (v1.1):** a project connected with `delegated: true` receives
`X-IntelligenceOS-User: <agent owner's email>` on every call. IntelligenceOS fetches that user's
manifest (cached 10 min) so the planner and the run only offer what the owner may do there; the
project re-checks every call. Responses with `draft_url` / `confirm_url` (own https site only)
become buttons on the run page, because the person finishes the action inside the project. The project
decides what a key may do; IntelligenceOS adds its own rules (approval for writes, no deletes).

ATLAS internal apps are connected in this order of preference:

1. Every ATLAS app connects as a **project with a key**: the app adds the Agent API (keys with
   scopes + manifest) in its own stack, following `docs/AGENT_API_SPEC.md`. There is no other
   connector type — no free-form REST, website, email or calendar connectors.
2. Browser automation (Playwright) → last resort, read-only, post-Milestone 11.

Agents never get raw database, shell or arbitrary code access.

## Users & sign-in (Milestone 7.1)

```
browser ─► proxy.js: valid ios_session cookie? ── no ─► /login (pages) · 401 (API)
/login ─► /api/auth/google ─► Google ─► /api/auth/google/callback
          (state cookie)            code → token → ID token checks → signInWithGoogle()
                                    → intelligence_os_users (invite-only) → signed cookie
route/page ─► getActor()/getPageActor(): cookie → user re-read from MySQL → { id: "u_<id>", role }
```

- Roles: `admin` (users, project connections, model settings, sees all agents) and `user` (own agents).
- MySQL tables all start with `intelligence_os_` (`src/lib/db/mysql.js`, `table("users")`).
- Login is on only when the database and Google are configured; otherwise one local admin (dev).
- Background runs have no request: the AI usage log takes the run owner's id instead.

## Security

- Secrets only in server env vars; redacted from logs and responses.
- Every tool input validated; per-agent tool allow-list.
- SSRF guard: host allowlist, DNS-resolved IP checks, redirect re-checks.
- Tool output wrapped as untrusted data (prompt-injection defence).
- Limits: max steps, run timeout, per-tool timeout, response size, cost cap.
- Approval required for sensitive actions; runs pause and resume.

## Agent storage (Milestone 4)

`src/lib/agents/agentRepo.js` is the only code that touches stored agents (`agents.json`).
A record is `{ id, ownerId, status, createdAt, updatedAt, createdBy, updatedBy, config }`,
where `config` is the normalised agent config. Routes and pages call the repository only,
so moving to MySQL replaces one file. Visibility: owners see their own agents, admins see
all (today every request is the local admin — see `src/lib/context.js`).

Writes go through `updateJson`, a per-file lock + atomic rename. A file that exists but
can't be parsed is never overwritten (503) so its data can be recovered.

Approvals: `permissions.toolsRequiringApproval` is computed from tool risk; the employee
can only opt OUT for write/send tools via `permissions.preApproved`. Destructive tools
always ask. The model never sees these as editable — refine keeps them.

## Execution engine (Milestone 5)

`POST /api/agents/[id]/runs` creates a run (status `queued`) and `after()` starts
`executeRun` in the same server process. The loop (`src/lib/engine/runner.js`):

1. System prompt = agent instructions + plan + tool list + safety rules (`engine/prompt.js`).
2. Call the model with the agent's **executable** tools (`tools/registry.js`).
3. A tool call is checked (part of the plan? connected? arguments valid?) and then:
   simulated (test run + external effect) · paused for approval (`waiting_approval`) · executed.
4. The result goes back as `<tool_result untrusted="true">…`. Repeat until the model replies
   without a tool call (→ `succeeded`), or a limit / error / cancel ends the run.

Approve/reject (`POST /api/runs/[id]/approval`) records the decision, sets the run back to
`queued` and resumes it. A run is stored as `run_<id>.json` + a summary in `runs-index.json`;
events also go to `run-events.jsonl` (Execution Logs). Runs whose heartbeat is older than
3 minutes while not executing in this process are marked *interrupted*.

Vercel: `after()` is limited to the route's `maxDuration` (300 s), so long runs need the
always-on server. New connectors register executors in `tools/registry.js`.

## Prototype persistence limits (no database)

Data lives in JSON files under `DATA_DIR`:

- Survives restarts, but in-flight runs are marked **interrupted**.
- Schedules missed while the server was down are **not** back-filled.
- **Single server instance only** — two instances would double-run schedules.
- If the disk is ephemeral or wiped, data is lost.

**Vercel (current deployment):** the filesystem is read-only except `/tmp`, so data is
written to `/tmp/atlas-data` and **resets whenever Vercel recycles the instance**; each
instance has its own copy. The app shows a warning on Model Settings and API Usage. Set
`OPENAI_DEFAULT_MODEL` / `OPENAI_PLANNER_MODEL` as Vercel env vars for durable model choices.
Storage failures never break AI calls (usage logging is best-effort; reads fall back to defaults).
Scheduled agents (Milestone 9) need either an always-on server or Vercel Cron + a database.

Recommended for production: an always-on Node.js server (`next start` under PM2/Docker).
The app has no login yet: **host it on the internal network / VPN only.**

## Future-ready seams

- `lib/storage/*` repositories → swap JSON for MySQL without touching the engine.
- Every call carries an `actor` (today a fixed local user) → ownership & roles later.
- `getCredential(connectorId, actor)` → env vars today, per-employee encrypted creds later.
- `ModelProvider` interface → Anthropic, Gemini, OpenRouter, local models later.
