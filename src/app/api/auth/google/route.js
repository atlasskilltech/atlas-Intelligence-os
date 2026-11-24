import { NextResponse } from "next/server";
import { STATE_COOKIE, buildAuthUrl, cookieOptions } from "@/lib/auth/google";
import { isAuthEnabled } from "@/lib/config/env";

/** GET /api/auth/google?next=/agents → redirect to Google's account chooser. */
export async function GET(request) {
  if (!isAuthEnabled()) return NextResponse.redirect(new URL("/login?error=not_configured", request.url));
  const { url, cookie } = buildAuthUrl(request, new URL(request.url).searchParams.get("next"));
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, cookie, cookieOptions(request, 600));
  return res;
}
