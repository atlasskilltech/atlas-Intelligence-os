import { publicProject, syncProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

export const maxDuration = 60;

/** POST → re-reads what the key allows → { project } (status "error" + lastError if the project refused) */
export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ project: publicProject(await syncProject((await getActor()), id)) });
  } catch (err) {
    return fail(err);
  }
}
