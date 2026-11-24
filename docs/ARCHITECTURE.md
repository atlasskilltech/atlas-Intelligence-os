# ATLAS IntelligenceOS — Architecture

Internal AI Agent Builder for ATLAS SkillTech University employees.
Employees describe a task in plain language; the platform turns it into an
agent with a reviewable plan, then runs it with approved tools.

## Stack

- Next.js 16 (App Router), **JavaScript only**, React 19
- Tailwind CSS v4 (all styling; design tokens in `src/app/globals.css`)
- Server-side API routes for all AI and connector work
- No database / auth in the prototype (see "Future-ready seams")

> This Next.js version differs from older ones. Check `node_modules/next/dist/docs/`
> before using an API. Notably: `middleware` is now `proxy.js`; `instrumentation.js`
> `register()` runs once at server start (used for the scheduler).

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

## Connectors

Each connector is a module built with `defineConnector()` declaring: id, name,
description, auth (env var names), allowed hosts, and actions. Each action has a
description, a zod input schema, a risk level (`read | write | send | destructive`)
and a `run()` function. The engine converts actions into model tool definitions.

ATLAS internal apps are connected in this order of preference:

1. Existing REST API → declarative REST connector.
2. No API but ATLAS owns the code → add a small "Agent API" controller
   (e.g. CodeIgniter 3) exposing only approved endpoints, protected by API key,
   IP allowlist and a least-privilege DB user. Template provided in Milestone 7.
3. Public website → read-only Website connector.
4. Browser automation (Playwright) → last resort, read-only, post-Milestone 11.

Agents never get raw database, shell or arbitrary code access.

## Security

- Secrets only in server env vars; redacted from logs and responses.
- Every tool input validated; per-agent tool allow-list.
- SSRF guard: host allowlist, DNS-resolved IP checks, redirect re-checks.
- Tool output wrapped as untrusted data (prompt-injection defence).
- Limits: max steps, run timeout, per-tool timeout, response size, cost cap.
- Approval required for sensitive actions; runs pause and resume.

## Prototype persistence limits (no database)

Data lives in JSON files under `DATA_DIR`:

- Survives restarts, but in-flight runs are marked **interrupted**.
- Schedules missed while the server was down are **not** back-filled.
- **Single server instance only** — two instances would double-run schedules.
- If the disk is ephemeral or wiped, data is lost.

Requires an always-on Node.js server (`next start` under PM2/Docker), not serverless.
The app has no login yet: **host it on the internal network / VPN only.**

## Future-ready seams

- `lib/storage/*` repositories → swap JSON for MySQL without touching the engine.
- Every call carries an `actor` (today a fixed local user) → ownership & roles later.
- `getCredential(connectorId, actor)` → env vars today, per-employee encrypted creds later.
- `ModelProvider` interface → Anthropic, Gemini, OpenRouter, local models later.
