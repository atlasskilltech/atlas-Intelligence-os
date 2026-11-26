import "server-only";

/**
 * Central place for reading server environment variables.
 * Secrets are only returned by getOpenAIKey(), which only the provider calls.
 */
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function getOpenAIKey() {
  return clean(process.env.OPENAI_API_KEY);
}

/** ElevenLabs API key (optional; only used for the voice assistant's speech). */
export function getElevenLabsKey() {
  return clean(process.env.ELEVENLABS_API_KEY);
}

export function getAIEnv() {
  return {
    openaiConfigured: Boolean(getOpenAIKey()),
    // Optional: an OpenAI-compatible endpoint (proxy, gateway). Leave empty for api.openai.com.
    openaiBaseURL: clean(process.env.OPENAI_BASE_URL),
    defaultModel: clean(process.env.OPENAI_DEFAULT_MODEL),
    plannerModel: clean(process.env.OPENAI_PLANNER_MODEL),
    // Voice assistant: speech-to-text and text-to-speech models / voice.
    sttModel: clean(process.env.OPENAI_STT_MODEL) || "gpt-4o-mini-transcribe",
    ttsModel: clean(process.env.OPENAI_TTS_MODEL) || "gpt-4o-mini-tts",
    ttsVoice: clean(process.env.OPENAI_TTS_VOICE) || "nova",
    // Optional ElevenLabs text-to-speech (switch in Model Settings → Voice).
    elevenlabsConfigured: Boolean(getElevenLabsKey()),
    elevenlabsVoiceId: clean(process.env.ELEVENLABS_VOICE_ID) || "21m00Tcm4TlvDq8gL7JA",
    elevenlabsModel: clean(process.env.ELEVENLABS_MODEL) || "eleven_multilingual_v2",
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

/** Sender used when a user has not set their own (Email sender page). */
export const DEFAULT_SENDER_EMAIL = "tech@atlasuniversity.edu.in";

/**
 * Email for agents (email the agent's owner). Null when not configured.
 * Two ways, SMTP preferred when both are set:
 *   SMTP:     SMTP_HOST, SMTP_PORT (587 STARTTLS / 465 TLS), SMTP_USER, SMTP_PASS, optional SMTP_SECURE=true
 *             (SendGrid over SMTP: host smtp.sendgrid.net, user "apikey", pass = the API key)
 *   SendGrid: SENDGRID_API_KEY
 * `from` is the default sender: SMTP_FROM / SENDGRID_FROM_EMAIL / MAIL_FROM…, else tech@atlasuniversity.edu.in.
 * `allowedDomains`: domains users may pick their own sender from (EMAIL_ALLOWED_FROM_DOMAINS or
 * SENDGRID_ALLOWED_FROM_DOMAINS, comma-separated; default = the default sender's domain).
 */
export function getEmailConfig() {
  const host = pick("SMTP_HOST", "MAIL_HOST");
  const key = pick("SENDGRID_API_KEY", "SENDGRID_KEY");
  if (!host.value && !key.value) return null;
  const from = pick("SMTP_FROM", "SMTP_FROM_EMAIL", "SENDGRID_FROM_EMAIL", "SENDGRID_FROM", "SENDGRID_SENDER", "MAIL_FROM", "MAIL_FROM_ADDRESS", "EMAIL_FROM");
  const fromName = pick("SMTP_FROM_NAME", "SENDGRID_FROM_NAME", "MAIL_FROM_NAME", "EMAIL_FROM_NAME");
  const fromEmail = (from.value || DEFAULT_SENDER_EMAIL).toLowerCase();
  const allowed = String(process.env.EMAIL_ALLOWED_FROM_DOMAINS || process.env.SENDGRID_ALLOWED_FROM_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  const common = {
    from: fromEmail,
    fromName: fromName.value || "ATLAS IntelligenceOS",
    allowedDomains: allowed.length ? allowed : [fromEmail.split("@")[1]].filter(Boolean),
  };
  if (host.value) {
    const port = Number(pick("SMTP_PORT", "MAIL_PORT").value) || 587;
    const secureEnv = pick("SMTP_SECURE", "MAIL_SECURE", "SMTP_ENCRYPTION", "MAIL_ENCRYPTION").value;
    return {
      provider: "smtp",
      smtp: {
        host: host.value,
        port,
        secure: /^ssl$/i.test(secureEnv || "") || (secureEnv ? /^(1|true|yes)$/i.test(secureEnv) : port === 465),
        user: pick("SMTP_USER", "SMTP_USERNAME", "MAIL_USERNAME").value,
        pass: pick("SMTP_PASS", "SMTP_PASSWORD", "MAIL_PASSWORD").value,
      },
      ...common,
    };
  }
  return { provider: "sendgrid", apiKey: key.value, ...common };
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
    getElevenLabsKey(),
    getEmailConfig()?.apiKey,
    getEmailConfig()?.smtp?.pass,
    getEncryptionKey(),
    getDbConfig()?.password,
    getGoogleAuth()?.clientSecret,
    pick("AUTH_SECRET", "SESSION_SECRET", "NEXTAUTH_SECRET").value,
    ...runtimeSecrets,
  ].filter(Boolean);
}
