import "server-only";
import { z } from "zod";
import { CONNECTOR_SECRET_NAME_RE, getConnectorSecret } from "../../config/env.js";
import { NetworkBlocked, checkUrl } from "../../security/netGuard.js";
import { readJson, updateJson } from "../../storage/jsonFile.js";

/**
 * Custom REST API connections (Milestone 6), stored in `api-connections.json`.
 *
 * An administrator registers an API: base URL, authentication and an explicit
 * list of endpoints (method + path template + allowed query parameters).
 * Agents can call ONLY those endpoints — never arbitrary URLs. Secrets are not
 * stored: `auth.secretEnv` names a CONNECTOR_SECRET_* env var on the server.
 *
 * This file is the only code that touches stored connections (MySQL later).
 */

const FILE = "api-connections.json";
const EMPTY = { connections: [] };
export const MAX_CONNECTIONS = 50;
export const MAX_ENDPOINTS = 30;

export class ConnectionError extends Error {
  constructor(message, status = 400, fields) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.fields = fields;
    this.type = status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 409 ? "conflict" : "validation";
  }
}

const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]{0,39})\}/g;
const PATH_RE = /^\/[A-Za-z0-9\-._~/{}:@!$&'()*+,;=]*$/;
const PARAM_RE = /^[A-Za-z_][A-Za-z0-9_.\-[\]]{0,59}$/;
const HEADER_RE = /^[A-Za-z][A-Za-z0-9-]{0,59}$/;
const FORBIDDEN_HEADERS = ["host", "content-length", "connection", "transfer-encoding", "cookie"];

const trimmed = (max) => z.string().trim().max(max);

const endpointSchema = z.object({
  id: z.string().trim().regex(KEY_RE, "Use 2–40 lower-case letters, numbers or _ (start with a letter)."),
  name: trimmed(80).min(1, "Give the endpoint a name."),
  method: z.enum(["GET", "POST"]),
  path: z
    .string()
    .trim()
    .max(300)
    .regex(PATH_RE, "Path must start with / and contain only URL-safe characters, e.g. /students/{id}.")
    .refine((p) => !p.split("/").some((seg) => seg === ".." || seg === "."), "Path must not contain . or .. segments.")
    .refine((p) => !/[{}]/.test(p.replace(PLACEHOLDER_RE, "")), "Use {name} for path parameters."),
  description: trimmed(500).default(""),
  queryParams: z.array(z.string().trim().regex(PARAM_RE, "Invalid query parameter name.")).max(20).default([]),
});

const connectionSchema = z.object({
  id: z.string().trim().regex(KEY_RE, "Use 2–40 lower-case letters, numbers or _ (start with a letter), e.g. hr_portal."),
  name: trimmed(80).min(1, "Give the API a name."),
  description: trimmed(500).default(""),
  baseUrl: z.string().trim().max(300),
  enabled: z.boolean().default(true),
  auth: z
    .object({
      type: z.enum(["none", "bearer", "header", "basic"]).default("none"),
      headerName: z.string().trim().max(60).default(""),
      secretEnv: z.string().trim().max(80).default(""),
    })
    .default({ type: "none", headerName: "", secretEnv: "" }),
  endpoints: z.array(endpointSchema).min(1, "Add at least one endpoint.").max(MAX_ENDPOINTS),
});

/** Placeholders in a path template, e.g. "/a/{id}/b/{x}" → ["id", "x"]. */
export const pathParams = (path) => [...String(path).matchAll(PLACEHOLDER_RE)].map((m) => m[1]);

function fieldErrors(issues) {
  const fields = {};
  for (const i of issues) {
    const key = i.path.join(".");
    fields[key] ??= i.message;
  }
  return fields;
}

/** Validates and normalises admin input. Throws ConnectionError with `fields`. */
export function validateConnection(input) {
  const parsed = connectionSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error.issues);
    throw new ConnectionError(`Please fix: ${Object.values(fields)[0]}`, 400, fields);
  }
  const c = parsed.data;
  const fields = {};

  // Base URL: guarded, no query/fragment, no trailing slash.
  try {
    const url = checkUrl(c.baseUrl);
    if (url.search || url.hash) fields.baseUrl = "The base URL must not contain ? or #. Put query parameters on the endpoints.";
    c.baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch (err) {
    fields.baseUrl = err instanceof NetworkBlocked ? err.message : "Enter a full URL, e.g. https://api.example.com/v1";
  }

  // Auth.
  const a = c.auth;
  if (a.type === "none") {
    a.headerName = "";
    a.secretEnv = "";
  } else {
    if (!CONNECTOR_SECRET_NAME_RE.test(a.secretEnv)) {
      fields["auth.secretEnv"] = "Name of a server env var starting with CONNECTOR_SECRET_, e.g. CONNECTOR_SECRET_HR_PORTAL.";
    }
    if (a.type === "header") {
      if (!HEADER_RE.test(a.headerName) || FORBIDDEN_HEADERS.includes(a.headerName.toLowerCase())) {
        fields["auth.headerName"] = "Enter the header the API expects, e.g. X-API-Key.";
      }
    } else a.headerName = "";
  }

  // Endpoints: unique ids, unique param names.
  const seen = new Set();
  c.endpoints.forEach((e, i) => {
    if (seen.has(e.id)) fields[`endpoints.${i}.id`] = `Endpoint id "${e.id}" is used twice.`;
    seen.add(e.id);
    e.queryParams = [...new Set(e.queryParams.filter(Boolean))];
    const clash = pathParams(e.path).find((p) => e.queryParams.includes(p));
    if (clash) fields[`endpoints.${i}.queryParams`] = `"${clash}" is already a path parameter.`;
    if (new Set(pathParams(e.path)).size !== pathParams(e.path).length) fields[`endpoints.${i}.path`] = "Each path parameter may appear only once.";
  });

  if (Object.keys(fields).length) throw new ConnectionError(`Please fix: ${Object.values(fields)[0]}`, 400, fields);
  return c;
}

