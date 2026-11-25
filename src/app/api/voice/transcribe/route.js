import { transcribeAudio } from "@/lib/ai";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok } from "@/lib/http/respond";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // ~10 min of compressed speech; OpenAI accepts up to 25 MB
const AUDIO_TYPE = /^(audio|video)\/(webm|ogg|mp4|mpeg|mp3|m4a|x-m4a|wav|x-wav|aac)/;
const EXT = { webm: "webm", ogg: "ogg", mp4: "mp4", mpeg: "mp3", mp3: "mp3", m4a: "m4a", "x-m4a": "m4a", wav: "wav", "x-wav": "wav", aac: "m4a" };

// Domain words that help the speech model spell names correctly.
const HINT = "ATLAS SkillTech University, IntelligenceOS, agent, connector, CRM, admission, Hindi, English.";

/**
 * POST multipart/form-data { audio: Blob, language?: "hi" | "en" | … }
 *   → { text }   the words spoken (language auto-detected when not given)
 */
export async function POST(request) {
  try {
    const actor = await getActor();
    let form;
    try {
      form = await request.formData();
    } catch {
      throw new BadRequest("Send the recording as multipart/form-data.");
    }
    const audio = form.get("audio");
    if (!audio || typeof audio === "string") throw new BadRequest("No audio was received.");
    if (audio.size < 800) return ok({ text: "" }); // too short to be speech
    if (audio.size > MAX_BYTES) throw new BadRequest("The recording is too long. Please keep it under a few minutes.");
    const type = String(audio.type || "audio/webm").toLowerCase();
    const m = type.match(AUDIO_TYPE);
    if (!m) throw new BadRequest("Unsupported audio format.");

    const lang = String(form.get("language") || "").trim().toLowerCase();
    const file = new File([await audio.arrayBuffer()], `speech.${EXT[m[2]] || "webm"}`, { type: type.split(";")[0] });
    const res = await transcribeAudio(
      { file, language: /^[a-z]{2}$/.test(lang) ? lang : undefined, prompt: HINT },
      { purpose: "voice", actorId: actor.id ?? null },
    );
    return ok({ text: res.text.slice(0, 4000) });
  } catch (err) {
    return fail(err);
  }
}
