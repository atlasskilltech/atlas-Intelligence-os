import { callModel } from "@/lib/ai";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

const MODEL_RE = /^[A-Za-z0-9._:\/-]{1,100}$/;

/** Sends a tiny fixed prompt to check the key, model and connection end to end. */
export async function POST(request) {
  try {
    const body = await readJsonBody(request);
    if (body.model !== undefined && (typeof body.model !== "string" || !MODEL_RE.test(body.model))) {
      throw new BadRequest("Invalid model name.");
    }
    const result = await callModel(
      "generateText",
      {
        messages: [
          { role: "system", content: "You are a connection test. Follow the instruction exactly." },
          { role: "user", content: "Reply with exactly: ATLAS IntelligenceOS connection OK" },
        ],
        maxOutputTokens: 1000,
      },
      { purpose: "test", model: body.model },
    );
    return ok({
      ok: true,
      model: result.model,
      text: String(result.text).slice(0, 500),
      usage: result.usage,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
      retries: result.retries,
    });
  } catch (err) {
    return fail(err);
  }
}
