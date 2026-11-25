import { clearUserManifestCache } from "@/lib/connectors/projects/projectConnector";
import { pushSnapshot } from "@/lib/connectors/projects/agentPush";
import { registerEvents } from "@/lib/connectors/projects/projectEvents";
import { getProject, publicProject, syncProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

export const maxDuration = 60;

/** POST → re-reads what the key allows → { project } (status "error" + lastError if the project refused) */
export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    clearUserManifestCache();
    const p = await syncProject((await getActor()), id);
    // Re-checking access also re-registers the event callback (new APP_URL, lost secret …).
    if (p.status === "connected" && p.manifest?.events) await registerEvents(id).catch(() => null);
    // …and re-sends our agents to projects that list them (§2c).
    if (p.status === "connected" && p.manifest?.intosAgents) await pushSnapshot(id).catch(() => null);
    return ok({ project: publicProject(p.manifest?.events || p.manifest?.intosAgents ? await getProject(id) : p) });
  } catch (err) {
    return fail(err);
  }
}
