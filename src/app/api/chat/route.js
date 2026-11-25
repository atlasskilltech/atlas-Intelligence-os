import { MESSAGE_MAX, answerQuestion, cleanProjectIds } from "@/lib/assistant/assistant";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 120;

/**
 * POST { message, history?, projects?: string[], mode?: "auto" | "ask" | "agent", voice?: { language?: string } }
 *   → { route: "answer", answer, sources, meta }   a direct answer (read-only lookups)
 *   → { route: "agent", reason }                   this is work to automate: open the agent builder
 */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 200_000);
    const actor = await getActor();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new BadRequest("Type a question or a task.");
    if (message.length > MESSAGE_MAX) throw new BadRequest(`Message is too long (max ${MESSAGE_MAX} characters).`);
    const mode = ["auto", "ask", "agent"].includes(body.mode) ? body.mode : "auto";
    if (mode === "agent") return ok({ route: "agent", reason: "" });

    return ok(
      await answerQuestion({
        message,
        history: body.history,
        projectIds: cleanProjectIds(body.projects),
        mode,
        actor,
        voice: body.voice && typeof body.voice === "object" ? { language: body.voice.language } : null,
      }),
    );
  } catch (err) {
    return fail(err);
  }
}
