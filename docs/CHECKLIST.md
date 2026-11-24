# Implementation Checklist

Status: ✅ done · 🔄 in progress · ⬜ not started

| # | Milestone | Status |
|---|---|---|
| 1 | Project foundation (JS, Tailwind, dashboard shell) | ✅ |
| 2 | OpenAI integration & provider abstraction | ✅ |
| 2.1 | UI redesign (ChatGPT/Claude layout, CRM palette) + Vercel storage fix | ✅ |
| 3 | Prompt-to-Agent Builder | ⬜ |
| 4 | Agent config, storage, plans & approval workflow | ⬜ |
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
