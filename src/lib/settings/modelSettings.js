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

/** Who speaks the voice assistant's replies. OpenAI is always the fallback. */
export const VOICE_PROVIDERS = ["openai", "elevenlabs"];

/** ElevenLabs models offered in Model Settings (any valid model id can also be typed). */
export const ELEVENLABS_MODELS = [
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — fastest, fewer credits (Hindi, English, Tamil + 29 more)" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — natural quality (Hindi, English, Tamil + 26 more)" },
  { id: "eleven_v3", label: "v3 — most languages incl. Marathi, Bengali, Gujarati (slower)" },
];
const VOICE_ID_RE = /^[A-Za-z0-9]{10,40}$/;
export const MAX_ELEVENLABS_VOICES = 10;
const ELEVEN_MODEL_RE = /^[a-z0-9_]{3,60}$/;

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
    inrPerUsd: 88, // ₹ per US$1, used to show costs in rupees alongside dollars
    voiceProvider: "openai",
    // ElevenLabs voice + model: set in Model Settings; ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL are only the initial values.
    elevenlabsVoiceId: env.elevenlabsVoiceId, // the voice in use
    elevenlabsVoices: [], // saved voices [{ id, name }] to switch between
    elevenlabsModel: env.elevenlabsModel,
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
  if (patch.voiceProvider !== undefined) {
    if (!VOICE_PROVIDERS.includes(patch.voiceProvider)) errors.voiceProvider = "Choose OpenAI or ElevenLabs.";
    else value.voiceProvider = patch.voiceProvider;
  }
  if (patch.elevenlabsVoiceId !== undefined) {
    const v = typeof patch.elevenlabsVoiceId === "string" ? patch.elevenlabsVoiceId.trim() : "";
    if (!VOICE_ID_RE.test(v)) errors.elevenlabsVoiceId = "Paste the Voice ID from ElevenLabs (letters and numbers, e.g. pNInz6obpgDQGcFmaJgB).";
    else value.elevenlabsVoiceId = v;
  }
  if (patch.elevenlabsVoices !== undefined) {
    const list = patch.elevenlabsVoices;
    const out = [];
    if (!Array.isArray(list) || list.length > MAX_ELEVENLABS_VOICES) errors.elevenlabsVoices = `Save up to ${MAX_ELEVENLABS_VOICES} voices.`;
    else {
      for (const v of list) {
        const id = typeof v?.id === "string" ? v.id.trim() : "";
        const name = typeof v?.name === "string" ? v.name.trim().replace(/\s+/g, " ") : "";
        if (!VOICE_ID_RE.test(id)) {
          errors.elevenlabsVoices = `"${id || "(empty)"}" is not a valid Voice ID.`;
          break;
        }
        if (!name || name.length > 60) {
          errors.elevenlabsVoices = "Give every voice a name (up to 60 characters).";
          break;
        }
        if (out.some((o) => o.id === id)) {
          errors.elevenlabsVoices = `Voice ID ${id} is added twice.`;
          break;
        }
        out.push({ id, name });
      }
      value.elevenlabsVoices = out;
    }
  }
  if (!errors.elevenlabsVoices && !errors.elevenlabsVoiceId && value.elevenlabsVoices?.length && value.elevenlabsVoiceId) {
    if (!value.elevenlabsVoices.some((v) => v.id === value.elevenlabsVoiceId)) errors.elevenlabsVoiceId = "Choose one of the saved voices.";
  }
  if (patch.elevenlabsModel !== undefined) {
    const v = typeof patch.elevenlabsModel === "string" ? patch.elevenlabsModel.trim() : "";
    if (!ELEVEN_MODEL_RE.test(v)) errors.elevenlabsModel = "Choose an ElevenLabs model.";
    else value.elevenlabsModel = v;
  }
  if (patch.inrPerUsd !== undefined) {
    const n = Number(patch.inrPerUsd);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) errors.inrPerUsd = "Enter a valid ₹ per $1 rate.";
    else value.inrPerUsd = Math.round(n * 100) / 100;
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
