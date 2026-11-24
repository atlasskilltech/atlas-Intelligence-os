import "server-only";

/**
 * Central place for reading server environment variables.
 * Secrets are only returned by getOpenAIKey(), which only the provider calls.
 */
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function getOpenAIKey() {
  return clean(process.env.OPENAI_API_KEY);
}

export function getAIEnv() {
  return {
    openaiConfigured: Boolean(getOpenAIKey()),
    // Optional: an OpenAI-compatible endpoint (proxy, gateway). Leave empty for api.openai.com.
    openaiBaseURL: clean(process.env.OPENAI_BASE_URL),
    defaultModel: clean(process.env.OPENAI_DEFAULT_MODEL),
    plannerModel: clean(process.env.OPENAI_PLANNER_MODEL),
  };
}

export function getDataDir() {
  return clean(process.env.DATA_DIR) || "./data";
}

/** Values that must never appear in logs or responses. */
export function getSecretValues() {
  return [getOpenAIKey()].filter(Boolean);
}
