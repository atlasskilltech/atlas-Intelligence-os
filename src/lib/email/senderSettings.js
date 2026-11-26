import "server-only";
import { DEFAULT_SENDER_EMAIL, getDbConfig, getSendGridConfig } from "../config/env.js";
import { query, table } from "../db/mysql.js";
import { readJson, writeJson } from "../storage/jsonFile.js";

/**
 * Per-user email sender ("From" address and name) for agent emails.
 * Each user sets their own on the Email sender page; when they have not,
 * the default sender is used (SENDGRID_FROM_EMAIL, else tech@atlasuniversity.edu.in).
 *
 * Stored in MySQL (intelligence_os_email_senders) for signed-in users;
 * in DATA_DIR/email-senders.json when there is no database (local mode).
 */

const T = table("email_senders");
const FILE = "email-senders.json";
const EMAIL_RE = /^[^\s@<>"(),;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/i;

export class SenderError extends Error {
  constructor(message, fields) {
    super(message);
    this.publicMessage = message;
    this.fields = fields;
    this.status = 400;
    this.type = "validation";
  }
}

const uidOf = (actorId) => {
  const m = /^u_(\d+)$/.exec(String(actorId || ""));
  return m ? Number(m[1]) : null;
};
const storedInDb = (actorId) => Boolean(getDbConfig()) && uidOf(actorId) !== null;
const cleanName = (n) => String(n ?? "").replace(/[\r\n\t<>"]+/g, " ").trim().slice(0, 100);

export function defaultSender() {
  const cfg = getSendGridConfig();
  return {
    email: cfg?.from || DEFAULT_SENDER_EMAIL,
    name: cfg?.fromName || "ATLAS IntelligenceOS",
    allowedDomains: cfg?.allowedDomains || [DEFAULT_SENDER_EMAIL.split("@")[1]],
  };
}

async function readOwn(actorId) {
  if (storedInDb(actorId)) {
    const row = (await query(`SELECT from_email, from_name FROM ${T} WHERE user_id = ?`, [uidOf(actorId)]))[0];
    return row ? { email: row.from_email, name: row.from_name } : null;
  }
  const all = await readJson(FILE, {});
  return all[actorId] || null;
}

/**
 * The sender for this user: { email, name, custom, default: {email, name}, allowedDomains }.
 * Falls back to the default sender if the user has none (or it can't be read).
 */
export async function getSenderFor(actorId) {
  const def = defaultSender();
  let own = null;
  try {
    own = actorId ? await readOwn(actorId) : null;
  } catch (err) {
    console.error("[email] could not read sender settings:", err?.message);
  }
  const domainOk = own?.email && def.allowedDomains.includes(own.email.split("@")[1]);
  return {
    email: domainOk ? own.email : def.email,
    name: (domainOk && own.name) || def.name,
    custom: Boolean(domainOk),
    default: { email: def.email, name: def.name },
    allowedDomains: def.allowedDomains,
  };
}

/** Validates { email, name }. Empty email = go back to the default sender. */
export function validateSender(input = {}) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = cleanName(input.name);
  if (!email) return { email: "", name };
  const { allowedDomains } = defaultSender();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new SenderError("Enter a valid email address.", { email: "Enter a valid email address." });
  if (!allowedDomains.includes(email.split("@")[1])) {
    const list = allowedDomains.map((d) => `@${d}`).join(", ");
    throw new SenderError(`The sender must be an ${list} address.`, { email: `Use an ${list} address.` });
  }
  return { email, name };
}

/** Saves (or clears, when email is empty) the actor's own sender. Returns getSenderFor(). */
export async function saveSenderFor(actor, input) {
  const { email, name } = validateSender(input);
  const id = actor?.id;
  if (!id) throw new SenderError("Sign in first.");
  if (storedInDb(id)) {
    if (email) {
      await query(`INSERT INTO ${T} (user_id, from_email, from_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE from_email = VALUES(from_email), from_name = VALUES(from_name)`, [uidOf(id), email, name]);
    } else {
      await query(`DELETE FROM ${T} WHERE user_id = ?`, [uidOf(id)]);
    }
  } else {
    const all = await readJson(FILE, {});
    if (email) all[id] = { email, name };
    else delete all[id];
    await writeJson(FILE, all);
  }
  return getSenderFor(id);
}
