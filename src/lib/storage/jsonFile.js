import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDataDir } from "../config/env.js";

/**
 * Minimal local-file storage used while there is no database.
 * Repositories (settings, usage, later agents/runs) build on these helpers,
 * so switching to MySQL later only replaces the repositories.
 */

function resolve(name) {
  if (!/^[a-z0-9_\-.]+$/i.test(name) || name.includes("..")) {
    throw new Error(`Invalid storage file name: ${name}`);
  }
  return path.resolve(getDataDir(), name);
}

async function ensureDir() {
  await fs.mkdir(path.resolve(getDataDir()), { recursive: true });
}

export async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(resolve(name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

/** Atomic write: write to a temp file, then rename over the original. */
export async function writeJson(name, data) {
  await ensureDir();
  const file = resolve(name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function appendJsonLine(name, obj) {
  await ensureDir();
  await fs.appendFile(resolve(name), JSON.stringify(obj) + "\n", "utf8");
}

/** Reads a JSON-lines file, skipping any corrupt lines. */
export async function readJsonLines(name) {
  let raw;
  try {
    raw = await fs.readFile(resolve(name), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // ignore a partially written line
    }
  }
  return out;
}
