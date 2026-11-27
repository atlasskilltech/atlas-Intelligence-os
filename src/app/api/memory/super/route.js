import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { listProjects } from "@/lib/connectors/projects/projectRepo";
import { memoryActionsFor, publicSuperMemory } from "@/lib/memory/memoryCore";
import { MemoryError } from "@/lib/memory/learnedMemory";
import { isBuilding, readSuperMemory, scheduleSuperMemory, setRunAs } from "@/lib/memory/superMemory";

const requireAdmin = async () => {
  const actor = await getActor();
  if (actor.role !== "admin") throw new MemoryError("Only administrators can see or rebuild the NEXUS super memory.", 403);
  return actor;
};

/** GET → { memory, projects } super-memory status per portal (no raw data) + each project's "runs as". Admin only. */
export async function GET() {
  try {
    await requireAdmin();
    const projects = (await listProjects())
      .map((p) => ({ id: p.id, name: p.name, delegated: !!p.delegated, runAs: p.superMemoryRunAs || "", actions: memoryActionsFor(p).actions }))
      .filter((p) => p.actions.length);
    return ok({ memory: publicSuperMemory(await readSuperMemory(), { building: isBuilding() }), projects });
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST { refreshPortals?: boolean } → starts a rebuild in the background → { started: true }. Admin only.
 * refreshPortals (default off) first asks each portal to rebuild its own memory (<agent>_memory?refresh=1).
 */
export async function POST(request) {
  try {
    await requireAdmin();
    const body = await readJsonBody(request, 2_000);
    scheduleSuperMemory({ reason: "manual", refreshPortals: body.refreshPortals === true });
    return ok({ started: true }, 202);
  } catch (err) {
    return fail(err);
  }
}

/** PATCH { projectId, runAs } → sets the email the super-memory fetch sends as X-IntelligenceOS-User ("" clears). Admin only. */
export async function PATCH(request) {
  try {
    const actor = await requireAdmin();
    const body = await readJsonBody(request, 2_000);
    return ok(await setRunAs(actor, String(body.projectId || ""), body.runAs));
  } catch (err) {
    return fail(err);
  }
}
