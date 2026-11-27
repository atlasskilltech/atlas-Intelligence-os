// Saved Home chats (sidebar history). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "atlas-chats-"));

const { appendToChat, deleteChat, getChat, listChats, searchChats, ChatNotFound } = await import("../src/lib/chats/chatRepo.js");

const alice = { id: "u_1", role: "user" };
const bob = { id: "u_2", role: "admin" };

test("a first answer creates a chat titled from the question; later ones append", async () => {
  const c = await appendToChat(alice, null, [
    { role: "user", content: "  How many   requests are pending today? " },
    { role: "assistant", content: "25.", sources: [{ project: "CRM", action: "search", extra: "x" }] },
  ]);
  assert.match(c.id, /^ch_[a-f0-9]{12}$/);
  assert.equal(c.title, "How many requests are pending today?");

  const again = await appendToChat(alice, c.id, [
    { role: "user", content: "And yesterday?" },
    { role: "assistant", content: "20." },
  ]);
  assert.equal(again.id, c.id);
  const full = await getChat(alice, c.id);
  assert.equal(full.messages.length, 4);
  assert.deepEqual(full.messages[1].sources, [{ project: "CRM", action: "search" }]);
  assert.equal((await listChats(alice))[0].messages, undefined, "the list leaves messages out");
});

test("chats are private, even from admins, and an unknown chatId starts a new chat", async () => {
  const [mine] = await listChats(alice);
  assert.deepEqual(await listChats(bob), []);
  await assert.rejects(getChat(bob, mine.id), ChatNotFound);
  await assert.rejects(deleteChat(bob, mine.id), ChatNotFound);

  const other = await appendToChat(bob, mine.id, [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]);
  assert.notEqual(other.id, mine.id);
  assert.equal((await getChat(alice, mine.id)).messages.length, 4, "alice's chat untouched");
});

test("newest chat first; delete removes it", async () => {
  const second = await appendToChat(alice, null, [{ role: "user", content: "Second" }, { role: "assistant", content: "ok" }]);
  assert.equal((await listChats(alice))[0].id, second.id);
  await deleteChat(alice, second.id);
  assert.ok(!(await listChats(alice)).some((c) => c.id === second.id));
  await assert.rejects(getChat(alice, "../../etc"), ChatNotFound);
});

test("search finds your chats by title or by what was said, never other people's", async () => {
  await appendToChat(alice, null, [{ role: "user", content: "Faculty free in block B?" }, { role: "assistant", content: "Dr. Rao is free at 3 pm." }]);
  const byTitle = await searchChats(alice, "block b");
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].snippet, "", "title matches need no snippet");
  const byText = await searchChats(alice, "dr. rao");
  assert.equal(byText.length, 1);
  assert.match(byText[0].snippet, /Dr\. Rao is free/);
  assert.deepEqual(await searchChats(bob, "rao"), []);
  assert.ok((await searchChats(alice, "")).length >= 2, "empty search lists recent chats");
});
