/** Turns a safeFetch response body into something compact for the model (JSON, or clipped text). */
const RESULT_TEXT_MAX = 6_000;

export function parseBody(res) {
  const type = String(res.contentType || "").toLowerCase();
  if (!res.body) return null;
  if (type.includes("json") && !res.truncated) {
    try {
      return JSON.parse(res.body);
    } catch {
      /* fall through to text */
    }
  }
  let text = res.body;
  if (type.includes("html")) {
    text = text
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text.length > RESULT_TEXT_MAX ? `${text.slice(0, RESULT_TEXT_MAX)}… [truncated]` : text;
}
