import { clearUserManifestCache } from "@/lib/connectors/projects/projectConnector";
import { dropMirror, registerEvents } from "@/lib/connectors/projects/projectEvents";
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
    const p = await updateProject((await getActor()), id, body);
    // A new key: register the event callback with it.
    if (body.key && p.manifest?.events) await registerEvents(id).catch(() => null);
    return ok({ project: publicProject(body.key && p.manifest?.events ? await getProject(id) : p) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const out = await deleteProject((await getActor()), id);
    await dropMirror(id).catch(() => null);
    return ok(out);
  } catch (err) {
    return fail(err);
  }
}
