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
    // Voice assistant: speech-to-text and text-to-speech models / voice.
    sttModel: clean(process.env.OPENAI_STT_MODEL) || "gpt-4o-transcribe",
    ttsModel: clean(process.env.OPENAI_TTS_MODEL) || "gpt-4o-mini-tts",
    ttsVoice: clean(process.env.OPENAI_TTS_VOICE) || "marin",
    // Realtime speech-to-speech (WebRTC). Empty = try the newest known models in order.
    realtimeModel: clean(process.env.OPENAI_REALTIME_MODEL),
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

/** First non-empty env var among the given names → { name, value } (the name is safe to show). */
function pick(...names) {
  for (const n of names) {
    const v = clean(process.env[n]);
    if (v) return { name: n, value: v };
  }
  return { name: null, value: undefined };
}

/**
 * MySQL connection (users etc.). Accepts common variable names so existing
 * server .env files work: DATABASE_URL / MYSQL_URL, or DB_HOST + DB_USER + …
 * Returns null when not configured. `names` lists which variables were used.
 */
export function getDbConfig() {
  const url = pick("DATABASE_URL", "MYSQL_URL");
  if (url.value && /^mysql:\/\//i.test(url.value)) {
    return { uri: url.value, ssl: /^(1|true|yes)$/i.test(process.env.DB_SSL || ""), names: [url.name] };
  }
  const host = pick("DB_HOST", "MYSQL_HOST", "DATABASE_HOST");
  const user = pick("DB_USER", "DB_USERNAME", "MYSQL_USER", "DATABASE_USER", "DATABASE_USERNAME");
  const password = pick("DB_PASSWORD", "DB_PASS", "MYSQL_PASSWORD", "DATABASE_PASSWORD");
  const database = pick("DB_NAME", "DB_DATABASE", "MYSQL_DATABASE", "DATABASE_NAME");
  const port = pick("DB_PORT", "MYSQL_PORT", "DATABASE_PORT");
  if (!host.value || !user.value || !database.value) return null;
  return {
    host: host.value,
    port: Number(port.value) || 3306,
    user: user.value,
    password: password.value || "",
    database: database.value,
    ssl: /^(1|true|yes)$/i.test(process.env.DB_SSL || ""),
    names: [host.name, user.name, password.name, database.name, port.name].filter(Boolean),
  };
}

/** Google sign-in (OAuth client). Null when not configured. */
export function getGoogleAuth() {
  const id = pick("GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID", "GOOGLE_OAUTH_CLIENT_ID");
  const secret = pick("GOOGLE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET");
  if (!id.value || !secret.value) return null;
  return { clientId: id.value, clientSecret: secret.value, names: [id.name, secret.name] };
}

/** Login is on when both the database and Google sign-in are configured. */
export function isAuthEnabled() {
  return Boolean(getDbConfig() && getGoogleAuth());
}

/** Public base URL (for the Google redirect). Optional: otherwise taken from the request. */
export function getAppUrl() {
  return pick("APP_URL", "NEXT_PUBLIC_APP_URL", "NEXTAUTH_URL").value?.replace(/\/+$/, "");
}

/** Emails that are always admins (comma-separated ADMIN_EMAILS). */
export function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Secret for signing login cookies: AUTH_SECRET (or SESSION_SECRET / NEXTAUTH_SECRET),
 * else derived from CONNECTOR_ENCRYPTION_KEY so no extra variable is required.
 */
export function getSessionSecret() {
  const own = pick("AUTH_SECRET", "SESSION_SECRET", "NEXTAUTH_SECRET").value;
  if (own) return own;
  const enc = getEncryptionKey();
  return enc ? `derived:session:${enc}` : undefined;
}

/** Secrets that only exist at run time (e.g. decrypted project keys) — redacted like env secrets. */
const runtimeSecrets = new Set();
export function registerSecret(value) {
  if (typeof value === "string" && value.length >= 8) runtimeSecrets.add(value);
}

/** Values that must never appear in logs or responses. */
export function getSecretValues() {
  return [
    getOpenAIKey(),
    getEncryptionKey(),
    getDbConfig()?.password,
    getGoogleAuth()?.clientSecret,
    pick("AUTH_SECRET", "SESSION_SECRET", "NEXTAUTH_SECRET").value,
    ...runtimeSecrets,
  ].filter(Boolean);
}
