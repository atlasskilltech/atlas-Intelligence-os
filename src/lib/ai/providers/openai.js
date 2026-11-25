import OpenAI from "openai";
import { AIError } from "../errors.js";

/**
 * OpenAI provider using the Chat Completions API. Chat Completions is
 * supported long-term by OpenAI and is also the format used by OpenRouter
 * and most local model servers, so this adapter can be reused for them.
 *
 * Retries are handled by our own retry layer (../retry.js), so the SDK's
 * built-in retries are disabled.
 */
export function createOpenAIProvider({ apiKey, baseURL, fetch } = {}) {
  if (!apiKey) {
    const fail = async () => {
      throw new AIError("not_configured", "OPENAI_API_KEY is empty", { provider: "openai" });
    };
    return {
      id: "openai",
      generateText: fail,
      generateStructured: fail,
      chatWithTools: fail,
      listModels: fail,
      transcribe: fail,
      speak: fail,
    };
  }

  const client = new OpenAI({ apiKey, baseURL, maxRetries: 0, ...(fetch ? { fetch } : {}) });

  async function complete(body, timeoutMs) {
    try {
      const res = await client.chat.completions.create(body, { timeout: timeoutMs ?? 60_000 });
      return normalizeResult(res);
    } catch (err) {
      throw toAIError(err);
    }
  }

  function baseBody({ model, messages, maxOutputTokens, reasoningEffort }) {
    const body = { model, messages: toOpenAIMessages(messages) };
    if (maxOutputTokens) body.max_completion_tokens = maxOutputTokens;
    if (reasoningEffort && supportsReasoningEffort(model)) body.reasoning_effort = reasoningEffort;
    return body;
  }

  return {
    id: "openai",

    generateText(opts) {
      return complete(baseBody(opts), opts.timeoutMs);
    },

    async generateStructured(opts) {
      const body = baseBody(opts);
      body.response_format = {
        type: "json_schema",
        json_schema: { name: opts.schemaName || "result", schema: opts.schema, strict: true },
      };
      const result = await complete(body, opts.timeoutMs);
      if (result.refusal) {
        throw new AIError("invalid_response", `Model refused: ${result.refusal}`, { provider: "openai" });
      }
      if (result.finishReason === "length") {
        throw new AIError("invalid_response", "Output was cut off (max tokens reached)", { provider: "openai" });
      }
      try {
        return { ...result, data: JSON.parse(result.text) };
      } catch {
        throw new AIError("invalid_response", "Model did not return valid JSON", { provider: "openai" });
      }
    },

    chatWithTools(opts) {
      const body = baseBody(opts);
      if (opts.tools?.length) {
        body.tools = opts.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = opts.toolChoice || "auto";
        body.parallel_tool_calls = false; // one action at a time: simpler approvals & logs
      }
      return complete(body, opts.timeoutMs);
    },

    /** Speech → text. `file` is a File/Blob; `language` (ISO-639-1) is optional — omit to auto-detect. */
    async transcribe({ file, model, language, prompt, timeoutMs }) {
      try {
        const body = { file, model };
        if (language) body.language = language;
        if (prompt) body.prompt = prompt;
        const res = await client.audio.transcriptions.create(body, { timeout: timeoutMs ?? 60_000 });
        return { text: String(res?.text || "").trim(), model, usage: normalizeAudioUsage(res?.usage) };
      } catch (err) {
        throw toAIError(err);
      }
    },

    /** Text → speech. Returns the raw MP3 bytes. */
    async speak({ text, model, voice, instructions, timeoutMs }) {
      try {
        const body = { model, voice, input: text, response_format: "mp3" };
        if (instructions && !/^tts-1/.test(model)) body.instructions = instructions;
        const res = await client.audio.speech.create(body, { timeout: timeoutMs ?? 60_000 });
        return { audio: Buffer.from(await res.arrayBuffer()), model, usage: { inputTokens: 0, outputTokens: 0 } };
      } catch (err) {
        throw toAIError(err);
      }
    },

    async listModels() {
      try {
        const ids = [];
        for await (const m of client.models.list()) ids.push(m.id);
        return ids.sort();
      } catch (err) {
        throw toAIError(err);
      }
    },
  };
}

/** Reasoning models (gpt-5 family, o-series) accept reasoning_effort; others reject it. */
export function supportsReasoningEffort(model) {
  return /^(gpt-5|o\d)/.test(model || "") && !/chat/.test(model);
}

// ---------- format conversion ----------

export function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: String(m.content ?? "") };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.rawArguments ?? JSON.stringify(c.arguments ?? {}) },
        })),
      };
    }
    return { role: m.role, content: String(m.content ?? "") };
  });
}

export function normalizeResult(res) {
  const choice = res.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  const toolCalls = (msg.tool_calls ?? [])
    .filter((c) => c.type === "function")
    .map((c) => {
      let args = null;
      try {
        args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = null; // engine reports invalid arguments back to the model
      }
      return { id: c.id, name: c.function.name, arguments: args, rawArguments: c.function.arguments };
    });
  const u = res.usage ?? {};
  return {
    text: msg.content ?? "",
    refusal: msg.refusal ?? null,
    toolCalls,
    finishReason: choice.finish_reason ?? null,
    model: res.model,
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
    },
  };
}

// ---------- error mapping ----------

function retryAfterMs(headers) {
  const get = (k) => (typeof headers?.get === "function" ? headers.get(k) : headers?.[k]);
  const ms = Number(get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(get("retry-after"));
  if (Number.isFinite(s) && s > 0) return s * 1000;
  return undefined;
}

function normalizeAudioUsage(u) {
  if (!u || u.type !== "tokens") return { inputTokens: 0, outputTokens: 0 };
  return { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 };
}

export function toAIError(err) {
  if (err instanceof AIError) return err;
  const opts = { provider: "openai", status: err?.status };
  const detail = err?.message || String(err);

  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AIError("timeout", detail, opts);
  if (err instanceof OpenAI.APIConnectionError) return new AIError("connection", detail, opts);
  if (err?.name === "AbortError") return new AIError("timeout", detail, opts);

  const status = err?.status;
  const code = err?.code || err?.error?.code;
  if (status === 401) return new AIError("auth", detail, opts);
  if (status === 403) return new AIError("permission", detail, opts);
  if (status === 404 || code === "model_not_found") return new AIError("model_not_found", detail, opts);
  if (status === 429) {
    if (code === "insufficient_quota") return new AIError("quota", detail, opts);
    return new AIError("rate_limit", detail, { ...opts, retryAfterMs: retryAfterMs(err?.headers) });
  }
  if (status === 408) return new AIError("timeout", detail, opts);
  if (status >= 500) return new AIError("server", detail, opts);
  if (status === 400 || status === 422) return new AIError("bad_request", detail, opts);
  return new AIError("server", detail, opts);
}
