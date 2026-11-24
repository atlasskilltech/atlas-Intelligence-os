import "server-only";

/**
 * Central place for reading server environment variables.
 * Secrets are only returned by getOpenAIKey(), which only the provider calls.
 */
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function getOpenAIKey() {
  return clean(process.env.OPENAI_API_KEY);
}

export function getAIEnv() {
  return {
    openaiConfigured: Boolean(getOpenAIKey()),
    // Optional: an OpenAI-compatible endpoint (proxy, gateway). Leave empty for api.openai.com.
    openaiBaseURL: clean(process.env.OPENAI_BASE_URL),
    defaultModel: clean(process.env.OPENAI_DEFAULT_MODEL),
    plannerModel: clean(process.env.OPENAI_PLANNER_MODEL),
  };
}

/** True when running on Vercel (serverless; read-only filesystem except /tmp). */
export function isServerless() {
  return Boolean(process.env.VERCEL);
}

/**
 * Where JSON files are stored. On Vercel only /tmp is writable, and it is
 * wiped whenever the server instance is recycled — see getStorageInfo().
 */
export function getDataDir() {
  return clean(process.env.DATA_DIR) || (isServerless() ? "/tmp/atlas-data" : "./data");
}

export function getStorageInfo() {
  return { driver: "json-files", temporary: isServerless(), host: isServerless() ? "vercel" : "server" };
}

/**
 * Connector secrets (Milestone 6) live ONLY in env vars named CONNECTOR_SECRET_<NAME>.
 * A connection stores the variable's name, never its value. The prefix stops a
 * connection from being pointed at unrelated secrets (e.g. OPENAI_API_KEY).
 */
export const CONNECTOR_SECRET_PREFIX = "CONNECTOR_SECRET_";
export const CONNECTOR_SECRET_NAME_RE = /^CONNECTOR_SECRET_[A-Z0-9_]{1,60}$/;

export function getConnectorSecret(name) {
  if (!CONNECTOR_SECRET_NAME_RE.test(String(name || ""))) return undefined;
  return clean(process.env[name]);
}

/** Hostnames (lower-case) that may resolve to private/internal addresses, from INTERNAL_ALLOWED_HOSTS. */
export function getInternalAllowedHosts() {
  return String(process.env.INTERNAL_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

/** Values that must never appear in logs or responses. */
export function getSecretValues() {
  const connectorSecrets = Object.keys(process.env)
    .filter((k) => k.startsWith(CONNECTOR_SECRET_PREFIX))
    .map((k) => clean(process.env[k]));
  return [getOpenAIKey(), ...connectorSecrets].filter(Boolean);
}
