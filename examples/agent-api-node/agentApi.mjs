/**
 * Reference "ATLAS Agent API" add-on (docs/AGENT_API_SPEC.md), in plain Node.js — no dependencies.
 * It shows what a project (CRM, ERP, LMS…) adds so IntelligenceOS can connect with a key:
 *
 *   1. Keys: created by the project's admin with chosen permissions (scopes); only a SHA-256 hash is stored.
 *   2. GET  /manifest      → the actions THIS key may use (nothing else is listed).
 *   3. One URL per action → every request re-checks the key and its scope (403 if not allowed).
 *   4. A request log       → who called what, from which agent/run.
 *
 * Port it to the project's own stack (CodeIgniter, Laravel, Next.js…) — the HTTP contract is what matters.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";

export const SPEC = "atlas-agent-api/1";
const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Permissions a project admin can tick when creating a key. */
export const SCOPES = {
  "leads.read": "Read leads",
  "followups.read": "Read follow-ups",
  "reports.read": "Read lead reports",
  "leads.write": "Add notes and change lead status",
};
export const PRESETS = {
  read_only: ["leads.read", "followups.read", "reports.read"],
  read_write: Object.keys(SCOPES),
};

/** Creates a key. Show `key` to the admin ONCE; store only `record`. */
export function createKey({ name, scopes, expiresAt = null }) {
  const key = `atl_${randomBytes(24).toString("base64url")}`;
  return { key, record: { name, scopes: [...scopes], hash: sha256(key), expiresAt, revoked: false, lastUsedAt: null } };
}

// ---- Demo data (a real project uses its own models / database) ---------------------------------
const demoData = () => ({
  leads: [
    { id: "L101", name: "Asha Rao", status: "new", source: "Website", programme: "B.Des", counsellor: "Neha", createdAt: "2026-11-23" },
    { id: "L102", name: "Ravi Mehta", status: "contacted", source: "Instagram", programme: "BBA", counsellor: "Arjun", createdAt: "2026-11-22" },
    { id: "L103", name: "Sara Khan", status: "new", source: "Website", programme: "B.Tech", counsellor: "Neha", createdAt: "2026-11-24" },
  ],
  followups: [
    { leadId: "L102", due: "2026-11-23", status: "overdue", counsellor: "Arjun" },
    { leadId: "L101", due: "2026-11-25", status: "due", counsellor: "Neha" },
  ],
  notes: [],
});

/** Actions the project offers. Each needs one scope. */
const ACTIONS = [
  {
    id: "search_leads", name: "Search leads", method: "GET", path: "/leads", risk: "read", scope: "leads.read",
    description: "Leads filtered by status, source or counsellor, newest first.",
    params: [
      { name: "status", in: "query", type: "string", enum: ["new", "contacted", "won", "lost"], description: "Lead status" },
      { name: "source", in: "query", type: "string", description: "e.g. Website" },
      { name: "counsellor", in: "query", type: "string" },
      { name: "limit", in: "query", type: "integer", description: "Max rows (default 50)" },
    ],
    run: (db, { query }) => {
      const rows = db.leads.filter((l) => (!query.status || l.status === query.status) && (!query.source || l.source === query.source) && (!query.counsellor || l.counsellor === query.counsellor));
      return { total: rows.length, leads: rows.slice(0, Math.min(Number(query.limit) || 50, 200)) };
    },
  },
  {
    id: "get_lead", name: "Get lead", method: "GET", path: "/leads/{id}", risk: "read", scope: "leads.read",
    description: "One lead with its notes.",
    params: [{ name: "id", in: "path", type: "string", required: true, description: "Lead id, e.g. L101" }],
    run: (db, { path }) => {
      const lead = db.leads.find((l) => l.id === path.id);
      return lead ? { ...lead, notes: db.notes.filter((n) => n.leadId === lead.id) } : { status: 404, error: "Lead not found" };
    },
  },
  {
    id: "list_followups", name: "List follow-ups", method: "GET", path: "/followups", risk: "read", scope: "followups.read",
    description: "Follow-ups by status.",
    params: [{ name: "status", in: "query", type: "string", enum: ["due", "overdue", "completed"] }],
    run: (db, { query }) => ({ followups: db.followups.filter((f) => !query.status || f.status === query.status) }),
  },
  {
    id: "lead_report", name: "Lead report", method: "GET", path: "/reports/leads", risk: "read", scope: "reports.read",
    description: "Lead counts by status and by source.",
    params: [],
    run: (db) => {
      const count = (k) => db.leads.reduce((m, l) => ({ ...m, [l[k]]: (m[l[k]] || 0) + 1 }), {});
      return { total: db.leads.length, byStatus: count("status"), bySource: count("source") };
    },
  },
  {
    id: "add_lead_note", name: "Add lead note", method: "POST", path: "/leads/{id}/notes", risk: "write", scope: "leads.write",
    description: "Adds a note to a lead.",
    params: [
      { name: "id", in: "path", type: "string", required: true },
      { name: "note", in: "body", type: "string", required: true, description: "Note text" },
    ],
    run: (db, { path, body, agent }) => {
      if (!db.leads.some((l) => l.id === path.id)) return { status: 404, error: "Lead not found" };
      const n = { leadId: path.id, note: String(body.note || "").slice(0, 2000), by: `IntelligenceOS${agent ? ` (${agent})` : ""}`, at: new Date().toISOString() };
      db.notes.push(n);
      return { status: 201, saved: true, note: n };
    },
  },
  {
    id: "update_lead_status", name: "Update lead status", method: "POST", path: "/leads/{id}/status", risk: "write", scope: "leads.write",
    description: "Changes a lead's status.",
    params: [
      { name: "id", in: "path", type: "string", required: true },
      { name: "status", in: "body", type: "string", required: true, enum: ["new", "contacted", "won", "lost"] },
    ],
    run: (db, { path, body }) => {
      const lead = db.leads.find((l) => l.id === path.id);
      if (!lead) return { status: 404, error: "Lead not found" };
      if (!["new", "contacted", "won", "lost"].includes(body.status)) return { status: 400, error: "Invalid status" };
      lead.status = body.status;
      return { updated: true, lead };
    },
  },
];

