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

/** Hostnames (lower-case) that may resolve to private/internal addresses, from INTERNAL_ALLOWED_HOSTS. */
export function getInternalAllowedHosts() {
  return String(process.env.INTERNAL_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

/**
 * Master key for encrypting secrets saved through the UI (project keys, Milestone 7).
 * Generate once with: openssl rand -base64 32
 */
export function getEncryptionKey() {
  return clean(process.env.CONNECTOR_ENCRYPTION_KEY);
}

/** Secrets that only exist at run time (e.g. decrypted project keys) — redacted like env secrets. */
const runtimeSecrets = new Set();
export function registerSecret(value) {
  if (typeof value === "string" && value.length >= 8) runtimeSecrets.add(value);
}

/** Values that must never appear in logs or responses. */
export function getSecretValues() {
  return [getOpenAIKey(), getEncryptionKey(), ...runtimeSecrets].filter(Boolean);
}
