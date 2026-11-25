import "server-only";
import { registerSecret } from "../../config/env.js";
import { NetworkBlocked, checkUrl } from "../../security/netGuard.js";
import { decryptSecret, encryptSecret } from "../../security/secretBox.js";
import { readJson, updateJson } from "../../storage/jsonFile.js";
import { parseBody } from "../http/parseBody.js";
import { safeFetch } from "../http/safeFetch.js";
import { ManifestError, parseManifest } from "./manifest.js";

/**
 * ATLAS project connections (Milestone 7), stored in `project-connections.json`.
 *
 * The admin pastes a key created in the other project. IntelligenceOS asks the
 * project what that key allows (GET <baseUrl>/manifest) and stores that list.
 * The key is stored encrypted (secretBox) and is never returned to the browser.
 */

const FILE = "project-connections.json";
const EMPTY = { projects: [] };
export const MAX_PROJECTS = 30;
export const USER_AGENT = "ATLAS-IntelligenceOS/1.0 (agent connector)";

export class ProjectError extends Error {
  constructor(message, status = 400, fields) {
    super(message);
    this.publicMessage = message;
    this.status = status;
    this.fields = fields;
    this.type = status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 409 ? "conflict" : "validation";
  }
}

const requireAdmin = (actor) => {
  if (actor?.role !== "admin") throw new ProjectError("Only administrators can connect or change projects.", 403);
};

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 36) || "project";

function cleanName(name) {
  const n = String(name ?? "").trim();
  if (!n || n.length > 80) throw new ProjectError("Enter the project's name (up to 80 characters).", 400, { name: "Enter the project's name." });
  return n;
}

function cleanBaseUrl(input) {
  try {
    const url = checkUrl(String(input ?? "").trim());
    if (url.search || url.hash) throw new NetworkBlocked("The project URL must not contain ? or #.");
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch (err) {
    const message = err instanceof NetworkBlocked ? err.message : "Enter the project's Agent API URL, e.g. https://crm.atlasuniversity.edu.in/agent-api";
    throw new ProjectError(message, 400, { baseUrl: message });
  }
}

function cleanKey(key) {
  const k = String(key ?? "").trim();
  if (k.length < 16 || k.length > 500 || /\s/.test(k)) {
    throw new ProjectError("Paste the full key from the project (no spaces).", 400, { key: "Paste the full key from the project." });
  }
  return k;
}

/** Header carrying the agent owner's email to projects that act as the signed-in user (spec v1.1). */
export const USER_HEADER = "X-IntelligenceOS-User";

/**
 * Asks the project what this key allows — or, with `userEmail` (delegated
 * projects), what this key allows FOR THAT USER. Throws ProjectError with a
 * plain-language reason; a per-user refusal has `userRefused: true`.
 */
export async function fetchManifest(baseUrl, key, { userEmail } = {}) {
  registerSecret(key);
  let res;
  try {
    res = await safeFetch(`${baseUrl}/manifest`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(userEmail ? { [USER_HEADER]: userEmail } : {}),
      },
      timeoutMs: 15_000,
      maxBytes: 500_000,
    });
  } catch (err) {
    throw new ProjectError(`Could not reach the project: ${err.message}`, 400, { baseUrl: err.message });
  }
  if (res.status === 403 && userEmail) {
    const body = parseBody(res);
    const why = typeof body?.error === "string" ? body.error.slice(0, 300) : "this user is not allowed";
    throw Object.assign(new ProjectError(`The project refused ${userEmail}: ${why}`, 403), { userRefused: true });
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProjectError("The project rejected this key. Check it was copied fully and has not been revoked or expired.", 400, {
      key: "The project rejected this key.",
    });
  }
  if (res.status === 404) {
    const m = `No Agent API found at ${baseUrl}/manifest. Check the project URL.`;
    throw new ProjectError(m, 400, { baseUrl: m });
  }
  if (res.status < 200 || res.status >= 300) throw new ProjectError(`The project answered with HTTP ${res.status}. Try again later.`, 400);
  const doc = parseBody(res);
  if (!doc || typeof doc !== "object") throw new ProjectError("The project did not return a JSON manifest.", 400);
  try {
    return { ...parseManifest(doc), fetchedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof ManifestError) throw new ProjectError(err.message, 400);
    throw err;
  }
}

/** Safe view for the browser: no key, only its last 4 characters. */
export function publicProject(p) {
  const { keyBox, ...rest } = p;
  return { ...rest, keyHint: `••••${p.keyLast4 || ""}`, usable: p.enabled && p.status === "connected" };
}

/** The decrypted key, for calling the project. Registered for redaction. */
export function projectKey(p) {
  const k = decryptSecret(p.keyBox);
  registerSecret(k);
  return k;
}

