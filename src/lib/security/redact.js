/**
 * Remove secrets from text before it is logged or sent to the browser.
 * Masks known secret values plus common key/token patterns.
 */
const PATTERNS = [
  /sk-[A-Za-z0-9_\-]{8,}/g, // OpenAI-style keys
  /(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi,
  /([?&](?:api[_-]?key|token|access_token|key)=)[^&\s]+/gi,
];

export function redact(text, secretValues = []) {
  if (text == null) return text;
  let out = String(text);
  for (const s of secretValues) {
    if (s && s.length >= 6) out = out.split(s).join("[REDACTED]");
  }
  out = out.replace(PATTERNS[0], "[REDACTED]");
  out = out.replace(PATTERNS[1], "$1[REDACTED]");
  out = out.replace(PATTERNS[2], "$1[REDACTED]");
  return out;
}
