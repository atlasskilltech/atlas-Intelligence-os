import { clearUserManifestCache } from "@/lib/connectors/projects/projectConnector";
import { deleteProject, getProject, publicProject, updateProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";

export const maxDuration = 60;

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ project: publicProject(await getProject(id)) });
  } catch (err) {
    return fail(err);
  }
}

/** PUT { name?, enabled?, key? } → { project }. A new key is checked with the project first. */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    clearUserManifestCache();
    return ok({ project: publicProject(await updateProject((await getActor()), id, body)) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    return ok(await deleteProject((await getActor()), id));
  } catch (err) {
    return fail(err);
  }
}