async function readAll() {
  const data = await readJson(FILE, EMPTY);
  return Array.isArray(data?.projects) ? data.projects : [];
}

export async function listProjects() {
  return (await readAll()).sort((a, b) => a.name.localeCompare(b.name));
}

/** [{ id, name, usable }] for showing connectors next to agents. Never throws. */
export async function projectStatusList() {
  try {
    return (await listProjects()).map((p) => ({ id: p.id, name: p.name, usable: p.enabled && p.status === "connected" }));
  } catch {
    return [];
  }
}

export async function getProject(id) {
  const p = (await readAll()).find((x) => x.id === id);
  if (!p) throw new ProjectError("Project not found.", 404);
  return p;
}

async function mutate(id, fn) {
  return updateJson(FILE, EMPTY, async (data) => {
    const list = data?.projects || [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) throw new ProjectError("Project not found.", 404);
    const next = [...list];
    next[i] = await fn({ ...list[i] });
    return { value: { projects: next }, result: next[i] };
  });
}

export async function connectProject(actor, { name, baseUrl, key, delegated = false }) {
  requireAdmin(actor);
  const fields = {};
  const attempt = (f) => {
    try {
      return f();
    } catch (err) {
      if (!(err instanceof ProjectError)) throw err;
      Object.assign(fields, err.fields || {});
    }
  };
  const n = attempt(() => cleanName(name));
  const url = attempt(() => cleanBaseUrl(baseUrl));
  const k = attempt(() => cleanKey(key));
  if (Object.keys(fields).length) throw new ProjectError(`Please fix: ${Object.values(fields)[0]}`, 400, fields);

  const keyBox = encryptSecret(k); // fails early if the server has no encryption key
  const manifest = await fetchManifest(url, k);
  const now = new Date().toISOString();
  return updateJson(FILE, EMPTY, (data) => {
    const list = data?.projects || [];
    if (list.length >= MAX_PROJECTS) throw new ProjectError(`At most ${MAX_PROJECTS} projects can be connected.`, 409);
    if (list.some((p) => p.baseUrl === url)) throw new ProjectError("This project is already connected. Open it to replace its key.", 409, { baseUrl: "Already connected." });
    let id = slug(n);
    for (let i = 2; list.some((p) => p.id === id); i++) id = `${slug(n).slice(0, 33)}_${i}`;
    const rec = {
      id,
      name: n,
      baseUrl: url,
      enabled: true,
      delegated: delegated === true,
      keyBox,
      keyLast4: k.slice(-4),
      manifest,
      status: "connected",
      lastError: null,
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };
    return { value: { projects: [...list, rec] }, result: rec };
  });
}

/** Re-reads what the key allows. A failure is recorded on the project (agents then can't use it). */
export async function syncProject(actor, id) {
  requireAdmin(actor);
  const p = await getProject(id);
  let manifest = null;
  let error = null;
  try {
    manifest = await fetchManifest(p.baseUrl, projectKey(p));
  } catch (err) {
    if (!err.publicMessage) throw err;
    error = err.publicMessage;
  }
  return mutate(id, (cur) => {
    cur.syncedAt = new Date().toISOString();
    cur.updatedBy = actor.id;
    if (manifest) Object.assign(cur, { manifest, status: "connected", lastError: null });
    else Object.assign(cur, { status: "error", lastError: error });
    return cur;
  });
}

/** Rename, enable/disable, or replace the key (the new key is checked first). */
export async function updateProject(actor, id, { name, enabled, key, delegated } = {}) {
  requireAdmin(actor);
  const p = await getProject(id);
  let keyPatch = {};
  if (key != null && String(key).trim() !== "") {
    const k = cleanKey(key);
    const keyBox = encryptSecret(k);
    const manifest = await fetchManifest(p.baseUrl, k);
    keyPatch = { keyBox, keyLast4: k.slice(-4), manifest, status: "connected", lastError: null, syncedAt: new Date().toISOString() };
  }
  const n = name != null ? cleanName(name) : null;
  return mutate(id, (cur) => ({
    ...cur,
    ...keyPatch,
    ...(n ? { name: n } : {}),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(typeof delegated === "boolean" ? { delegated } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.id,
  }));
}

/** Called when the project rejects the key during a run, so the card shows the problem. */
export async function markProjectError(id, message) {
  try {
    await mutate(id, (cur) => ({ ...cur, status: "error", lastError: message }));
  } catch {
    /* best effort */
  }
}

export async function deleteProject(actor, id) {
  requireAdmin(actor);
  return updateJson(FILE, EMPTY, (data) => {
    const list = data?.projects || [];
    if (!list.some((x) => x.id === id)) throw new ProjectError("Project not found.", 404);
    return { value: { projects: list.filter((x) => x.id !== id) }, result: { deleted: true, id } };
  });
}
