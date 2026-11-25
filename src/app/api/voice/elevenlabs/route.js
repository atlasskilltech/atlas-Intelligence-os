import { getElevenLabsCredits } from "@/lib/ai";
import { getAIEnv } from "@/lib/config/env";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

const MESSAGES = {
  auth: "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY on the server.",
  permission: "ElevenLabs blocked this account (free accounts are sometimes blocked when used from a server).",
  quota: "ElevenLabs credits are used up.",
  rate_limit: "ElevenLabs is busy. Try again in a moment.",
  timeout: "ElevenLabs took too long to respond.",
  connection: "Could not reach ElevenLabs from the server.",
};

/** GET → { configured, credits?, error? }  ElevenLabs credit balance for Model Settings. */
export async function GET() {
  try {
    await getActor();
    if (!getAIEnv().elevenlabsConfigured) return ok({ configured: false });
    try {
      return ok({ configured: true, credits: await getElevenLabsCredits() });
    } catch (err) {
      const type = err?.type || "server";
      return ok({ configured: true, error: { type, message: MESSAGES[type] || "Could not read the ElevenLabs balance." } });
    }
  } catch (err) {
    return fail(err);
  }
}
