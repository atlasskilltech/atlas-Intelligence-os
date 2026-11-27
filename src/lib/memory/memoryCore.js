/**
 * NEXUS memory — pure rules (no I/O), so every bound and redaction is testable.
 * See docs/AGENT_ETIQUETTE_AND_MEMORY.md (Part B2, B3, B5).
 *
 *   - super memory: each connected ATLAS portal's <agent>_memory / <agent>_brain,
 *     condensed, redacted and bounded, plus cross-portal links
 *   - learned memory: what people teach NEXUS (per user + org), bounded and deduped
 */
import { PORTAL_AGENTS, portalAgentFor } from "../portals/portalAgents.js";

export const MEMORY_VERSION = 1;
export const SUMMARY_MAX_CHARS = 9_000; // ≈ 2,500 tokens
export const PORTAL_TEXT_MAX = 24_000; // searchable text kept per portal
export const LOOKUP_MAX = 12;
export const LOOKUP_ITEM_MAX = 600;
export const USER_ITEMS_MAX = 50;
export const ORG_ITEMS_MAX = 200;
export const ITEM_TEXT_MAX = 300;

// Field-name classification on TOKENS (spec Amendment 1): "company" ≠ pan, "program_name" ≠ a person.
const SECRET_TOKENS = new Set(["password", "passwd", "pwd", "pass", "token", "secret", "apikey", "otp", "hash", "salt", "session", "cookie", "credential", "credentials", "aadhaar", "aadhar", "pan", "bank", "ifsc", "salary", "ctc", "dob", "birth", "birthdate"]);
const SECRET_PAIRS = [["api", "key"], ["access", "key"], ["private", "key"], ["account", "number"]];
const PERSONAL_TOKENS = new Set(["email", "mail", "phone", "mobile", "contact", "address", "pincode", "whatsapp"]);
const PERSON_WORDS = new Set(["first", "last", "middle", "full", "father", "mother", "guardian", "parent", "student", "applicant", "candidate", "employee", "user", "contact", "person", "spouse", "nominee"]);

