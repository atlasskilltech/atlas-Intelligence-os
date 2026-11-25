# ATLAS Agent API — v1.1 (`atlas-agent-api/1`)

How any ATLAS project (CRM, ERP, LMS…), **in any language or framework**, lets IntelligenceOS
agents use it with a key. A working reference is in `examples/agent-api-node/`
(`node examples/agent-api-node/server.mjs`).

## In short

1. The project's admin creates a **key for IntelligenceOS** and ticks what it may do.
2. In IntelligenceOS → **Connectors → Connect project**, the admin enters the project name,
   the Agent API URL and the key.
3. IntelligenceOS calls `GET <url>/manifest`. The project answers with **only the actions this key
   allows**. They appear on the project's card ("View access").
4. Agents call those actions. Every request carries the key; the project checks it **every time**.

## 1. Keys (inside the project)

| Rule | Why |
|---|---|
| Random, at least 32 characters, e.g. `atl_` + 24 random bytes (base64url) | Can't be guessed |
| Show it **once**; store only `sha256(key)` | A database leak doesn't leak keys |
| Each key has a name and **scopes** (checkboxes), e.g. `leads.read`, `leads.write` | Least privilege |
| Offer presets: **Read only** (default), **Read + write** | Simple for admins |
| **Never** give keys delete, password, payment or bulk-export rights | Too dangerous for agents |
| Optional: expiry date, allowed IPs (the IntelligenceOS server), revoke button | Control |
| Show "last used" | Spot unused keys |

## 2. Requests

- Base URL: anything, e.g. `https://crm.atlasuniversity.edu.in/agent-api`. HTTPS required
  (plain HTTP only for internal hosts the IntelligenceOS admin allows).
- Every request: `Authorization: Bearer <key>`.
- IntelligenceOS also sends `X-IntelligenceOS-Agent` (agent name) and `X-IntelligenceOS-Run` (run id).
  Log them with each request.
- Responses are JSON. Errors: `{ "error": "message" }` with a proper status.

| Status | Meaning |
|---|---|
| 200 / 201 | OK |
| 400 | Bad parameters (message explains) |
| 401 | Key missing, wrong, expired or revoked |
| 403 | Key is valid but not allowed to do this action |
| 404 | Unknown action or record |
| 429 | Too many requests |

## 2a. Acting as the user (v1.1, optional)

For projects with their own users and permissions (e.g. Procurement), the IntelligenceOS admin ticks
**"This project acts as the signed-in user"** when connecting. IntelligenceOS then sends one more
header on every request:

```
X-IntelligenceOS-User: <email of the agent's OWNER>
```

- On action calls and on the per-user manifest. For scheduled/background runs it is still the agent's
  owner, never the person who pressed Run.
- `GET /manifest` **without** the header (the admin connecting) → everything the key allows.
  **With** the header → only what that user may do (key scopes ∩ the user's own permissions).
  IntelligenceOS caches a user's manifest for 10 minutes and shows the planner only those actions.
- Unknown, inactive or not-permitted user → `403 { "error": "plain-language reason" }`. IntelligenceOS
  shows that reason to the user and does **not** mark the project as broken. `401` still means the key
  itself is bad (the project is then marked "Needs attention").
- Match users by email, case-insensitively. Emails must be the same in both apps.
- Security: the key lets its holder name any user, so keep it in IntelligenceOS only, restrict it by
  IP (the IntelligenceOS server), give it an expiry and revoke it if in doubt. Signing the header with
  the same key would not add protection, because whoever has the key could sign too.

### Links that finish the work in the project

A write action may prepare something for a person to finish in the project instead of doing it
directly. Return one of these (at the top level or nested up to 3 levels):

| Field | Meaning | Shown in IntelligenceOS as |
|---|---|---|
| `draft_url` | A draft the person checks and submits | "Open draft in <project>" |
| `confirm_url` | An action the person confirms | "Confirm in <project>" |

Only `https` links on the project's own host are shown (anything else is ignored). The owner also
gets a dashboard notification. Short-lived confirm links are fine; the run page says they expire.

## 3. `GET /manifest`

```json
{
  "spec": "atlas-agent-api/1",
  "project": { "name": "ATLAS CRM", "version": "1.0" },
  "key": { "name": "IntelligenceOS (read only)", "access": "Read only", "expiresAt": null },
  "actions": [
    {
      "id": "search_leads",
      "name": "Search leads",
      "description": "Leads filtered by status or source, newest first.",
      "method": "GET",
      "path": "/leads",
      "risk": "read",
      "params": [
        { "name": "status", "in": "query", "type": "string", "enum": ["new", "contacted", "won", "lost"] },
        { "name": "limit", "in": "query", "type": "integer", "description": "Max rows" }
      ]
    },
    {
      "id": "add_lead_note",
      "name": "Add lead note",
      "description": "Adds a note to a lead.",
      "method": "POST",
      "path": "/leads/{id}/notes",
      "risk": "write",
      "params": [
        { "name": "id", "in": "path", "type": "string", "required": true },
        { "name": "note", "in": "body", "type": "string", "required": true }
      ]
    }
  ]
}
```

- List **only** the actions the calling key's scopes allow.
- `id`: lower-case letters, digits, `_`. `path`: relative to the base URL; `{name}` = path parameter.
- `method`: `GET` for reading, `POST` for changes. `risk`: `read` or `write`.
- `params[].in`: `path`, `query` or `body` (POST only; sent as a JSON object).
  `type`: `string`, `number`, `integer`, `boolean`. Optional `required`, `enum`, `description`.
- Descriptions matter: the agent reads them to choose actions.

## 4. What IntelligenceOS enforces anyway

- Agents can call only actions in the manifest, with only the listed parameters (types and enums checked).
- `POST` actions are always treated as "write": the agent's owner must approve each one; test runs only simulate them.
- `destructive` actions are never imported.
- The key is stored encrypted, never shown again (only its last 4 characters) and never sent to the AI.
- If the project answers 401, the connection is marked "Needs attention" and agents stop using it.
- With "acts as the signed-in user" on, every call carries `X-IntelligenceOS-User`; a 403 is shown to
  that user only.

## 5. Checklist for a project team

- [ ] Keys table: `id, name, key_hash, scopes, expires_at, revoked, last_used_at, created_by`
- [ ] Log table: `at, key_id, action, agent, run_id, status`
- [ ] Admin page: create key (name, scope checkboxes / preset, expiry) → show once; revoke
- [ ] Middleware: hash the bearer key, find a non-revoked, non-expired key (constant-time compare), else 401
- [ ] `GET /manifest` filtered by scopes
- [ ] One handler per action: check scope (403), validate input (400), reuse the app's own models and rules
- [ ] Return only the fields agents need (no passwords, tokens, or full personal data unless required)
- [ ] Rate limit per key
