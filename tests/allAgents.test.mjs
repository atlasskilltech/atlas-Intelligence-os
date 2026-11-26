// All Agents tab data (Settings popup). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "atlas-allagents-"));
process.env.DATA_DIR = dir;
const now = new Date().toISOString();
const agent = (id, owner, email, status) => ({ id, ownerId: owner, ownerEmail: email, status, createdAt: now, updatedAt: now, config: { name: `Agent ${id}` } });
await writeFile(
  path.join(dir, "agents.json"),
  JSON.stringify({
    version: 1,
    agents: [agent("ag_000000000001", "u_1", "a@x.edu", "active"), agent("ag_000000000002", "u_1", "a@x.edu", "draft"), agent("ag_000000000003", "u_2", "b@x.edu", "active")],
  }),
);
const line = (agentId, costUsd, tokens) => JSON.stringify({ ts: now, model: "m", purpose: "agent_run", agentId, ok: true, inputTokens: tokens, outputTokens: 0, costUsd });
await writeFile(path.join(dir, "usage.jsonl"), [line("ag_000000000001", 1.5, 100), line("ag_000000000001", 0.5, 50), line("ag_000000000003", 4, 400)].join("\n") + "\n");

const { agentsPanelData } = await import("../src/lib/settings/panelData.js");

test("admins see everyone's agents grouped by person, with tokens and cost", async () => {
  const d = await agentsPanelData({ id: "u_9", role: "admin" });
  assert.equal(d.isAdmin, true);
  assert.deepEqual(d.owners.map((o) => o.email), ["b@x.edu", "a@x.edu"], "highest cost first");
  const a = d.owners.find((o) => o.email === "a@x.edu");
  assert.equal(a.agentCount, 2);
  assert.equal(a.activeCount, 1);
  assert.equal(a.tokens, 150);
  assert.equal(a.costUsd, 2);
  assert.deepEqual(d.totals, { people: 2, agents: 3, active: 2, tokens: 550, costUsd: 6 });
});

test("a user sees only their own agents", async () => {
  const d = await agentsPanelData({ id: "u_2", role: "user", email: "b@x.edu" });
  assert.equal(d.isAdmin, false);
  assert.equal(d.owners.length, 1);
  assert.equal(d.owners[0].isYou, true);
  assert.equal(d.totals.agents, 1);
});
