import "server-only";
import { getAIEnv, getOpenAIKey, getSecretValues } from "../config/env.js";
import { getActor } from "../context.js";
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
 * @param {object} meta  { purpose: "planner"|"agent"|"test"|…, model?, agentId?, runId? }
 */
export async function callModel(method, opts, meta = {}) {
  const settings = await getModelSettings();
  const model = meta.model || (meta.purpose === "planner" ? settings.plannerModel : settings.defaultModel);
  const provider = getProvider();
  const actor = getActor();
  const started = Date.now();
  let retries = 0;

  const base = {
    provider: provider.id,
    model,
    purpose: meta.purpose || "other",
    agentId: meta.agentId ?? null,
    runId: meta.runId ?? null,
    actorId: actor.id,
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
      { maxRetries: settings.maxRetries, onRetry: () => (retries += 1) },
    );
    const costUsd = estimateCost(result.model || model, result.usage, settings.pricingOverrides);
    await recordUsage({
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
      await recordUsage({
        ...base,
        ok: false,
        errorType: aiErr.type,
        retries,
        latencyMs: Date.now() - started,
      }).catch(() => {});
      console.error(`[ai] ${method} failed (${aiErr.type}):`, redact(aiErr.detail, getSecretValues()));
    }
    throw aiErr;
  }
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