const accessLabel = (scopes) =>
  scopes.every((s) => s.endsWith(".read")) ? "Read only" : scopes.length === Object.keys(SCOPES).length ? "Read and write" : "Custom";

/**
 * createAgentApi({ projectName, keys: [record], basePath }) → { server, keys, log, db }
 * keys: records from createKey(); revoke a key with `record.revoked = true`.
 */
export function createAgentApi({ projectName = "ATLAS CRM (demo)", keys = [], basePath = "/agent-api", data = demoData() } = {}) {
  const log = [];
  const findKey = (req) => {
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || "");
    if (!m) return null;
    const h = Buffer.from(sha256(m[1]));
    return keys.find((k) => !k.revoked && (!k.expiresAt || Date.parse(k.expiresAt) > Date.now()) && timingSafeEqual(Buffer.from(k.hash), h)) || null;
  };
  const send = (res, status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  };

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith(basePath)) return send(res, 404, { error: "Not found" });
      const path = url.pathname.slice(basePath.length) || "/";
      const key = findKey(req);
      if (!key) return send(res, 401, { error: "Invalid, expired or revoked key" });
      key.lastUsedAt = new Date().toISOString();
      const agent = req.headers["x-intelligenceos-agent"] || null;
      const entry = { at: key.lastUsedAt, key: key.name, method: req.method, path, agent, run: req.headers["x-intelligenceos-run"] || null };
      log.push(entry);

      if (req.method === "GET" && path === "/manifest") {
        return send(res, 200, {
          spec: SPEC,
          project: { name: projectName, version: "1.0" },
          key: { name: key.name, access: accessLabel(key.scopes), expiresAt: key.expiresAt },
          actions: ACTIONS.filter((a) => key.scopes.includes(a.scope)).map(({ run, scope, ...a }) => a),
        });
      }

      for (const a of ACTIONS) {
        if (a.method !== req.method) continue;
        const re = new RegExp(`^${a.path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
        const m = re.exec(path);
        if (!m) continue;
        if (!key.scopes.includes(a.scope)) return send(res, 403, { error: `This key does not allow ${a.id}` });
        let body = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return send(res, 400, { error: "Body must be JSON" });
        }
        const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        const query = Object.fromEntries(url.searchParams);
        const out = a.run(data, { path: params, query, body, agent });
        entry.action = a.id;
        const { status = 200, ...rest } = out;
        return send(res, status, rest);
      }
      send(res, 404, { error: "Unknown action" });
    });
  });
  return { server, keys, log, db: data };
}
