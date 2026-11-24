/**
 * Provider-independent AI error. Every provider converts its own errors
 * into this shape so the rest of the app never depends on a vendor SDK.
 *
 * type:
 *   not_configured  – API key missing
 *   auth            – key invalid/revoked                (not retryable)
 *   permission      – key lacks access to model/feature  (not retryable)
 *   quota           – billing quota exhausted            (not retryable)
 *   rate_limit      – too many requests                  (retryable)
 *   timeout         – request took too long              (retryable)
 *   connection      – network problem                    (retryable)
 *   server          – provider 5xx                       (retryable)
 *   model_not_found – model name wrong or unavailable    (not retryable)
 *   bad_request     – invalid request                    (not retryable)
 *   invalid_response– model output unusable (bad JSON, refusal)
 */
const RETRYABLE = new Set(["rate_limit", "timeout", "connection", "server"]);

const FRIENDLY = {
  not_configured: "The AI provider is not configured. Add OPENAI_API_KEY to the server's .env.local file.",
  auth: "The AI provider rejected the API key. Check OPENAI_API_KEY on the server.",
  permission: "The API key does not have access to this model or feature.",
  quota: "The AI account has run out of credit or hit its spending limit.",
  rate_limit: "The AI provider is receiving too many requests. Please try again shortly.",
  timeout: "The AI provider took too long to respond.",
  connection: "Could not reach the AI provider. Check the server's internet connection.",
  server: "The AI provider had a temporary problem.",
  model_not_found: "The selected model is not available for this API key.",
  bad_request: "The AI provider rejected the request.",
  invalid_response: "The AI returned a response that could not be used.",
};

export class AIError extends Error {
  constructor(type, detail, { status, retryAfterMs, provider } = {}) {
    super(FRIENDLY[type] || "AI request failed.");
    this.name = "AIError";
    this.type = type;
    this.detail = detail; // technical detail — redact before showing
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.provider = provider;
    this.retryable = RETRYABLE.has(type);
  }

  /** Safe object for API responses. */
  toJSON() {
    return { type: this.type, message: this.message, retryable: this.retryable };
  }
}
