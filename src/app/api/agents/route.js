import { createAgent, listAgents, summarize } from "@/lib/agents/agentRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

/** GET /api/agents?status=active → { agents: [summary] } */
export async function GET(request) {
  try {
    const status = new URL(request.url).searchParams.get("status") || undefined;
    const agents = await listAgents(getActor(), { status });
    return ok({ agents: agents.map(summarize) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { agent, activate? } → { agent: record } (201) */
export async function POST(request) {
  try {
    const body = await readJsonBody(request, 100_000);
    if (!body.agent || typeof body.agent !== "object") throw new BadRequest("Missing agent.");
    const rec = await createAgent(getActor(), body.agent, { activate: body.activate === true });
    return ok({ agent: rec }, 201);
  } catch (err) {
    return fail(err);
  }
}
