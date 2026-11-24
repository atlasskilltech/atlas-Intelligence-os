import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed login cookie (no server-only import: the proxy uses this too).
 * Value: base64url(JSON {uid, exp}) + "." + HMAC-SHA256. The user and role are
 * re-read from the database on every request, so role changes and deletions
 * take effect immediately; the cookie only proves who signed in.
 */

export const SESSION_COOKIE = "ios_session";
export const SESSION_DAYS = 7;

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const first = (...names) => names.map((n) => clean(process.env[n])).find(Boolean);

export const DB_URL_VARS = ["DATABASE_URL", "MYSQL_URL"];
export const DB_HOST_VARS = ["DB_HOST", "MYSQL_HOST", "DATABASE_HOST"];
export const DB_USER_VARS = ["DB_USER", "DB_USERNAME", "MYSQL_USER", "DATABASE_USER", "DATABASE_USERNAME"];
export const DB_NAME_VARS = ["DB_NAME", "DB_DATABASE", "MYSQL_DATABASE", "DATABASE_NAME"];
export const GOOGLE_ID_VARS = ["GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID", "GOOGLE_OAUTH_CLIENT_ID"];
export const GOOGLE_SECRET_VARS = ["GOOGLE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"];
export const AUTH_SECRET_VARS = ["AUTH_SECRET", "SESSION_SECRET", "NEXTAUTH_SECRET"];

/** Same rule as env.isAuthEnabled(): database + Google sign-in configured. */
export function authConfigured() {
  const db = /^mysql:\/\//i.test(first(...DB_URL_VARS) || "") || Boolean(first(...DB_HOST_VARS) && first(...DB_USER_VARS) && first(...DB_NAME_VARS));
  return db && Boolean(first(...GOOGLE_ID_VARS) && first(...GOOGLE_SECRET_VARS));
}

export function sessionSecret() {
  const own = first(...AUTH_SECRET_VARS);
  if (own) return own;
  const enc = clean(process.env.CONNECTOR_ENCRYPTION_KEY);
  return enc ? `derived:session:${enc}` : undefined;
}

const b64 = (buf) => Buffer.from(buf).toString("base64url");
const mac = (data, secret) => createHmac("sha256", secret).update(data).digest("base64url");

export function signSession({ uid, days = SESSION_DAYS }, secret = sessionSecret()) {
  if (!secret) throw new Error("No session secret: set AUTH_SECRET or CONNECTOR_ENCRYPTION_KEY.");
  const body = b64(JSON.stringify({ uid, exp: Date.now() + days * 86_400_000 }));
  return `${body}.${mac(body, secret)}`;
}

/** Returns { uid, exp } for a valid, unexpired token, else null. */
export function verifySession(token, secret = sessionSecret(), now = Date.now()) {
  if (!secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Number.isInteger(data.uid) || typeof data.exp !== "number" || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}
