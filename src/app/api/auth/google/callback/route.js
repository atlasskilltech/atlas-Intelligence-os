import { NextResponse } from "next/server";
import { STATE_COOKIE, appOrigin, cookieOptions, finishSignIn, safeNext } from "@/lib/auth/google";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/auth/token";
import { isAuthEnabled } from "@/lib/config/env";
import { UserError, signInWithGoogle } from "@/lib/users/userRepo";

/** Google sends the user back here with ?code&state. */
export async function GET(request) {
  const origin = appOrigin(request);
  const fail = (error) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  if (!isAuthEnabled()) return fail("not_configured");

  const params = new URL(request.url).searchParams;
  if (params.get("error")) return fail("cancelled");
  const [state, next] = String(request.cookies.get(STATE_COOKIE)?.value || "").split("|");
  if (!state || state !== params.get("state") || !params.get("code")) return fail("expired");

  try {
    const profile = await finishSignIn(request, params.get("code"));
    const user = await signInWithGoogle(profile);
    const res = NextResponse.redirect(new URL(safeNext(next), origin));
    res.cookies.set(SESSION_COOKIE, signSession({ uid: user.id }), cookieOptions(request, SESSION_DAYS * 86_400));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof UserError && err.status === 403) return fail("not_allowed");
    if (err?.type === "database") return fail("database");
    console.error("[auth] sign-in failed:", err?.message);
    return fail(err?.reason || "google_failed");
  }
}
