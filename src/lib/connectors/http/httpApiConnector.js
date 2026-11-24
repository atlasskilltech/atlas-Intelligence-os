import "server-only";
import { getConnectorSecret, getSecretValues } from "../../config/env.js";
import { redact } from "../../security/redact.js";
import { defineConnector } from "../defineConnector.js";
import { getConnection, listConnections, pathParams } from "./apiConnectionRepo.js";
import { safeFetch } from "./safeFetch.js";

/**
 * Custom REST API connector (catalog id `http_api`).
 *   http_api.get  → GET endpoints  (read: runs automatically)
 *   http_api.post → POST endpoints (write: needs approval, simulated in test runs)
 * The model chooses an API id + endpoint id registered by an administrator and
 * fills in parameters; it can never supply a URL, host, header or method.
 */

const MAX_PARAM_LENGTH = 500;
const MAX_BODY_BYTES = 50_000;
const RESULT_TEXT_MAX = 6_000;
const USER_AGENT = "ATLAS-IntelligenceOS/1.0 (agent connector)";

export class ToolInputError extends Error {}

const paramsSchema = {
  type: "object",
  description: "Values for the endpoint's {path} parameters and allowed query parameters, e.g. {\"id\": \"123\", \"page\": 2}.",
};

const parameters = (withBody) => ({
  type: "object",
  additionalProperties: false,
  required: ["api", "endpoint"],
  properties: {
    api: { type: "string", maxLength: 40, description: "API id, from the list of available APIs." },
    endpoint: { type: "string", maxLength: 40, description: "Endpoint id within that API." },
    params: paramsSchema,
    ...(withBody ? { body: { type: "object", description: "JSON body to send." } } : {}),
  },
});

/** Builds the final URL for an endpoint. Pure apart from the inputs; throws ToolInputError. */
export function buildUrl(connection, endpoint, params = {}) {
  if (params == null || typeof params !== "object" || Array.isArray(params)) throw new ToolInputError("params must be an object.");
  const allowed = new Set([...pathParams(endpoint.path), ...endpoint.queryParams]);
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) {
      throw new ToolInputError(
        `Unknown parameter "${k}". This endpoint accepts: ${[...allowed].join(", ") || "no parameters"}.`,
      );
    }
    if (!["string", "number", "boolean"].includes(typeof v)) throw new ToolInputError(`Parameter "${k}" must be text or a number.`);
    if (String(v).length > MAX_PARAM_LENGTH) throw new ToolInputError(`Parameter "${k}" is too long.`);
  }
  const path = endpoint.path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    const v = params[name];
    if (v == null || String(v).trim() === "") throw new ToolInputError(`Missing required path parameter "${name}".`);
    const s = String(v);
    if (s === "." || s === "..") throw new ToolInputError(`Invalid value for "${name}".`);
    return encodeURIComponent(s); // encodes "/" too, so a value can never change the path
  });
  const url = new URL(connection.baseUrl + path);
  for (const q of endpoint.queryParams) {
    if (params[q] != null && String(params[q]) !== "") url.searchParams.set(q, String(params[q]));
  }
  return url;
}

/** Auth headers from the connection's secret env var. Throws if the secret is missing. */
export function authHeaders(connection) {
  const a = connection.auth || { type: "none" };
  if (a.type === "none") return { headers: {}, sensitive: [] };
  const secret = getConnectorSecret(a.secretEnv);
  if (!secret) {
    throw new Error(`The API "${connection.name}" is not configured: the server env var ${a.secretEnv} is not set. Ask an administrator.`);
  }
  if (a.type === "bearer") return { headers: { Authorization: `Bearer ${secret}` }, sensitive: [] };
  if (a.type === "basic") return { headers: { Authorization: `Basic ${Buffer.from(secret).toString("base64")}` }, sensitive: [] };
  return { headers: { [a.headerName]: secret }, sensitive: [a.headerName] };
}

