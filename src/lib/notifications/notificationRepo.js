import "server-only";
import { randomBytes } from "node:crypto";
import { readJson, updateJson } from "../storage/jsonFile.js";

/** In-app notifications (from the notify_owner tool and run events). Last 200 kept. */
const FILE = "notifications.json";
const EMPTY = { notifications: [] };
const MAX = 200;
const LEVELS = ["info", "success", "warning", "error"];

export async function addNotification({ ownerId, message, level = "info", agentId = null, agentName = "", runId = null }) {
  const n = {
    id: `nt_${randomBytes(6).toString("hex")}`,
    ownerId,
    message: String(message || "").slice(0, 500),
    level: LEVELS.includes(level) ? level : "info",
    agentId,
    agentName,
    runId,
    read: false,
    createdAt: new Date().toISOString(),
  };
  return updateJson(FILE, EMPTY, (d) => ({
    value: { notifications: [n, ...(d?.notifications || [])].slice(0, MAX) },
    result: n,
  }));
}

export async function listNotifications(actor, { limit = 20 } = {}) {
  const { notifications = [] } = (await readJson(FILE, EMPTY)) || {};
  const mine = notifications.filter((n) => actor.role === "admin" || n.ownerId === actor.id);
  return { notifications: mine.slice(0, limit), unread: mine.filter((n) => !n.read).length };
}

export async function markAllRead(actor) {
  return updateJson(FILE, EMPTY, (d) => ({
    value: {
      notifications: (d?.notifications || []).map((n) => (actor.role === "admin" || n.ownerId === actor.id ? { ...n, read: true } : n)),
    },
    result: true,
  }));
}
