# ATLAS IntelligenceOS

Internal AI Agent Builder for ATLAS SkillTech University employees — describe a
task in plain language and get an AI agent that runs it with approved tools.

**Stack:** Next.js (App Router, JavaScript) · Tailwind CSS v4

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values as milestones need them
npm run dev
```

Open http://localhost:3000, then go to **Model Settings → Test connection** to verify your OpenAI key.

## Scripts

- `npm run dev` – development server
- `npm run build` / `npm run start` – production build and server
- `npm run lint` – ESLint
- `npm test` – unit tests (no API key or network needed)

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation checklist](docs/CHECKLIST.md)

## Deploying on Vercel

Set `OPENAI_API_KEY` (and optionally `OPENAI_DEFAULT_MODEL`, `OPENAI_PLANNER_MODEL`) in the
Vercel project's environment variables. Without a database, settings and usage history on
Vercel are temporary (see docs/ARCHITECTURE.md).

> Internal prototype: no login yet. Host only on the ATLAS internal network / VPN.
