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

/** Thrown when data cannot be saved; carries a message that is safe to show users. */
export class StorageError extends Error {
  constructor(cause) {
    super(`Storage write failed: ${cause?.code || cause?.message}`);
    this.publicMessage = "Could not save — the server's storage is not writable right now.";
    this.status = 503;
    this.type = "storage";
  }
}

/**
 * Reads a JSON file. A missing, unreadable or corrupt file returns `fallback`
 * (and is logged) so the app keeps working on defaults.
 */
export async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(resolve(name), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`[storage] could not read ${name}:`, err.code || err.message);
    return fallback;
  }
}

/** Atomic write: write to a temp file, then rename over the original. */
export async function writeJson(name, data) {
  const file = resolve(name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await ensureDir();
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    throw new StorageError(err);
  }
}

/**
 * Like readJson, but a file that exists and cannot be read or parsed THROWS:
 * writing defaults over it would silently destroy whatever it held.
 */
async function readJsonForUpdate(name, fallback) {
  let text;
  try {
    text = await fs.readFile(resolve(name), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new StorageError(err);
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(`[storage] ${name} is corrupt — refusing to overwrite it`);
    throw new StorageError({ code: "ECORRUPT" });
  }
}

/**
 * Read-modify-write under a per-file lock, so two requests in this process
 * can never interleave and lose one another's update. `mutator(current)`
 * returns { value, result } — `value` is written, `result` is returned.
 * (One app server process is assumed — see docs/ARCHITECTURE.md.)
 */
const locks = new Map();
export async function updateJson(name, fallback, mutator) {
  const prev = locks.get(name) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  const chained = prev.then(() => mine);
  locks.set(name, chained);
  await prev;
  try {
    const current = await readJsonForUpdate(name, fallback);
    const { value, result } = await mutator(current);
    if (value !== undefined) await writeJson(name, value);
    return result;
  } finally {
    release();
    if (locks.get(name) === chained) locks.delete(name);
  }
}

export async function appendJsonLine(name, obj) {
  try {
    await ensureDir();
    await fs.appendFile(resolve(name), JSON.stringify(obj) + "\n", "utf8");
  } catch (err) {
    throw new StorageError(err);
  }
}

/** Reads a JSON-lines file, skipping any corrupt lines. */
export async function readJsonLines(name) {
  let raw;
  try {
    raw = await fs.readFile(resolve(name), "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") console.error(`[storage] could not read ${name}:`, err.code || err.message);
    return [];
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
