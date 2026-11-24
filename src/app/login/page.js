import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Logo } from "@/components/layout/Sidebar";
import { Alert } from "@/components/ui/States";
import { getAppUrl, getDbConfig, getGoogleAuth, isAuthEnabled } from "@/lib/config/env";
import { currentActor } from "@/lib/context";
import { dbStatus } from "@/lib/db/mysql";

export const metadata = { title: "Sign in" };

const ERRORS = {
  not_allowed: "Your account has not been added yet. Ask an IntelligenceOS admin to add your email on the Users page.",
  cancelled: "Sign-in was cancelled.",
  expired: "The sign-in took too long or was opened in another tab. Please try again.",
  unverified: "Your Google email address is not verified.",
  database: "Signed in with Google, but the database could not be reached. Try again or contact the admin.",
  redirect_uri_mismatch: "Google refused the sign-in address. The admin must add the redirect URL shown below in Google Cloud Console.",
  invalid_client: "Google rejected this app's client ID or secret. The admin must check the Google credentials on the server.",
  google_failed: "Google sign-in failed. Please try again.",
  not_configured: "Sign-in is not set up on the server yet.",
};

async function origin() {
  const configured = getAppUrl();
  if (configured) return new URL(configured).origin;
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

export default async function LoginPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const enabled = isAuthEnabled();
  if (enabled && (await currentActor().catch(() => null))) redirect(typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/");

  const error = ERRORS[sp.error];
  const callback = `${await origin()}/api/auth/google/callback`;
  const db = enabled ? await dbStatus() : null;
  const next = typeof sp.next === "string" ? sp.next : "";

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo onDark={false} className="h-11" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-surface p-7 shadow-sm">
          <h1 className="text-xl font-extrabold text-brand-600">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your ATLAS Google account.</p>

          {sp.reason === "signed_out" && !error && (
            <Alert tone="info" className="mt-5">
              You are signed out.
            </Alert>
          )}
          {error && (
            <Alert tone="error" className="mt-5">
              {error}
            </Alert>
          )}
          {db && !db.connected && (
            <Alert tone="error" className="mt-5" title="Database not reachable">
              {db.error}. Sign-in will fail until this is fixed.
            </Alert>
          )}

          {enabled ? (
            <a
              href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-surface text-sm font-semibold text-ink shadow-xs transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Sign in with Google
            </a>
          ) : (
            <Alert tone="warning" className="mt-6" title="Sign-in is not set up">
              The server needs {!getDbConfig() && "database settings"}
              {!getDbConfig() && !getGoogleAuth() && " and "}
              {!getGoogleAuth() && "Google sign-in settings (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)"}. Until then the app runs
              without login.{" "}
              <Link href="/" className="font-medium underline">
                Open the app
              </Link>
            </Alert>
          )}
        </div>
        {(sp.error === "redirect_uri_mismatch" || !enabled) && (
          <p className="mt-4 text-center text-xs break-all text-slate-500">
            Google redirect URL for this server: <code className="font-mono">{callback}</code>
          </p>
        )}
        <p className="mt-6 text-center text-xs text-slate-400">ATLAS IntelligenceOS · for ATLAS SkillTech University staff</p>
      </div>
    </main>
  );
}
