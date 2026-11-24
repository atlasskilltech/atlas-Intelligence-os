import { deleteAgent, getAgent, updateAgent } from "@/lib/agents/agentRepo";
import { getActor } from "@/lib/context";
import { BadRequest, fail, ok, readJsonBody } from "@/lib/http/respond";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ agent: await getAgent((await getActor()), id) });
  } catch (err) {
    return fail(err);
  }
}

/** PUT { agent, expectedUpdatedAt? } → { agent } */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request, 100_000);
    if (!body.agent || typeof body.agent !== "object") throw new BadRequest("Missing agent.");
    const rec = await updateAgent((await getActor()), id, body.agent, { expectedUpdatedAt: body.expectedUpdatedAt });
    return ok({ agent: rec });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    return ok(await deleteAgent((await getActor()), id));
  } catch (err) {
    return fail(err);
  }
}