/** "fatherMobileNo" → ["father", "mobile", "no"]; splits on _ - . spaces and camelCase. */
export function fieldTokens(name) {
  return String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "secret" (never kept), "personal" (shape only, no values) or null. */
export function classifyField(name) {
  const t = fieldTokens(name);
  if (t.some((x) => SECRET_TOKENS.has(x))) return "secret";
  for (let i = 0; i + 1 < t.length; i++) if (SECRET_PAIRS.some(([a, b]) => t[i] === a && t[i + 1] === b)) return "secret";
  if (t.some((x) => PERSONAL_TOKENS.has(x))) return "personal";
  const joined = t.join("");
  if (["name", "fullname", "username"].includes(joined)) return "personal";
  for (let i = 1; i < t.length; i++) if (t[i] === "name" && PERSON_WORDS.has(t[i - 1])) return "personal";
  return null;
}

// Keys describing an object that holds sampled values (top values / samples): stricter value filter.
const SAMPLE_KEYS = /^(topvalues|top|values|samples?|examples?)$/i;

const fold = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ---------------------------------------------------------------------------
// Which actions a project exposes for memory
// ---------------------------------------------------------------------------

/** The portal agent + the memory/brain actions this project's manifest actually lists (GET, read, no required params). */
export function memoryActionsFor(project) {
  const agent = portalAgentFor(project);
  const actions = project?.manifest?.actions || project?.actions || [];
  const usable = (id) => {
    const a = actions.find((x) => x?.id === id);
    return a && a.method === "GET" && a.risk === "read" && !(a.params || []).some((p) => p.required) ? a : null;
  };
  const found = [];
  if (agent) {
    for (const id of [agent.memoryAction, agent.brainAction]) if (usable(id)) found.push(id);
  } else {
    // An unknown project that still follows the naming: any *_memory / *_brain read action.
    for (const a of actions) if (/_(memory|brain)$/.test(a?.id || "") && usable(a.id)) found.push(a.id);
  }
  return { agent, actions: found.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Redaction: secrets never stored; personal fields keep shape, never values
// ---------------------------------------------------------------------------

/** Deep copy: secret fields removed, personal fields keep shape but no values, text scrubbed. Bounded depth/size. */
export function redactPayload(value, depth = 0, { sample = false } = {}) {
  if (depth > 8) return "[…]";
  if (Array.isArray(value)) {
    const list = value.slice(0, 200).map((v) => redactPayload(v, depth + 1, { sample }));
    return sample ? list.filter((v) => v !== DROP) : list;
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    if (sample && !sampleValueOk(value)) return DROP;
    return redactValueText(value).slice(0, 2_000);
  }
  const out = {};
  const descriptor = isDescriptor(value);
  for (const [k, v] of Object.entries(value).slice(0, 300)) {
    // In a portal's memory a bare "name" next to count / type / fields … names a collection or field, not a person.
    const kind = descriptor && k.toLowerCase() === "name" && typeof v === "string" ? null : classifyField(k);
    if (kind === "secret") continue;
    if (kind === "personal") {
      out[k] = v == null || typeof v !== "object" ? "[personal]" : redactPayload(stripValues(v), depth + 1);
      continue;
    }
    const r = redactPayload(v, depth + 1, { sample: sample || SAMPLE_KEYS.test(k.replace(/[_\s-]/g, "")) });
    if (r !== DROP) out[k] = r;
  }
  return out;
}

const DROP = Symbol("drop");
const DESCRIPTOR_KEYS = /^(count|estimatedcount|rows|rowcount|total|type|fields|columns|purpose|description|fillrate|fill|values|topvalues|collection|table|newest|oldest|relationships|lowcardinality|kind|meaning|path)$/i;
const isDescriptor = (o) => Object.keys(o).some((k) => DESCRIPTOR_KEYS.test(k.replace(/[_\s-]/g, "")));

/** A sampled value may be kept: not an email, phone (≥ 8 digits), Aadhaar / PAN, and ≤ 80 chars. */
export function sampleValueOk(v) {
  const s = String(v);
  if (s.length > 80) return false;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) return false;
  if ((s.match(/\d/g) || []).length >= 8 && /\d[\d\s+-]{6,}\d/.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/i.test(s)) return false;
  return true;
}

// For a personal field described as an object (e.g. { type, fillRate, topValues }): keep everything but sample values.
function stripValues(v) {
  if (Array.isArray(v)) return [];
  const o = {};
  for (const [k, x] of Object.entries(v)) if (!/value|sample|example|top/i.test(k)) o[k] = x;
  return o;
}

/** Removes email addresses, phone numbers and Aadhaar-like numbers from free text. */
export function redactValueText(s) {
  return String(s)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, "[phone]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[id]")
    .replace(/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, "[number]");
}

// ---------------------------------------------------------------------------
// Condensing one portal's payloads
// ---------------------------------------------------------------------------

const COLL_KEYS = /^(collections|tables|entities|schema|datasets|models)$/i;
const OBS_KEYS = /^(observations|insights|attention|alerts|highlights|needsattention|focus)$/i;
const VOCAB_KEYS = /^(vocabularies|vocabulary|stages|statuses|values|enums|lookups)$/i;
const RULE_KEYS = /^(rules|orgrules|orgmemory|taught|definitions)$/i;

function findArrays(node, re, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 5) return out;
  for (const [k, v] of Object.entries(node)) {
    if (re.test(k.replace(/[_\s-]/g, ""))) out.push(v);
    else if (v && typeof v === "object") findArrays(v, re, out, depth + 1);
  }
  return out;
}

const asText = (x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.text || x.title || x.message || x.summary || x.description || JSON.stringify(x) : String(x ?? ""));

function collectionsOf(payloads) {
  const out = new Map();
  for (const p of payloads) {
    for (const v of findArrays(p, COLL_KEYS)) {
      const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.entries(v).map(([name, info]) => ({ name, ...(info && typeof info === "object" ? info : { count: info }) })) : [];
      for (const c of list.slice(0, 120)) {
        const name = String(c?.name || c?.collection || c?.table || "").slice(0, 80);
        if (!name || out.has(name)) continue;
        const count = Number(c.count ?? c.estimatedCount ?? c.rows ?? c.rowCount ?? c.total);
        out.set(name, { name, count: Number.isFinite(count) ? count : null, purpose: clip(String(c.purpose || c.description || c.meaning || ""), 160) });
      }
    }
  }
  return [...out.values()].slice(0, 80);
}

function vocabulariesOf(payloads) {
  const out = [];
  for (const p of payloads) {
    for (const v of findArrays(p, VOCAB_KEYS)) {
      if (Array.isArray(v)) {
        const vals = v.map(asText).filter(Boolean).slice(0, 30);
        if (vals.length) out.push({ name: "values", values: vals.map((x) => clip(x, 60)) });
      } else if (v && typeof v === "object") {
        for (const [name, vals] of Object.entries(v).slice(0, 30)) {
          const list = (Array.isArray(vals) ? vals : vals && typeof vals === "object" ? Object.keys(vals) : []).map(asText).filter(Boolean).slice(0, 30);
          if (list.length) out.push({ name: clip(name, 60), values: list.map((x) => clip(x, 60)) });
        }
      }
    }
  }
  return out.slice(0, 30);
}

