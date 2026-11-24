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
- [ATLAS Agent API spec](docs/AGENT_API_SPEC.md) — how other ATLAS projects connect with a key

## Sign-in (Google) and users

Login is required once the database and Google settings are present in the server's `.env`:

1. Database: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (or `DATABASE_URL`). Tables are created
   automatically and all start with `intelligence_os_`.
2. Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL` (the public address of the app).
3. In Google Cloud Console → Credentials → the same OAuth client, add the redirect URI
   `<APP_URL>/api/auth/google/callback` and the JavaScript origin `<APP_URL>`.
4. `CONNECTOR_ENCRYPTION_KEY` (from `openssl rand -base64 32`) — encrypts project keys and signs logins.
5. Restart: `pm2 restart atlas-Intelligence-os --update-env`.

The first person to sign in becomes admin (or set `ADMIN_EMAILS`). Admins add other users on the
**Users** page; only added emails can sign in. Roles: **admin** and **user**.

## Deploying on Vercel

Set `OPENAI_API_KEY` (and optionally `OPENAI_DEFAULT_MODEL`, `OPENAI_PLANNER_MODEL`) in the
Vercel project's environment variables. Agents, runs and settings are still stored in files, so on
Vercel they are temporary (see docs/ARCHITECTURE.md). The always-on EC2 server is recommended.
