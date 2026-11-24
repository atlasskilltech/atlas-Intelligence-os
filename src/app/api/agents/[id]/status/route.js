import { setAgentStatus } from "@/lib/agents/agentRepo";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

/** POST { action: "activate" | "pause" | "resume" } → { agent } */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    return ok({ agent: await setAgentStatus((await getActor()), id, body.action) });
  } catch (err) {
    return fail(err);
  }
}