const requireAdmin = (actor) => {
  if (actor?.role !== "admin") throw new ConnectionError("Only administrators can change API connections.", 403);
};

/** Safe view for the browser and the model: no secret values, plus whether the secret is set. */
export function publicConnection(c) {
  return {
    ...c,
    auth: { ...c.auth },
    secretConfigured: c.auth.type === "none" ? true : Boolean(getConnectorSecret(c.auth.secretEnv)),
  };
}

async function readAll() {
  const data = await readJson(FILE, EMPTY);
  return Array.isArray(data?.connections) ? data.connections : [];
}

export async function listConnections() {
  return (await readAll()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getConnection(id) {
  const c = (await readAll()).find((x) => x.id === id);
  if (!c) throw new ConnectionError("API connection not found.", 404);
  return c;
}

export async function createConnection(actor, input) {
  requireAdmin(actor);
  const c = validateConnection(input);
  const now = new Date().toISOString();
  return updateJson(FILE, EMPTY, (data) => {
    const list = data?.connections || [];
    if (list.some((x) => x.id === c.id)) throw new ConnectionError(`An API with id "${c.id}" already exists.`, 409, { id: "This id is already used." });
    if (list.length >= MAX_CONNECTIONS) throw new ConnectionError(`At most ${MAX_CONNECTIONS} API connections are allowed.`, 409);
    const rec = { ...c, createdAt: now, updatedAt: now, createdBy: actor.id, updatedBy: actor.id };
    return { value: { connections: [...list, rec] }, result: rec };
  });
}

export async function updateConnection(actor, id, input) {
  requireAdmin(actor);
  const c = validateConnection({ ...input, id }); // the id is fixed: agents refer to it
  return updateJson(FILE, EMPTY, (data) => {
    const list = data?.connections || [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new ConnectionError("API connection not found.", 404);
    const rec = { ...list[i], ...c, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    const next = [...list];
    next[i] = rec;
    return { value: { connections: next }, result: rec };
  });
}

export async function deleteConnection(actor, id) {
  requireAdmin(actor);
  return updateJson(FILE, EMPTY, (data) => {
    const list = data?.connections || [];
    if (!list.some((x) => x.id === id)) throw new ConnectionError("API connection not found.", 404);
    return { value: { connections: list.filter((x) => x.id !== id) }, result: { deleted: true, id } };
  });
}
