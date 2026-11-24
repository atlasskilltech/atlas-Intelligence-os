import "server-only";
import { AIError } from "../ai/errors.js";

/** JSON helpers for route handlers. Errors never leak stack traces or secrets. */
export function ok(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(err, fallbackStatus = 500) {
  if (err instanceof AIError) {
    const status =
      { not_configured: 503, auth: 502, permission: 502, quota: 402, rate_limit: 429, model_not_found: 400, bad_request: 400 }[
        err.type
      ] || 502;
    return Response.json({ error: err.toJSON() }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (err?.publicMessage) {
    return Response.json(
      { error: { type: err.type || "bad_request", message: err.publicMessage, fields: err.fields } },
      { status: err.status || 400 },
    );
  }
  console.error("[api] unexpected error:", err?.message);
  return Response.json({ error: { type: "internal", message: "Something went wrong." } }, { status: fallbackStatus });
}

export class BadRequest extends Error {
  constructor(message, fields) {
    super(message);
    this.publicMessage = message;
    this.fields = fields;
    this.status = 400;
    this.type = "validation";
  }
}

export async function readJsonBody(request, maxBytes = 64_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new BadRequest("Request body is too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("Request body must be valid JSON.");
  }
}
