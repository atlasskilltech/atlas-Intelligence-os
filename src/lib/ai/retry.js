const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async call when it fails with a retryable AIError.
 * Exponential backoff with jitter; honours the provider's retry-after hint.
 */
export async function withRetry(fn, { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 20_000, sleep = defaultSleep, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!err?.retryable || attempt >= maxRetries) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
      const delay = Math.min(maxDelayMs, Math.max(backoff, err.retryAfterMs || 0));
      attempt += 1;
      onRetry?.({ attempt, delay, error: err });
      await sleep(delay);
    }
  }
}
