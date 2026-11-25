import { after } from "next/server";
import { setAgentStatus } from "@/lib/agents/agentRepo";
import { pushAgentChange } from "@/lib/connectors/projects/agentPush";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

/** POST { action: "activate" | "pause" | "resume" } → { agent } */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const agent = await setAgentStatus((await getActor()), id, body.action);
    after(() => pushAgentChange(agent));
    return ok({ agent });
  } catch (err) {
    return fail(err);
  }
}
