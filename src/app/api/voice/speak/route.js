import { synthesizeSpeech } from "@/lib/ai";
import { getActor } from "@/lib/context";
import { BadRequest, fail, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;

const TEXT_MAX = 4000;
const VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
const STYLE =
  "Speak as a warm, friendly and confident university assistant. Natural pace, clear pronunciation. " +
  "Pronounce Hindi and other Indian languages with a natural Indian accent.";

/**
 * POST { text, voice? } → audio/mpeg
 * Spoken by the provider chosen in Model Settings → Voice (OpenAI or ElevenLabs).
 * Headers: X-Voice-Provider (who actually spoke), X-Voice-Fallback: 1 when ElevenLabs failed.
 */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 40_000);
    const actor = await getActor();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new BadRequest("Nothing to speak.");
    const voice = VOICES.has(body.voice) ? body.voice : undefined;
    const res = await synthesizeSpeech(
      { text: text.slice(0, TEXT_MAX), voice, instructions: STYLE },
      { purpose: "voice", actorId: actor.id ?? null },
    );
    return new Response(res.audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(res.audio.length),
        "Cache-Control": "no-store",
        "X-Voice-Provider": res.provider,
        ...(res.fallback
          ? {
              "X-Voice-Fallback": "1",
              "X-Voice-Fallback-Reason": res.fallbackReason || "server",
              ...(res.fallbackDetail ? { "X-Voice-Fallback-Detail": encodeURIComponent(res.fallbackDetail) } : {}),
            }
          : {}),
      },
    });
  } catch (err) {
    return fail(err);
  }
}
