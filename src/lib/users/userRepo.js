import "server-only";
import { getAdminEmails } from "../config/env.js";
import { query, table } from "../db/mysql.js";

/**
 * Users (MySQL table intelligence_os_users). Two roles:
 *   admin – everything, including adding users, changing roles and deleting users
 *   user  – their own agents and runs
 *
 * Sign-in is invite-only: an admin adds the email first. To get started, the
 * first person to sign in becomes admin when the table is empty, and any email
 * listed in ADMIN_EMAILS is admin automatically.
 */

export const ROLES = ["admin", "user"];
const T = table("users");
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class UserError extends Error {
  constructor(message, status = 400, fields) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.fields = fields;
    this.type = status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 409 ? "conflict" : "validation";
  }
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const toUser = (r) =>
  r && {
    id: r.id,
    email: r.email,
    name: r.name,
    picture: r.picture,
    role: r.role,
    createdAt: iso(r.created_at),
    lastLoginAt: iso(r.last_login_at),
  };

const normEmail = (e) => String(e ?? "").trim().toLowerCase();
const requireAdmin = (actor) => {
  if (actor?.role !== "admin") throw new UserError("Only administrators can manage users.", 403);
};
const actorUid = (actor) => (Number.isInteger(actor?.uid) ? actor.uid : null);

export async function listUsers(actor) {
  requireAdmin(actor);
  return (await query(`SELECT * FROM ${T} ORDER BY role = 'admin' DESC, name, email`)).map(toUser);
}

export async function getUserById(id) {
  return toUser((await query(`SELECT * FROM ${T} WHERE id = ?`, [id]))[0]);
}

const countAdmins = async () => (await query(`SELECT COUNT(*) AS n FROM ${T} WHERE role = 'admin'`))[0].n;

export async function addUser(actor, { email, name = "", role = "user" } = {}) {
  requireAdmin(actor);
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 254) throw new UserError("Enter a valid email address.", 400, { email: "Enter a valid email address." });
  if (!ROLES.includes(role)) throw new UserError("Role must be admin or user.", 400, { role: "Choose a role." });
  const n = String(name ?? "").trim().slice(0, 120);
  if ((await query(`SELECT id FROM ${T} WHERE email = ?`, [e])).length) {
    throw new UserError("This email is already a user.", 409, { email: "Already added." });
  }
  const res = await query(`INSERT INTO ${T} (email, name, role, created_by) VALUES (?, ?, ?, ?)`, [e, n, role, actorUid(actor)]);
  return getUserById(res.insertId);
}

export async function changeRole(actor, id, role) {
  requireAdmin(actor);
  if (!ROLES.includes(role)) throw new UserError("Role must be admin or user.");
  const user = await getUserById(id);
  if (!user) throw new UserError("User not found.", 404);
  if (user.role === role) return user;
  if (user.role === "admin" && role !== "admin" && (await countAdmins()) <= 1) {
    throw new UserError("You can't remove the last admin. Make someone else admin first.", 409);
  }
  await query(`UPDATE ${T} SET role = ? WHERE id = ?`, [role, id]);
  return getUserById(id);
}

export async function deleteUser(actor, id) {
  requireAdmin(actor);
  if (id === actorUid(actor)) throw new UserError("You can't delete your own account.", 409);
  const user = await getUserById(id);
  if (!user) throw new UserError("User not found.", 404);
  if (user.role === "admin" && (await countAdmins()) <= 1) throw new UserError("You can't delete the last admin.", 409);
  await query(`DELETE FROM ${T} WHERE id = ?`, [id]);
  return { deleted: true, id };
}

/**
 * Called after Google confirms who signed in. Returns the user, or throws
 * UserError(403) when this email has not been added by an admin.
 */
export async function signInWithGoogle({ email, name = "", picture = "", sub = "" }) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw new UserError("Google did not return a valid email.", 403);
  const forcedAdmin = getAdminEmails().includes(e);
  const existing = (await query(`SELECT * FROM ${T} WHERE email = ?`, [e]))[0];

  if (existing) {
    await query(
      `UPDATE ${T} SET name = IF(name = '', ?, name), picture = ?, google_sub = ?, last_login_at = CURRENT_TIMESTAMP${forcedAdmin ? ", role = 'admin'" : ""} WHERE id = ?`,
      [String(name).slice(0, 120), String(picture).slice(0, 500), String(sub).slice(0, 64), existing.id],
    );
    return getUserById(existing.id);
  }

  const total = (await query(`SELECT COUNT(*) AS n FROM ${T}`))[0].n;
  if (!forcedAdmin && total > 0) {
    throw new UserError("Your account has not been added yet. Ask an IntelligenceOS admin to add your email.", 403);
  }
  // Bootstrap: first user ever, or an ADMIN_EMAILS address.
  const res = await query(
    `INSERT INTO ${T} (email, name, picture, role, google_sub, last_login_at) VALUES (?, ?, ?, 'admin', ?, CURRENT_TIMESTAMP)`,
    [e, String(name).slice(0, 120), String(picture).slice(0, 500), String(sub).slice(0, 64)],
  );
  return getUserById(res.insertId);
}