const clean = (s) => redact(String(s ?? ""), getSecretValues());
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}… [truncated]` : s);

/** Turns a response body into something compact for the model. */
export function parseBody(res) {
  const type = res.contentType.toLowerCase();
  if (!res.body) return null;
  if (type.includes("json") && !res.truncated) {
    try {
      return JSON.parse(res.body);
    } catch {
      /* fall through to text */
    }
  }
  let text = res.body;
  if (type.includes("html")) {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return clip(text, RESULT_TEXT_MAX);
}

/**
 * Calls one endpoint. Shared by the agent tools and the admin "Test endpoint" button.
 * Returns { status, ok, data, truncated, durationMs }; throws on network/guard/HTTP errors.
 */
export async function callEndpoint({ apiId, endpointId, method, params = {}, body, allowDisabled = false }) {
  const connection = await getConnection(apiId).catch(() => {
    throw new ToolInputError(`Unknown API "${apiId}". Use one of the APIs listed in the tool description.`);
  });
  if (!connection.enabled && !allowDisabled) throw new ToolInputError(`The API "${connection.name}" is disabled by an administrator.`);
  const endpoint = connection.endpoints.find((e) => e.id === endpointId);
  if (!endpoint) {
    throw new ToolInputError(`Unknown endpoint "${endpointId}" for ${apiId}. Available: ${connection.endpoints.map((e) => e.id).join(", ")}.`);
  }
  if (method && endpoint.method !== method) {
    throw new ToolInputError(`Endpoint "${endpointId}" is a ${endpoint.method} endpoint; use the http_api.${endpoint.method.toLowerCase()} tool.`);
  }

  const url = buildUrl(connection, endpoint, params);
  const auth = authHeaders(connection);
  const headers = { Accept: "application/json, text/plain;q=0.9, */*;q=0.5", "User-Agent": USER_AGENT, ...auth.headers };
  let payload;
  if (endpoint.method === "POST") {
    payload = JSON.stringify(body ?? {});
    if (Buffer.byteLength(payload) > MAX_BODY_BYTES) throw new ToolInputError(`The request body is larger than ${MAX_BODY_BYTES / 1000} KB.`);
    headers["Content-Type"] = "application/json";
  }

  const res = await safeFetch(url, { method: endpoint.method, headers, body: payload, sensitiveHeaders: auth.sensitive });
  const data = parseBody(res);
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data ?? "");
    const hint =
      res.status === 401 || res.status === 403
        ? " The API refused the credentials — an administrator should check the connection's secret."
        : res.status === 404
          ? " Check the parameters."
          : res.status === 429
            ? " The API is rate-limiting requests; try again later."
            : "";
    throw new Error(clean(`${connection.name} returned HTTP ${res.status}.${hint}${detail ? ` Response: ${clip(detail, 500)}` : ""}`));
  }
  return { status: res.status, ok, data: JSON.parse(clean(JSON.stringify(data))), truncated: res.truncated, durationMs: res.durationMs };
}

/** Text listing the enabled APIs/endpoints for one method — appended to the tool description. */
export async function describeApis(method) {
  const lines = [];
  for (const c of await listConnections()) {
    if (!c.enabled) continue;
    const eps = c.endpoints.filter((e) => e.method === method);
    if (!eps.length) continue;
    lines.push(`API "${c.id}" — ${c.name}${c.description ? `: ${c.description}` : ""}`);
    for (const e of eps) {
      const pp = pathParams(e.path);
      const params = [pp.length ? `path: ${pp.join(", ")} (required)` : "", e.queryParams.length ? `query: ${e.queryParams.join(", ")}` : ""]
        .filter(Boolean)
        .join("; ");
      lines.push(`  - endpoint "${e.id}": ${e.name}${e.description ? ` — ${e.description}` : ""}${params ? ` [params ${params}]` : ""}`);
    }
  }
  return lines.length ? `Available APIs:\n${lines.join("\n")}` : "";
}

async function hasEndpoints(method) {
  return (await listConnections()).some((c) => c.enabled && c.endpoints.some((e) => e.method === method));
}

const action = (method) => ({
  parameters: parameters(method === "POST"),
  isReady: () => hasEndpoints(method),
  describe: () => describeApis(method),
  async execute(args) {
    const r = await callEndpoint({ apiId: args.api, endpointId: args.endpoint, method, params: args.params || {}, body: args.body });
    return { status: r.status, data: r.data, ...(r.truncated ? { note: "The response was too large and was cut off." } : {}) };
  },
});

export const httpApiConnector = defineConnector({
  id: "http_api",
  actions: { get: action("GET"), post: action("POST") },
  async status() {
    const list = (await listConnections()).filter((c) => c.enabled);
    return list.length
      ? { ready: true, message: `${list.length} API${list.length === 1 ? "" : "s"} connected` }
      : { ready: false, message: "No APIs added yet" };
  },
});
