/**
 * ModelProvider interface (JSDoc only — every provider returns an object of this shape).
 *
 * Internal message format (provider-independent):
 *   { role: "system" | "user" | "assistant" | "tool",
 *     content: string,
 *     toolCalls?: [{ id, name, arguments }],   // assistant only
 *     toolCallId?: string }                     // tool only
 *
 * Internal tool format:
 *   { name, description, parameters }   // parameters = JSON Schema object
 *   Tool names must match /^[a-zA-Z0-9_-]{1,64}$/.
 *
 * Every call returns a ModelResult:
 *   { text, toolCalls: [{ id, name, arguments, rawArguments }], finishReason,
 *     model, usage: { inputTokens, outputTokens, cachedInputTokens, totalTokens } }
 *
 * @typedef {Object} ModelProvider
 * @property {string} id
 * @property {(opts: { model: string, messages: object[], maxOutputTokens?: number, timeoutMs?: number }) => Promise<object>} generateText
 * @property {(opts: { model: string, messages: object[], schema: object, schemaName: string, maxOutputTokens?: number, timeoutMs?: number }) => Promise<object>} generateStructured
 *           Result additionally has `data` (the parsed JSON object).
 * @property {(opts: { model: string, messages: object[], tools: object[], toolChoice?: "auto"|"none"|"required", maxOutputTokens?: number, timeoutMs?: number }) => Promise<object>} chatWithTools
 * @property {() => Promise<string[]>} listModels
 *
 * Errors are always thrown as AIError (see ./errors.js).
 *
 * Adding a provider later (Anthropic, Gemini, OpenRouter, local):
 *   1. Create providers/<name>.js returning this shape.
 *   2. Register it in ./index.js.
 */
export const PROVIDERS = ["openai"];
