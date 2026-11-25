import { pushSnapshot } from "@/lib/connectors/projects/agentPush";
import { ProjectError, getProject, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

export const maxDuration = 60;

/** POST → sends every IntelligenceOS agent that uses this project to it now (§2c, admin) → { push, project } */
export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    const actor = await getActor();
    if (actor?.role !== "admin") throw new ProjectError("Only administrators can send agents to a project.", 403);
    const p = await getProject(id);
    if (!p.manifest?.intosAgents) throw new ProjectError(`${p.name} does not list IntelligenceOS agents.`, 400);
    const push = await pushSnapshot(id);
    if (!push) throw new ProjectError(`${p.name} is disabled or not connected. Re-check access first.`, 409);
    return ok({ push, project: publicProject(await getProject(id)) });
  } catch (err) {
    return fail(err);
  }
}
