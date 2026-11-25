import { BUILD_AGENT_FN, cleanProjectIds, runAssistantTool } from "@/lib/assistant/assistant";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;

/**
 * POST { name, arguments: string (JSON), projects?: string[] } → { output }
 * Runs a tool call the Realtime model asked for. Only read-only lookups execute.
 */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 40_000);
    const actor = await getActor();
    const name = typeof body.name === "string" ? body.name : "";
    if (!name) throw new BadRequest("Missing tool name.");
    if (name === BUILD_AGENT_FN) {
      return ok({ output: JSON.stringify({ ok: true, note: "Tell the employee to tap 'Create agent' on screen to automate this." }) });
    }
    let args = {};
    try {
      args = typeof body.arguments === "string" ? JSON.parse(body.arguments || "{}") : body.arguments || {};
    } catch {
      return ok({ output: JSON.stringify({ ok: false, error: "Tool arguments were not valid JSON." }) });
    }
    const projectIds = cleanProjectIds(body.projects);
    const output = await runAssistantTool({ name, arguments: args }, { actor, allowed: projectIds ? new Set(projectIds) : null });
    return ok({ output });
  } catch (err) {
    return fail(err);
  }
}
