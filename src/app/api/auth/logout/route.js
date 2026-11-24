import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/auth/google";
import { SESSION_COOKIE } from "@/lib/auth/token";

/** POST → clears the login cookie and goes to the login page. */
export async function POST(request) {
  const res = NextResponse.redirect(new URL("/login?reason=signed_out", appOrigin(request)), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
