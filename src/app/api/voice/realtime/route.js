import { createRealtimeSession } from "@/lib/ai";
import { buildAssistantSetup, cleanProjectIds } from "@/lib/assistant/assistant";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 30;

const VOICES = new Set(["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"]);
const HINT = "ATLAS SkillTech University, IntelligenceOS, Agent A, agent, connector, CRM, admission.";

/**
 * POST { projects?: string[], language?: "hi"|"en"|…, voice? }
 *   → { clientSecret, expiresAt, model, callsUrl }
 *
 * Creates a short-lived OpenAI Realtime client secret for the browser's WebRTC
 * connection. Instructions and tools are the Home assistant's (read-only lookups
 * + build_agent); tool calls come back through /api/voice/realtime/tool, so
 * connector keys never reach the browser.
 */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 20_000);
    const actor = await getActor();
    const lang = typeof body.language === "string" && /^[a-z]{2}$/.test(body.language) ? body.language : null;
    const { system, tools } = await buildAssistantSetup({
      projectIds: cleanProjectIds(body.projects),
      mode: "auto",
      actor,
      voice: { language: lang, realtime: true },
    });

    const session = {
      type: "realtime",
      instructions: system,
      output_modalities: ["audio"],
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: { model: "gpt-4o-transcribe", prompt: HINT, ...(lang ? { language: lang } : {}) },
          // Semantic VAD: understands when the employee has finished a thought,
          // instead of cutting in after a fixed pause. Speaking interrupts the reply.
          turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
        },
        output: { voice: VOICES.has(body.voice) ? body.voice : "marin" },
      },
      ...(tools.length
        ? { tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })), tool_choice: "auto" }
        : {}),
    };

    const res = await createRealtimeSession(session);
    return ok({ clientSecret: res.value, expiresAt: res.expiresAt, model: res.model, callsUrl: res.callsUrl });
  } catch (err) {
    return fail(err);
  }
}
