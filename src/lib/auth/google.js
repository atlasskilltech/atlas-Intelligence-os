import "server-only";
import { randomBytes } from "node:crypto";
import { getAppUrl, getGoogleAuth } from "../config/env.js";

/** Google sign-in (OAuth 2.0 authorization-code flow), no extra libraries. */

export const STATE_COOKIE = "ios_oauth_state";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/** Public origin of this app: APP_URL, else the request (honouring a reverse proxy). */
export function appOrigin(request) {
  const configured = getAppUrl();
  if (configured) return new URL(configured).origin;
  const h = request.headers;
  const proto = (h.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "")).split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || new URL(request.url).host).split(",")[0].trim();
  return `${proto}://${host}`;
}

export const redirectUri = (request) => `${appOrigin(request)}/api/auth/google/callback`;

/** Only same-site relative paths, so `next` can't send people to another website. */
export function safeNext(next) {
  const n = String(next || "/");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") && !n.startsWith("/api/auth") ? n.slice(0, 500) : "/";
}

export function buildAuthUrl(request, next) {
  const g = getGoogleAuth();
  const state = randomBytes(16).toString("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: `${state}|${safeNext(next)}` };
}

/** Exchanges the code and returns the verified Google profile. Throws Error with a plain message. */
export async function finishSignIn(request, code) {
  const g = getGoogleAuth();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirectUri(request), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    const reason = data.error === "redirect_uri_mismatch" ? "redirect_uri_mismatch" : data.error === "invalid_client" ? "invalid_client" : "google_failed";
    throw Object.assign(new Error(`Google sign-in failed (${data.error || res.status}).`), { reason });
  }
  // The ID token came straight from Google's token endpoint over TLS with our
  // client secret, so its claims can be trusted after these checks.
  const claims = JSON.parse(Buffer.from(String(data.id_token).split(".")[1] || "", "base64url").toString("utf8"));
  if (!ISSUERS.includes(claims.iss) || claims.aud !== g.clientId || !(claims.exp * 1000 > Date.now())) {
    throw Object.assign(new Error("Google returned an unexpected sign-in token."), { reason: "google_failed" });
  }
  if (!claims.email || claims.email_verified === false) throw Object.assign(new Error("Your Google email is not verified."), { reason: "unverified" });
  return { email: claims.email, name: claims.name || "", picture: claims.picture || "", sub: claims.sub || "" };
}

export const cookieOptions = (request, maxAge) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: appOrigin(request).startsWith("https://"),
  path: "/",
  maxAge,
});
