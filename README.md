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

## Voice Assistant

Open **Voice Assistant** in the sidebar (or the **Voice** button on Home) for a ChatGPT-style voice
mode: tap the orb, speak in Hindi, English, Hinglish or any other language, and the assistant answers
out loud in the same language. It uses the same read-only connector lookups as Home. Needs only
`OPENAI_API_KEY`; optional `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`. Browsers only
allow the microphone on `https://` (or `localhost`).

## Emailing reports with Google Workspace

Agents can email their report to the agent owner's own inbox (`email.email_owner`). Configure it in
the server `.env` (see `.env.example`) and restart. Two ways with Google Workspace:

**A. One sending mailbox (simplest).** Use the default sender mailbox (e.g.
`tech@atlasuniversity.edu.in`) with 2-Step Verification on, and create an App Password for it at
<https://myaccount.google.com/apppasswords>.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=tech@atlasuniversity.edu.in
SMTP_PASS=<16-character App Password>
SMTP_FROM=tech@atlasuniversity.edu.in
```

Gmail always sends as the signed-in mailbox (or one of its "Send mail as" aliases), so a different
sender chosen on the **Email sender** page is replaced by `SMTP_USER`. Use option B if users need
their own sender.

**B. Workspace SMTP relay (per-user senders).** A Workspace admin turns on *Apps → Google Workspace →
Gmail → Routing → SMTP relay service*, allowing "only addresses in my domains", requiring TLS, and
either allowing the server's IP address or requiring SMTP authentication. Then:

```
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_USER=tech@atlasuniversity.edu.in   # only if the relay requires SMTP authentication
SMTP_PASS=<App Password>                # only if the relay requires SMTP authentication
SMTP_FROM=tech@atlasuniversity.edu.in
EMAIL_ALLOWED_FROM_DOMAINS=atlasuniversity.edu.in
```

Use **Settings → Email sender → Send test email** to check the setup.

## Scheduled agents

On the always-on server (EC2 + PM2) the scheduler starts automatically with `npm run start` and
checks every 30 seconds. Run **one** instance. Scheduled runs act as the agent's owner. On Vercel,
set `CRON_SECRET` and have a cron call `GET /api/scheduler/tick` with
`Authorization: Bearer <CRON_SECRET>`.

## Deploying on Vercel

Set `OPENAI_API_KEY` (and optionally `OPENAI_DEFAULT_MODEL`, `OPENAI_PLANNER_MODEL`) in the
Vercel project's environment variables. Agents, runs and settings are still stored in files, so on
Vercel they are temporary (see docs/ARCHITECTURE.md). The always-on EC2 server is recommended.
