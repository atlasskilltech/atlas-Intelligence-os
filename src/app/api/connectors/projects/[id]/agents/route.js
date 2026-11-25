import { agentOp, getMirror, refreshMirror } from "@/lib/connectors/projects/projectEvents";
import { getProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 120;

/** GET → the project's agents as last reported (?refresh=1 asks the project now, admin). */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const actor = await getActor();
    await getProject(id);
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return ok({ mirror: refresh ? await refreshMirror(actor, id) : await getMirror(id) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { agentId, op: "activate" | "deactivate" | "run" } → { agent, warnings, answer?, run? } (admin) */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    return ok(await agentOp(await getActor(), id, body.agentId, body.op));
  } catch (err) {
    return fail(err);
  }
}
