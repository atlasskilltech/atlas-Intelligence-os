import { recordRealtimeUsage } from "@/lib/ai";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

/** POST { model, inputTokens, outputTokens } — token usage of one Realtime response, for API Usage. */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 4_000);
    const actor = await getActor();
    await recordRealtimeUsage(
      { model: body.model, inputTokens: Number(body.inputTokens), outputTokens: Number(body.outputTokens) },
      { actorId: actor.id ?? null },
    );
    return ok({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