const listOf = (payloads, re, n) => {
  const out = [];
  for (const p of payloads) for (const v of findArrays(p, re)) for (const x of Array.isArray(v) ? v : [v]) {
    const t = clip(asText(x).trim(), 240);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, n);
};

/** One portal's fetched payloads → the bounded entry stored in super memory. */
export function condensePortal({ project, agent, results }) {
  const payloads = results.filter((r) => r.ok).map((r) => redactPayload(r.data));
  const text = clip(payloads.map((p) => JSON.stringify(p)).join("\n"), PORTAL_TEXT_MAX);
  return {
    projectId: project.id,
    projectName: project.name,
    portal: agent?.portal || project.name,
    persona: agent?.persona || null,
    agentId: agent?.id || null,
    actions: results.map((r) => r.action),
    status: payloads.length ? (results.every((r) => r.ok) ? "ok" : "partial") : "error",
    gaps: results.filter((r) => !r.ok).map((r) => `${r.action}: ${clip(String(r.error || "failed"), 200)}`),
    collections: collectionsOf(payloads),
    vocabularies: vocabulariesOf(payloads),
    observations: listOf(payloads, OBS_KEYS, 15),
    rules: listOf(payloads, RULE_KEYS, 20),
    text,
  };
}

// ---------------------------------------------------------------------------
// Cross-portal links (plain-English notes, only between portals actually present)
// ---------------------------------------------------------------------------

const LINKS = [
  [["crm", "admissions"], "A CRM lead (AILA) becomes an Admissions applicant (ARYA) once an application is made — match people on Application ID, then email / mobile."],
  [["admissions", "learnx"], "An admitted applicant (ARYA) becomes a LearnX learner (SAGE) after enrolment — the same student across both."],
  [["learnx", "career_services"], "A LearnX learner (SAGE) is the student Career Services (KAIRO) places in internships and jobs."],
  [["crm", "career_services"], "Placement outcomes in Career Services (KAIRO) are what CRM counsellors (AILA) quote to prospective students."],
  [["international", "admissions"], "International applicants (VOYA) are a stream of the Admissions pipeline (ARYA)."],
  [["hrms", "dashboard"], "An HRMS employee (MIRA) is the faculty / staff member in the Dashboard's timetable, invigilation and attendance (NOVA)."],
  [["dashboard", "learnx"], "Courses and attendance in the Dashboard (NOVA) line up with LearnX courses and learner progress (SAGE)."],
  [["dashboard", "admissions"], "The Dashboard's admissions figures (NOVA) are a roll-up of the Admissions pipeline (ARYA)."],
];

export function crossPortalLinks(agentIds) {
  const have = new Set(agentIds);
  return LINKS.filter(([ids]) => ids.every((id) => have.has(id))).map(([, note]) => note);
}

// ---------------------------------------------------------------------------
// Prompt summary + lookup
// ---------------------------------------------------------------------------

const fmtCount = (n) => (Number.isFinite(n) ? n.toLocaleString("en-IN") : "?");

