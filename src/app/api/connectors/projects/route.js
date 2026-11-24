import { connectProject, listProjects, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;

/** GET → { projects } (never the key; only its last 4 characters) */
export async function GET() {
  try {
    return ok({ projects: (await listProjects()).map(publicProject) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { name, baseUrl, key } → checks the key with the project, then saves → { project } */
export async function POST(request) {
  try {
    const body = await readJsonBody(request);
    const rec = await connectProject(getActor(), { name: body.name, baseUrl: body.baseUrl, key: body.key });
    return ok({ project: publicProject(rec) }, 201);
  } catch (err) {
    return fail(err);
  }
}
