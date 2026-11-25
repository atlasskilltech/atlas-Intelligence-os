import "server-only";
import { getAIEnv, getOpenAIKey, getSecretValues } from "../config/env.js";
import { redact } from "../security/redact.js";
import { getModelSettings } from "../settings/modelSettings.js";
import { recordUsage } from "../usage/usageStore.js";
import { AIError } from "./errors.js";
import { estimateCost } from "./pricing.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { withRetry } from "./retry.js";

/**
 * AI service — the ONLY entry point the rest of the app (planner, engine)
 * uses to talk to a model. It picks the provider and model, applies retries
 * and timeouts, and records token usage and cost for every call.
 */

let cached = null;

/** Usage logging must never break an AI call (e.g. read-only or full disk). */
async function safeRecordUsage(entry) {
  try {
    await recordUsage(entry);
  } catch (err) {
    console.error("[ai] could not record usage:", err?.code || err?.message);
  }
}

export function getProvider() {
  const key = getOpenAIKey();
  const { openaiBaseURL } = getAIEnv();
  const sig = `${key ? key.slice(-6) : ""}|${openaiBaseURL || ""}`;
  if (!cached || cached.sig !== sig) {
    cached = { sig, provider: createOpenAIProvider({ apiKey: key, baseURL: openaiBaseURL }) };
  }
  return cached.provider;
}

export function getAIStatus() {
  const env = getAIEnv();
  return { provider: "openai", configured: env.openaiConfigured, customBaseURL: Boolean(env.openaiBaseURL) };
}

/**
 * Call a model.
 * @param {"generateText"|"generateStructured"|"chatWithTools"} method
 * @param {object} opts  provider options (messages, schema, tools …)
 * @param {object} meta  { purpose: "planner"|"agent"|"test"|…, model?, agentId?, runId?, maxRetries? }
 */
export async function callModel(method, opts, meta = {}) {
  const settings = await getModelSettings();
  const model = meta.model || (meta.purpose === "planner" ? settings.plannerModel : settings.defaultModel);
  const provider = getProvider();
  const started = Date.now();
  let retries = 0;

  const base = {
    provider: provider.id,
    model,
    purpose: meta.purpose || "other",
    agentId: meta.agentId ?? null,
    runId: meta.runId ?? null,
    actorId: meta.actorId ?? null,
  };

  try {
    const result = await withRetry(
      () =>
        provider[method]({
          maxOutputTokens: settings.maxOutputTokens,
          timeoutMs: settings.requestTimeoutSec * 1000,
          ...opts,
          model,
        }),
      { maxRetries: meta.maxRetries ?? settings.maxRetries, onRetry: () => (retries += 1) },
    );
    const costUsd = estimateCost(result.model || model, result.usage, settings.pricingOverrides);
    await safeRecordUsage({
      ...base,
      responseModel: result.model,
      ok: true,
      ...result.usage,
      costUsd,
      retries,
      latencyMs: Date.now() - started,
    });
    return { ...result, costUsd, latencyMs: Date.now() - started, retries };
  } catch (err) {
    const aiErr = err instanceof AIError ? err : new AIError("server", err?.message);
    if (aiErr.type !== "not_configured") {
      await safeRecordUsage({
        ...base,
        ok: false,
        errorType: aiErr.type,
        retries,
        latencyMs: Date.now() - started,
      });
      console.error(`[ai] ${method} failed (${aiErr.type}):`, redact(aiErr.detail, getSecretValues()));
    }
    throw aiErr;
  }
}

/**
 * Voice: speech → text and text → speech. Same retry + usage logging as callModel,
 * with the models from OPENAI_STT_MODEL / OPENAI_TTS_MODEL (see config/env.js).
 */
async function callAudio(method, opts, model, meta = {}) {
  const settings = await getModelSettings();
  const provider = getProvider();
  const started = Date.now();
  let retries = 0;
  const base = { provider: provider.id, model, purpose: meta.purpose || "voice", agentId: null, runId: null, actorId: meta.actorId ?? null };
  try {
    const result = await withRetry(() => provider[method]({ timeoutMs: settings.requestTimeoutSec * 1000, ...opts, model }), {
      maxRetries: meta.maxRetries ?? Math.min(settings.maxRetries, 2),
      onRetry: () => (retries += 1),
    });
    await safeRecordUsage({ ...base, ok: true, ...result.usage, costUsd: null, retries, latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    const aiErr = err instanceof AIError ? err : new AIError("server", err?.message);
    if (aiErr.type !== "not_configured") {
      await safeRecordUsage({ ...base, ok: false, errorType: aiErr.type, retries, latencyMs: Date.now() - started });
      console.error(`[ai] ${method} failed (${aiErr.type}):`, redact(aiErr.detail, getSecretValues()));
    }
    throw aiErr;
  }
}

export function transcribeAudio({ file, language, prompt }, meta = {}) {
  return callAudio("transcribe", { file, language, prompt }, getAIEnv().sttModel, meta);
}

export function synthesizeSpeech({ text, voice, instructions }, meta = {}) {
  const env = getAIEnv();
  return callAudio("speak", { text, voice: voice || env.ttsVoice, instructions }, env.ttsModel, meta);
}

const REALTIME_MODELS = ["gpt-realtime-2.1", "gpt-realtime-2", "gpt-realtime-1.5", "gpt-realtime"];

/**
 * Creates a Realtime session for the browser. Tries OPENAI_REALTIME_MODEL, or the
 * newest known models in order, so an account without the newest one still works.
 * Returns { value, expiresAt, model, callsUrl }.
 */
export async function createRealtimeSession(session) {
  const env = getAIEnv();
  if (env.openaiBaseURL) {
    throw new AIError("bad_request", "Realtime voice needs api.openai.com (OPENAI_BASE_URL is set).", { provider: "openai" });
  }
  const provider = getProvider();
  const models = env.realtimeModel ? [env.realtimeModel] : REALTIME_MODELS;
  let lastErr;
  for (const model of models) {
    const body = { ...session, model };
    if (/^gpt-realtime-2/.test(model)) body.reasoning = { effort: "low" }; // fast replies
    try {
      const res = await withRetry(() => provider.createRealtimeSecret({ session: body }), { maxRetries: 1 });
      return { ...res, callsUrl: "https://api.openai.com/v1/realtime/calls" };
    } catch (err) {
      lastErr = err instanceof AIError ? err : new AIError("server", err?.message);
      if (!["model_not_found", "bad_request", "permission"].includes(lastErr.type)) break;
      console.error(`[ai] realtime model ${model} unavailable (${lastErr.type}):`, redact(lastErr.detail, getSecretValues()));
    }
  }
  throw lastErr;
}

/** Usage the browser reports at the end of each Realtime response (tokens only). */
export async function recordRealtimeUsage({ model, inputTokens, outputTokens }, meta = {}) {
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 1_000_000) : 0);
  await safeRecordUsage({
    provider: "openai",
    model: String(model || "realtime").slice(0, 80),
    purpose: "voice",
    actorId: meta.actorId ?? null,
    ok: true,
    inputTokens: n(inputTokens),
    outputTokens: n(outputTokens),
    costUsd: null,
    retries: 0,
    latencyMs: 0,
  });
}

/** Lists models the API key can use, filtered to chat-capable GPT/o-series models. */
export async function listAvailableModels() {
  const ids = await withRetry(() => getProvider().listModels(), { maxRetries: 2 });
  return ids.filter(
    (id) =>
      /^(gpt-|o\d|chatgpt-)/.test(id) &&
      !/(audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct)/.test(id),
  );
}
