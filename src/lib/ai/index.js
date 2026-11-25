import "server-only";
import { getAIEnv, getElevenLabsKey, getOpenAIKey, getSecretValues } from "../config/env.js";
import { redact } from "../security/redact.js";
import { getModelSettings } from "../settings/modelSettings.js";
import { recordUsage } from "../usage/usageStore.js";
import { AIError } from "./errors.js";
import { estimateCost } from "./pricing.js";
import { createElevenLabsProvider } from "./providers/elevenlabs.js";
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

let cachedEleven = null;
export function getElevenLabsProvider() {
  const key = getElevenLabsKey();
  const sig = key ? key.slice(-6) : "";
  if (!cachedEleven || cachedEleven.sig !== sig) cachedEleven = { sig, provider: createElevenLabsProvider({ apiKey: key }) };
  return cachedEleven.provider;
}

export function getAIStatus() {
  const env = getAIEnv();
  return {
    provider: "openai",
    configured: env.openaiConfigured,
    customBaseURL: Boolean(env.openaiBaseURL),
    elevenlabsConfigured: env.elevenlabsConfigured,
    elevenlabsModel: env.elevenlabsModel,
  };
}

/** ElevenLabs credit balance (for Model Settings). Throws AIError when not configured or unreachable. */
export async function getElevenLabsCredits() {
  try {
    return await getElevenLabsProvider().getCredits();
  } catch (err) {
    const aiErr = err instanceof AIError ? err : new AIError("server", err?.message);
    if (aiErr.type !== "not_configured") console.error(`[ai] elevenlabs credits failed (${aiErr.type}):`, redact(aiErr.detail, getSecretValues()));
    throw aiErr;
  }
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
async function callAudio(method, opts, model, meta = {}, provider = getProvider()) {
  const settings = await getModelSettings();
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

/**
 * Text → speech with the provider chosen in Model Settings (voiceProvider).
 * ElevenLabs: if it fails for any reason (credits used up, key wrong, outage) the
 * same text is spoken with OpenAI, so the voice assistant never goes silent.
 * → { audio, provider: "openai"|"elevenlabs", fallback: boolean, fallbackReason? }
 */
export async function synthesizeSpeech({ text, voice, instructions }, meta = {}) {
  const env = getAIEnv();
  const settings = await getModelSettings();
  let fallbackReason;
  if (settings.voiceProvider === "elevenlabs") {
    if (env.elevenlabsConfigured) {
      try {
        const res = await callAudio(
          "speak",
          { text, voiceId: settings.elevenlabsVoiceId },
          settings.elevenlabsModel,
          { ...meta, maxRetries: meta.maxRetries ?? 1 },
          getElevenLabsProvider(),
        );
        return { ...res, provider: "elevenlabs", fallback: false };
      } catch (err) {
        fallbackReason = err?.type || "server";
      }
    } else {
      fallbackReason = "not_configured";
    }
  }
  const res = await callAudio("speak", { text, voice: voice || env.ttsVoice, instructions }, env.ttsModel, meta);
  return { ...res, provider: "openai", fallback: Boolean(fallbackReason), ...(fallbackReason ? { fallbackReason } : {}) };
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
