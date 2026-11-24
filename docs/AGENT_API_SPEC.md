# ATLAS Agent API — v1 (`atlas-agent-api/1`)

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

## 5. Checklist for a project team

- [ ] Keys table: `id, name, key_hash, scopes, expires_at, revoked, last_used_at, created_by`
- [ ] Log table: `at, key_id, action, agent, run_id, status`
- [ ] Admin page: create key (name, scope checkboxes / preset, expiry) → show once; revoke
- [ ] Middleware: hash the bearer key, find a non-revoked, non-expired key (constant-time compare), else 401
- [ ] `GET /manifest` filtered by scopes
- [ ] One handler per action: check scope (403), validate input (400), reuse the app's own models and rules
- [ ] Return only the fields agents need (no passwords, tokens, or full personal data unless required)
- [ ] Rate limit per key
