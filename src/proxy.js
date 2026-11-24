import { NextResponse } from "next/server";
import { SESSION_COOKIE, authConfigured, verifySession } from "@/lib/auth/token";

/**
 * Login gate (Next 16 "proxy", formerly middleware). When the database and
 * Google sign-in are configured, every page and API needs a valid login
 * cookie; otherwise the app runs open as a local prototype (as before).
 * The role is NOT decided here — routes re-check the user in the database.
 */

const PUBLIC = [/^\/login(\/|$)/, /^\/api\/auth\//];

export function proxy(request) {
  if (!authConfigured()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: { type: "unauthenticated", message: "Please sign in." } }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own files and static assets.
  matcher: ["/((?!_next/static|_next/image|brand/|icon.svg|favicon.ico).*)"],
};
