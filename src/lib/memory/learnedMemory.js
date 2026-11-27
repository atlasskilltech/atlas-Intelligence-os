import "server-only";
import { randomUUID } from "node:crypto";
import { readJson, updateJson } from "../storage/jsonFile.js";
import { ORG_ITEMS_MAX, USER_ITEMS_MAX, addItem, cleanMemoryText, removeItem } from "./memoryCore.js";

/**
 * NEXUS learned memory (spec B2), stored in `nexus-memory.json`:
 *   org   — rules / definitions an ADMIN teaches ("when I say pending I mean…"), ≤ 200
 *   users — each person's own preferences ("call me Priya", "tables please"), ≤ 50 each
 * Written only by the assistant's remember / forget tools (when the person asks
 * or clearly states a stable preference). No secrets, no other people's contacts.
 */

const FILE = "nexus-memory.json";
const EMPTY = { org: [], users: {} };

export class MemoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.type = status === 403 ? "forbidden" : "validation";
  }
}

const actorKey = (actor) => String(actor?.id || "anonymous").slice(0, 80);

/** { personal: [...], org: [...] } for this person (never other people's personal memory). */
export async function getLearnedMemory(actor) {
  const data = await readJson(FILE, EMPTY);
  return {
    personal: (data?.users?.[actorKey(actor)] || []).map((x) => ({ ...x, scope: "me" })),
    org: (data?.org || []).map((x) => ({ ...x, scope: "org" })),
  };
}

export async function rememberItem(actor, { scope = "me", text } = {}) {
  const s = scope === "org" ? "org" : "me";
  if (s === "org" && actor?.role !== "admin") throw new MemoryError("Only administrators can teach NEXUS an organisation-wide rule.", 403);
  const c = cleanMemoryText(text);
  if (c.error) throw new MemoryError(c.error);
  const item = { id: `m_${randomUUID().slice(0, 8)}`, text: c.text, by: actorKey(actor), at: new Date().toISOString() };
  return updateJson(FILE, EMPTY, (data) => {
    const next = { org: data?.org || [], users: { ...(data?.users || {}) } };
    if (s === "org") next.org = addItem(next.org, item, ORG_ITEMS_MAX);
    else next.users[actorKey(actor)] = addItem(next.users[actorKey(actor)], item, USER_ITEMS_MAX);
    return { value: next, result: { ...item, scope: s } };
  });
}

/** Forgets by id or text: the person's own items always; org items only for admins. */
export async function forgetItem(actor, { id, text } = {}) {
  if (!id && !text) throw new MemoryError("Say what to forget.");
  const isAdmin = actor?.role === "admin";
  return updateJson(FILE, EMPTY, (data) => {
    const next = { org: data?.org || [], users: { ...(data?.users || {}) } };
    const mine = removeItem(next.users[actorKey(actor)], { id, text });
    next.users[actorKey(actor)] = mine.list;
    let orgRemoved = [];
    if (isAdmin) {
      const o = removeItem(next.org, { id, text });
      next.org = o.list;
      orgRemoved = o.removed;
    } else if (removeItem(next.org, { id, text }).removed.length && !mine.removed.length) {
      throw new MemoryError("That is an organisation rule; only an administrator can remove it.", 403);
    }
    const removed = [...mine.removed.map((x) => ({ ...x, scope: "me" })), ...orgRemoved.map((x) => ({ ...x, scope: "org" }))];
    return { value: removed.length ? next : undefined, result: { removed } };
  });
}
