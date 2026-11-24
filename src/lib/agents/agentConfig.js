import { z } from "zod";
import { RISK_LEVELS, TOOL_IDS, getTool } from "../catalog/toolCatalog.js";
import { DAYS, DEFAULT_TIMEZONE, FREQUENCIES, normalizeSchedule } from "./schedule.js";

/**
 * Agent configuration: the contract between the planner (Milestone 3),
 * storage (Milestone 4) and the execution engine (Milestone 5).
 * Pure module — used on both client (editing) and server (validation).
 */

export const LIMITS = {
  name: 80,
  description: 400,
  instructions: 6000,
  stepTitle: 120,
  stepText: 600,
  maxPlanSteps: 12,
  note: 300,
  maxNotes: 8,
};

export const DEFAULT_RUN_LIMITS = { maxSteps: 15, timeoutMinutes: 5 };

// ---------------------------------------------------------------------------
// 1) JSON schema the model must fill (OpenAI Structured Outputs, strict mode:
//    every property required, additionalProperties false, nullable via type arrays).
// ---------------------------------------------------------------------------
const str = (description) => ({ type: "string", description });
const strList = (description) => ({ type: "array", description, items: { type: "string" } });

export const PLANNER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "instructions", "steps", "trigger", "missingCapabilities", "assumptions", "clarifyingQuestions"],
  properties: {
    name: str("Short agent name, 2-6 words, Title Case."),
    description: str("One or two plain-language sentences describing what the agent does."),
    instructions: str("Operating instructions written to the agent (second person)."),
    steps: {
      type: "array",
      description: "Ordered execution plan, 2-10 steps.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "details", "tool", "successCriteria"],
        properties: {
          title: str("Short imperative step title."),
          details: str("What exactly happens in this step, including decisions and error handling."),
          tool: {
            type: ["string", "null"],
            enum: [...TOOL_IDS, null],
            description: "Exact tool id from the catalog, or null for an AI-only step (analyse, compare, summarise, decide).",
          },
          successCriteria: str("How to verify this step succeeded."),
        },
      },
    },
    trigger: {
      type: "object",
      additionalProperties: false,
      required: ["type", "frequency", "time", "daysOfWeek", "dayOfMonth", "timezone"],
      properties: {
        type: { type: "string", enum: ["manual", "schedule", "webhook"] },
        frequency: { type: ["string", "null"], enum: [...FREQUENCIES, null] },
        time: { type: ["string", "null"], description: "24h HH:MM in the given timezone, or null." },
        daysOfWeek: { type: "array", items: { type: "string", enum: DAYS } },
        dayOfMonth: { type: ["integer", "null"], description: "1-28 for monthly schedules, else null." },
        timezone: str(`IANA timezone, default ${DEFAULT_TIMEZONE}.`),
      },
    },
    missingCapabilities: strList("Capabilities the task needs that no catalog tool provides. Empty if none."),
    assumptions: strList("Assumptions you made where the request was unclear."),
    clarifyingQuestions: strList("Questions the employee should answer to improve the agent. Max 3."),
  },
};

// ---------------------------------------------------------------------------
// 2) Normalised agent config (what the app stores and runs).
// ---------------------------------------------------------------------------
const stepSchema = z.object({
  id: z.string().regex(/^s\d{1,3}$/),
  title: z.string().trim().min(1).max(LIMITS.stepTitle),
  details: z.string().max(LIMITS.stepText),
  tool: z.enum(TOOL_IDS).nullable(),
  successCriteria: z.string().max(LIMITS.stepText),
  requiresApproval: z.boolean(),
});

const scheduleSchema = z.object({
  frequency: z.enum(FREQUENCIES),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  daysOfWeek: z.array(z.enum(DAYS)),
  dayOfMonth: z.number().int().min(1).max(28).nullable(),
  timezone: z.string().min(1),
  cron: z.string().min(9),
});

