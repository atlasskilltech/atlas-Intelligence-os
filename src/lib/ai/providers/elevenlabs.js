import { AIError } from "../errors.js";

/**
 * ElevenLabs provider — text-to-speech only (the voice assistant's spoken replies),
 * plus a read of the account's credit balance for Model Settings.
 * Uses plain fetch, so no extra package is needed.
 */
const API = "https://api.elevenlabs.io";

export function createElevenLabsProvider({ apiKey, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey) {
    const fail = async () => {
      throw new AIError("not_configured", "ELEVENLABS_API_KEY is empty", { provider: "elevenlabs" });
    };
    return { id: "elevenlabs", speak: fail, getCredits: fail };
  }

  async function request(path, init, timeoutMs) {
    let res;
    try {
      res = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: { "xi-api-key": apiKey, ...(init?.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs ?? 60_000),
      });
    } catch (err) {
      const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new AIError(timeout ? "timeout" : "connection", err?.message || String(err), { provider: "elevenlabs" });
    }
    if (!res.ok) throw await toAIError(res);
    return res;
  }

  return {
    id: "elevenlabs",

    /** → { audio: Buffer (mp3), model, usage, characters } */
    async speak({ text, voiceId, model, timeoutMs }) {
      const res = await request(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: model }),
        },
        timeoutMs,
      );
      const audio = Buffer.from(await res.arrayBuffer());
      return { audio, model, usage: { inputTokens: 0, outputTokens: 0 }, characters: text.length };
    },

    /** Credit balance → { tier, used, limit, remaining, percentUsed, resetsAt, status } */
    async getCredits({ timeoutMs } = {}) {
      const res = await request("/v1/user/subscription", { method: "GET" }, timeoutMs ?? 15_000);
      return normalizeCredits(await res.json().catch(() => ({})));
    },
  };
}

export function normalizeCredits(sub) {
  const used = Math.max(0, Number(sub?.character_count) || 0);
  const limit = Math.max(0, Number(sub?.character_limit) || 0);
  const reset = Number(sub?.next_character_count_reset_unix);
  return {
    tier: typeof sub?.tier === "string" ? sub.tier : "unknown",
    status: typeof sub?.status === "string" ? sub.status : null,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentUsed: limit > 0 ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 100,
    resetsAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
  };
}

/** ElevenLabs errors look like { detail: { status: "quota_exceeded", message } } (or detail as a string). */
export async function toAIError(res) {
  const body = await res.json().catch(() => null);
  const d = body?.detail;
  const code = String((d && typeof d === "object" ? d.status || d.code : "") || "").toLowerCase();
  const detail = (d && typeof d === "object" ? d.message : d) || `HTTP ${res.status}`;
  const opts = { provider: "elevenlabs", status: res.status };
  const s = res.status;

  if (/quota|credit|limit_reached|insufficient/.test(code)) return new AIError("quota", detail, opts);
  if (/unusual_activity|free_users_not_allowed|payment|subscription/.test(code)) return new AIError("permission", detail, opts);
  if (/voice_not_found|model_not_found/.test(code)) return new AIError("model_not_found", detail, opts);
  if (s === 401) return new AIError("auth", detail, opts);
  if (s === 402) return new AIError("quota", detail, opts);
  if (s === 403) return new AIError("permission", detail, opts);
  if (s === 404) return new AIError("model_not_found", detail, opts);
  if (s === 429) {
    const ra = Number(res.headers.get("retry-after"));
    return new AIError("rate_limit", detail, { ...opts, retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined });
  }
  if (s === 408) return new AIError("timeout", detail, opts);
  if (s >= 500) return new AIError("server", detail, opts);
  return new AIError("bad_request", detail, opts);
}
