import "server-only";
import { randomBytes } from "node:crypto";
import { readJson, updateJson } from "../storage/jsonFile.js";

/**
 * Saved Home chats (Chat mode). Private to the person who had them — admins
 * do not see other people's chats.
 *   { id, ownerId, title, messages: [{ role, content, sources? }], createdAt, updatedAt }
 */
const FILE = "chats.json";
const EMPTY = { chats: [] };
const MAX_PER_OWNER = 200;
const MAX_MESSAGES = 200;
const CONTENT_MAX = 20_000;

export class ChatNotFound extends Error {
  constructor() {
    super("Chat not found.");
    this.publicMessage = "Chat not found — it may have been deleted.";
    this.status = 404;
    this.type = "not_found";
  }
}

export const isChatId = (id) => typeof id === "string" && /^ch_[a-f0-9]{12}$/.test(id);

const titleFrom = (text) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "New chat";
};

const cleanSources = (sources) =>
  Array.isArray(sources)
    ? sources.slice(0, 20).map((s) => ({ project: String(s?.project || "").slice(0, 120), action: String(s?.action || "").slice(0, 120) }))
    : undefined;

const cleanMessage = (m) => ({
  role: m.role === "assistant" ? "assistant" : "user",
  content: String(m.content || "").slice(0, CONTENT_MAX),
  ...(m.role === "assistant" && m.sources?.length ? { sources: cleanSources(m.sources) } : {}),
});

/** Sidebar list: newest first, without the messages. */
export async function listChats(actor, { limit = 50 } = {}) {
  const { chats = [] } = (await readJson(FILE, EMPTY)) || {};
  return chats
    .filter((c) => c.ownerId === actor.id)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit)
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
}

export async function getChat(actor, id) {
  if (!isChatId(id)) throw new ChatNotFound();
  const { chats = [] } = (await readJson(FILE, EMPTY)) || {};
  const chat = chats.find((c) => c.id === id && c.ownerId === actor.id);
  if (!chat) throw new ChatNotFound();
  return chat;
}

/**
 * Add messages to a chat, creating it when `chatId` is empty (or unknown to this
 * person). Returns the chat's list entry { id, title, createdAt, updatedAt }.
 */
export async function appendToChat(actor, chatId, messages) {
  const now = new Date().toISOString();
  const add = messages.map(cleanMessage);
  return updateJson(FILE, EMPTY, (d) => {
    const chats = d?.chats || [];
    let chat = isChatId(chatId) ? chats.find((c) => c.id === chatId && c.ownerId === actor.id) : null;
    if (chat) {
      chat.messages = [...chat.messages, ...add].slice(-MAX_MESSAGES);
      chat.updatedAt = now;
    } else {
      chat = {
        id: `ch_${randomBytes(6).toString("hex")}`,
        ownerId: actor.id,
        title: titleFrom(add.find((m) => m.role === "user")?.content),
        messages: add,
        createdAt: now,
        updatedAt: now,
      };
      chats.push(chat);
    }
    // Keep each person's newest chats only.
    const mine = chats.filter((c) => c.ownerId === actor.id).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const drop = new Set(mine.slice(MAX_PER_OWNER).map((c) => c.id));
    const { id, title, createdAt, updatedAt } = chat;
    return { value: { chats: chats.filter((c) => !drop.has(c.id)) }, result: { id, title, createdAt, updatedAt } };
  });
}

export async function deleteChat(actor, id) {
  if (!isChatId(id)) throw new ChatNotFound();
  return updateJson(FILE, EMPTY, (d) => {
    const chats = d?.chats || [];
    if (!chats.some((c) => c.id === id && c.ownerId === actor.id)) throw new ChatNotFound();
    return { value: { chats: chats.filter((c) => c.id !== id) }, result: true };
  });
}