export const agentConfigSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1, "Give the agent a name.").max(LIMITS.name),
  description: z.string().max(LIMITS.description),
  instructions: z.string().trim().min(1, "Instructions are required.").max(LIMITS.instructions),
  steps: z.array(stepSchema).min(1, "Add at least one step.").max(LIMITS.maxPlanSteps),
  tools: z.array(z.enum(TOOL_IDS)),
  trigger: z.object({
    type: z.enum(["manual", "schedule", "webhook"]),
    schedule: scheduleSchema.nullable(),
  }),
  permissions: z.object({
    toolsRequiringApproval: z.array(z.enum(TOOL_IDS)),
  }),
  limits: z.object({
    maxSteps: z.number().int().min(1).max(30),
    timeoutMinutes: z.number().int().min(1).max(15),
  }),
  notes: z.object({
    missingCapabilities: z.array(z.string().max(LIMITS.note)).max(LIMITS.maxNotes),
    assumptions: z.array(z.string().max(LIMITS.note)).max(LIMITS.maxNotes),
    clarifyingQuestions: z.array(z.string().max(LIMITS.note)).max(LIMITS.maxNotes),
  }),
  source: z.object({ prompt: z.string().max(4000) }),
});

// ---------------------------------------------------------------------------
// 3) Normaliser: turns model output OR an edited draft into a valid config.
//    Security-relevant fields (tools, approvals, limits) are computed here by
//    code — the model cannot grant itself tools or skip approvals.
// ---------------------------------------------------------------------------
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const clipList = (v) =>
  (Array.isArray(v) ? v : [])
    .map((x) => clip(x, LIMITS.note))
    .filter(Boolean)
    .slice(0, LIMITS.maxNotes);

export function normalizeAgentConfig(raw, { prompt = "" } = {}) {
  const warnings = [];
  const notes = raw?.notes ?? {};
  const missing = clipList(raw?.missingCapabilities ?? notes.missingCapabilities);

  const steps = (Array.isArray(raw?.steps) ? raw.steps : [])
    .filter((s) => s && (s.title || s.details))
    .slice(0, LIMITS.maxPlanSteps)
    .map((s, i) => {
      let tool = s.tool ?? null;
      if (tool && !getTool(tool)) {
        warnings.push(`Removed unknown tool "${String(tool).slice(0, 60)}" from step ${i + 1}.`);
        missing.push(`Step ${i + 1} needs a tool that does not exist yet (${String(tool).slice(0, 60)}).`);
        tool = null;
      }
      return {
        id: `s${i + 1}`,
        title: clip(s.title || `Step ${i + 1}`, LIMITS.stepTitle),
        details: clip(s.details, LIMITS.stepText),
        tool,
        successCriteria: clip(s.successCriteria, LIMITS.stepText),
        requiresApproval: tool ? RISK_LEVELS[getTool(tool).risk].approval : false,
      };
    });

  const tools = [...new Set(steps.map((s) => s.tool).filter(Boolean))];

  const t = raw?.trigger ?? {};
  const type = ["manual", "schedule", "webhook"].includes(t.type) ? t.type : "manual";
  const schedule = type === "schedule" ? normalizeSchedule(t.schedule ?? t) : null;

  const config = {
    version: 1,
    name: clip(raw?.name, LIMITS.name) || "Untitled agent",
    description: clip(raw?.description, LIMITS.description),
    instructions: clip(raw?.instructions, LIMITS.instructions),
    steps,
    tools,
    trigger: { type, schedule },
    permissions: { toolsRequiringApproval: tools.filter((id) => RISK_LEVELS[getTool(id).risk].approval) },
    limits: { ...DEFAULT_RUN_LIMITS },
    notes: {
      missingCapabilities: [...new Set(missing)].slice(0, LIMITS.maxNotes),
      assumptions: clipList(raw?.assumptions ?? notes.assumptions),
      clarifyingQuestions: clipList(raw?.clarifyingQuestions ?? notes.clarifyingQuestions).slice(0, 3),
    },
    source: { prompt: clip(raw?.source?.prompt ?? prompt, 4000) },
  };

  // Keep an edited draft's limits if they are valid.
  const lim = raw?.limits;
  if (lim) {
    const ms = Number(lim.maxSteps);
    const to = Number(lim.timeoutMinutes);
    if (Number.isInteger(ms) && ms >= 1 && ms <= 30) config.limits.maxSteps = ms;
    if (Number.isInteger(to) && to >= 1 && to <= 15) config.limits.timeoutMinutes = to;
  }

  return { config, warnings };
}

/** Validates a normalised config. Returns { ok, errors: [{ path, message }] }. */
export function validateAgentConfig(config) {
  const r = agentConfigSchema.safeParse(config);
  if (r.success) return { ok: true, errors: [], value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
