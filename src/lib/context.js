import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isAuthEnabled } from "./config/env.js";
import { SESSION_COOKIE, verifySession } from "./auth/token.js";
import { getUserById } from "./users/userRepo.js";

/**
 * The "actor" performing an action.
 *
 * - Login on (database + Google configured): the signed-in user, re-read from the
 *   database on every request, so role changes and deletions apply immediately.
 * - Login off (local development / not configured yet): one local admin, as before.
 */

export const LOCAL_ACTOR = Object.freeze({ id: "local-user", uid: null, name: "ATLAS Employee", email: "", role: "admin", local: true });

export class AuthError extends Error {
  constructor(message = "Please sign in again.") {
    super(message);
    this.publicMessage = message;
    this.status = 401;
    this.type = "unauthenticated";
  }
}

/** Returns the signed-in actor or null (never throws for a missing login). */
export const currentActor = cache(async () => {
  if (!isAuthEnabled()) return LOCAL_ACTOR;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;
  const user = await getUserById(session.uid);
  if (!user) return null;
  return { id: `u_${user.id}`, uid: user.id, name: user.name || user.email, email: user.email, picture: user.picture, role: user.role, local: false };
});

/** For route handlers: the actor, or AuthError (→ 401). */
export async function getActor() {
  const actor = await currentActor();
  if (!actor) throw new AuthError();
  return actor;
}

/** For pages: the actor, or a redirect to the login page. */
export async function getPageActor() {
  const actor = await currentActor();
  if (!actor) redirect("/login?reason=signed_out");
  return actor;
}
