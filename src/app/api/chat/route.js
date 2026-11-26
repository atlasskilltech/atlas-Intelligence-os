import { MESSAGE_MAX, answerQuestion, cleanProjectIds } from "@/lib/assistant/assistant";
import { appendToChat } from "@/lib/chats/chatRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 120;

/**
 * POST { message, history?, projects?: string[], mode?: "auto" | "ask" | "agent", voice?: { language?: string }, chatId?, save? }
 *   → { route: "answer", answer, sources, meta, chat? }   a direct answer (read-only lookups)
 *     With save: true the question and answer are saved to the person's chat
 *     history (a new chat, or `chatId`); `chat` is its sidebar entry.
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

    const result = await answerQuestion({
      message,
      history: body.history,
      projectIds: cleanProjectIds(body.projects),
      mode,
      actor,
      voice: body.voice && typeof body.voice === "object" ? { language: body.voice.language } : null,
    });
    if (body.save === true && result.route === "answer") {
      try {
        result.chat = await appendToChat(actor, body.chatId, [
          { role: "user", content: message },
          { role: "assistant", content: result.answer, sources: result.sources },
        ]);
      } catch (err) {
        // The answer still goes back; only the history entry is missing.
        console.error("[chat] could not save chat:", err?.message);
      }
    }
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
