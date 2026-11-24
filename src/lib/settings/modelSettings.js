import "server-only";
import { getAIEnv } from "../config/env.js";
import { readJson, writeJson } from "../storage/jsonFile.js";

/**
 * Model settings, stored in DATA_DIR/settings.json.
 * Env vars provide the initial defaults; the Model Settings page overrides them.
 */
const FILE = "settings.json";
const MODEL_RE = /^[A-Za-z0-9._:\/-]{1,100}$/;

export const FALLBACK_MODELS = { defaultModel: "gpt-5.4-mini", plannerModel: "gpt-5.5" };

export const LIMITS = {
  maxOutputTokens: { min: 256, max: 32_000 },
  requestTimeoutSec: { min: 10, max: 300 },
  maxRetries: { min: 0, max: 5 },
};

function defaults() {
  const env = getAIEnv();
  return {
    provider: "openai",
    defaultModel: env.defaultModel || FALLBACK_MODELS.defaultModel,
    plannerModel: env.plannerModel || FALLBACK_MODELS.plannerModel,
    maxOutputTokens: 4000,
    requestTimeoutSec: 60,
    maxRetries: 3,
    pricingOverrides: {},
  };
}

export async function getModelSettings() {
  const stored = await readJson(FILE, {});
  return { ...defaults(), ...(stored.models || {}) };
}

/** Validates a partial update. Returns { ok, errors, value }. */
export function validateModelSettings(patch) {
  const errors = {};
  const value = {};
  if (!patch || typeof patch !== "object") return { ok: false, errors: { _: "Invalid body" } };

  for (const key of ["defaultModel", "plannerModel"]) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== "string" || !MODEL_RE.test(patch[key].trim())) errors[key] = "Enter a valid model name.";
    else value[key] = patch[key].trim();
  }
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (!Number.isInteger(n) || n < min || n > max) errors[key] = `Must be a whole number from ${min} to ${max}.`;
    else value[key] = n;
  }
  if (patch.pricingOverrides !== undefined) {
    const p = patch.pricingOverrides;
    const out = {};
    if (!p || typeof p !== "object" || Array.isArray(p)) errors.pricingOverrides = "Invalid pricing.";
    else {
      for (const [model, price] of Object.entries(p)) {
        const nums = [price?.input, price?.output].map(Number);
        if (!MODEL_RE.test(model) || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) {
          errors.pricingOverrides = `Invalid price for "${model}".`;
          break;
        }
        out[model] = { input: nums[0], output: nums[1] };
      }
      value.pricingOverrides = out;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export async function updateModelSettings(patch) {
  const check = validateModelSettings(patch);
  if (!check.ok) return check;
  const stored = await readJson(FILE, {});
  stored.models = { ...(stored.models || {}), ...check.value };
  await writeJson(FILE, stored);
  return { ok: true, value: await getModelSettings() };
}
