#!/usr/bin/env node
// Builds the NEXUS super memory once, from the server shell, and prints per-portal status.
//
//   cd /path/to/atlas-Intelligence-os
//   node --conditions=react-server scripts/build-super-memory.mjs [--refresh] [--project <id>]...
//   (or: npm run memory:build -- --refresh)
//
// --refresh   first asks each portal to rebuild its own memory (<agent>_memory?refresh=1),
//             waits ~45 s, then fetches (same as "Rebuild portal memories too" in the UI)
// --project   only these connected projects (repeatable); default: all
//
// Reads .env.local / .env from the current directory (DATA_DIR, CONNECTOR_ENCRYPTION_KEY …),
// so run it from the app folder with the SAME environment as the server.
// Exit code: 0 = at least one portal fetched (or nothing to fetch), 1 = every portal failed,
// 2 = another build is running or the build itself failed.
import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const args = process.argv.slice(2);
const refreshPortals = args.includes("--refresh");
const projectIds = args.flatMap((a, i) => (a === "--project" && args[i + 1] ? [args[i + 1]] : []));

const { rebuildSuperMemory, readSuperMemory } = await import("../src/lib/memory/superMemory.js");

console.log(`Building NEXUS super memory${refreshPortals ? " (asking portals to refresh first)" : ""}…`);
const run = await rebuildSuperMemory({ reason: "cli", refreshPortals, projectIds: projectIds.length ? projectIds : null });
if (run?.skipped) {
  console.error("Another super-memory build is running. Try again in a few minutes.");
  process.exit(2);
}
if (run?.error) {
  console.error(`Build failed: ${run.error}`);
  process.exit(2);
}

const store = await readSuperMemory();
for (const r of run.refreshed || []) console.log(`  refresh ${r.projectId}: ${r.ok ? "asked" : `failed — ${r.error}`}`);
const rows = run.fetched.map((id) => store.portals[id]).filter(Boolean);
for (const p of rows) {
  const label = `${p.portal}${p.persona ? ` (${p.persona})` : ""}`;
  console.log(`- ${label}: ${p.status} · actions ${(p.actions || []).join(", ") || "—"} · ${(p.collections || []).length} collections, ${(p.vocabularies || []).length} value lists, ${(p.observations || []).length} observations`);
  for (const gap of p.gaps || []) console.log(`    gap: ${gap}`);
}
if (run.noMemory.length) console.log(`Skipped (no memory/brain action in the manifest): ${run.noMemory.join(", ")}`);
console.log(`Done in ${Math.round(run.durationMs / 1000)} s — ${run.ok} ok, ${run.failed} failed, ${rows.length} fetched.`);
process.exit(rows.length && rows.every((p) => p.status === "error") ? 1 : 0);