/** Compact super-memory summary for the NEXUS prompt (≤ SUMMARY_MAX_CHARS). */
export function summarizeSuperMemory(store, { maxChars = SUMMARY_MAX_CHARS } = {}) {
  const portals = Object.values(store?.portals || {});
  if (!portals.length) return "";
  const parts = [`SUPER MEMORY (background scan of each portal's memory, built ${store.builtAt || "?"} — context only; take live figures from the live tools and say "as of the last scan" if you use these):`];
  for (const p of portals) {
    const head = `• ${p.portal}${p.persona ? ` (${p.persona})` : ""}: ${p.status === "error" ? `not available — ${p.gaps?.[0] || "fetch failed"}` : `fetched ${p.fetchedAt || "?"}`}`;
    const colls = (p.collections || []).slice(0, 12).map((c) => `${c.name} ${fmtCount(c.count)}${c.purpose ? ` (${clip(c.purpose, 60)})` : ""}`).join("; ");
    const vocab = (p.vocabularies || []).slice(0, 4).map((v) => `${v.name}: ${v.values.slice(0, 8).join(", ")}`).join(" | ");
    const obs = (p.observations || []).slice(0, 3).join(" / ");
    parts.push([head, colls && `  data: ${colls}`, vocab && `  values: ${vocab}`, obs && `  noticed: ${obs}`].filter(Boolean).join("\n"));
  }
  if (store.links?.length) parts.push(`Cross-portal: ${store.links.join(" ")}`);
  parts.push("For more detail call memory_lookup.");
  let out = parts.join("\n");
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 40)}\n… (more via memory_lookup)`;
  return out;
}

const terms = (q) => fold(q).split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 1).slice(0, 12);

/** Bounded matches across super memory + learned memory. */
export function lookupMemory({ superStore, learned = [], query, limit = LOOKUP_MAX }) {
  const ts = terms(query);
  const n = Math.max(1, Math.min(LOOKUP_MAX, Number(limit) || LOOKUP_MAX));
  if (!ts.length) return { query: String(query || ""), matches: [] };
  const score = (s) => {
    const f = fold(s);
    return ts.reduce((a, t) => a + (f.includes(t) ? 1 : 0), 0);
  };
  const cands = [];
  for (const it of learned) cands.push({ source: it.scope === "org" ? "org rule" : "your memory", text: it.text, id: it.id });
  for (const p of Object.values(superStore?.portals || {})) {
    const label = `${p.portal}${p.persona ? ` (${p.persona})` : ""}`;
    for (const c of p.collections || []) cands.push({ source: label, text: `collection ${c.name}: ${fmtCount(c.count)} records${c.purpose ? ` — ${c.purpose}` : ""}` });
    for (const v of p.vocabularies || []) cands.push({ source: label, text: `${v.name}: ${v.values.join(", ")}` });
    for (const o of p.observations || []) cands.push({ source: label, text: `noticed: ${o}` });
    for (const r of p.rules || []) cands.push({ source: label, text: `rule: ${r}` });
    for (const chunk of (p.text || "").match(/.{1,400}/gs) || []) cands.push({ source: `${label} raw`, text: chunk });
  }
  for (const l of superStore?.links || []) cands.push({ source: "cross-portal", text: l });
  const matches = cands
    .map((c) => ({ ...c, s: score(`${c.source} ${c.text}`) }))
    .filter((c) => c.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ s, ...c }) => ({ ...c, text: clip(c.text, LOOKUP_ITEM_MAX) }));
  return { query: clip(String(query), 200), matches, ...(superStore?.builtAt ? { asOf: superStore.builtAt } : {}) };
}

// ---------------------------------------------------------------------------
// Nightly window (IST 02:30–04:30, once per IST date; a missed night is skipped)
// ---------------------------------------------------------------------------

export function istParts(now = Date.now()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function nightlyDue(store, now = Date.now()) {
  const { date, minutes } = istParts(now);
  return minutes >= 150 && minutes < 270 && store?.lastNightly !== date ? date : null;
}

// ---------------------------------------------------------------------------
// Learned memory rules
// ---------------------------------------------------------------------------

const SECRETISH = /\b(password|passcode|otp|pin|token|api[\s-]?key|secret|cvv)\b/i;

/** Cleans a memory item; returns { text } or { error }. Refuses secrets and other people's contact details. */
export function cleanMemoryText(input) {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { error: "Nothing to remember." };
  if (text.length > ITEM_TEXT_MAX) return { error: `Keep it under ${ITEM_TEXT_MAX} characters.` };
  if (SECRETISH.test(text)) return { error: "I don't store passwords, OTPs, keys or other secrets." };
  if (redactValueText(text) !== text) return { error: "I don't store email addresses, phone numbers or ID numbers in memory." };
  return { text };
}

export const memoryKey = (text) => fold(text).replace(/[^\p{L}\p{N} ]/gu, "");

/** Adds or refreshes an item in a list; keeps the newest `max`. Pure. */
export function addItem(list, item, max) {
  const key = memoryKey(item.text);
  const rest = (list || []).filter((x) => memoryKey(x.text) !== key);
  return [...rest, item].slice(-max);
}

/** Removes by id, else by matching text. Returns { list, removed }. */
export function removeItem(list, { id, text } = {}) {
  const items = list || [];
  let removed = [];
  if (id) removed = items.filter((x) => x.id === id);
  else if (text) {
    const k = memoryKey(text);
    removed = k ? items.filter((x) => memoryKey(x.text) === k || memoryKey(x.text).includes(k)) : [];
  }
  const ids = new Set(removed.map((x) => x.id));
  return { list: items.filter((x) => !ids.has(x.id)), removed };
}

export const KNOWN_AGENT_IDS = PORTAL_AGENTS.map((p) => p.id);

/** Status view for the admin screen: no raw text, only what each portal gave and when. Pure. */
export function publicSuperMemory(store, { building = false } = {}) {
  return {
    builtAt: store?.builtAt || null,
    lastNightly: store?.lastNightly || null,
    lastRun: store?.lastRun || null,
    building,
    links: store?.links || [],
    portals: Object.values(store?.portals || {}).map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      portal: p.portal,
      persona: p.persona,
      status: p.status,
      fetchedAt: p.fetchedAt || null,
      actions: p.actions || [],
      gaps: p.gaps || [],
      collections: (p.collections || []).length,
      vocabularies: (p.vocabularies || []).length,
      observations: (p.observations || []).length,
      rules: (p.rules || []).length,
    })),
  };
}
