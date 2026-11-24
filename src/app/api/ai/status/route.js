import { getAIStatus } from "@/lib/ai";
import { ok } from "@/lib/http/respond";
import { getModelSettings } from "@/lib/settings/modelSettings";

// Reports whether the AI provider is configured. Never returns the key itself.
export async function GET() {
  const settings = await getModelSettings();
  return ok({ ...getAIStatus(), defaultModel: settings.defaultModel, plannerModel: settings.plannerModel });
}
