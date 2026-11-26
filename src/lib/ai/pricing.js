/**
 * Estimated prices in USD per 1 million tokens.
 *
 * OpenAI changes prices — treat these as estimates and verify at
 * https://openai.com/api/pricing. Models not listed here (or overridden in
 * Model Settings) are tracked for tokens but show "price not set".
 */
export const DEFAULT_PRICING = {
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  // GPT-5.4 / 5.5 family — OpenAI list prices (openai.com/api/pricing, Nov 2026). Verify, they change.
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30 },
};

/** Finds a price for e.g. "gpt-4o-mini-2024-07-18" by stripping a date suffix. */
export function findPrice(model, overrides = {}) {
  const table = { ...DEFAULT_PRICING, ...overrides };
  if (table[model]) return table[model];
  const base = model?.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return table[base] || null;
}

/** Returns estimated cost in USD, or null when the model has no price set. */
export function estimateCost(model, usage, overrides) {
  const p = findPrice(model, overrides);
  if (!p || !usage) return null;
  const cached = usage.cachedInputTokens || 0;
  const uncached = Math.max(0, (usage.inputTokens || 0) - cached);
  const cost =
    (uncached * p.input + cached * (p.cachedInput ?? p.input) + (usage.outputTokens || 0) * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
