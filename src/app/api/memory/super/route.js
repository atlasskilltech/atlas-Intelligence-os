import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { publicSuperMemory } from "@/lib/memory/memoryCore";
import { MemoryError } from "@/lib/memory/learnedMemory";
import { isBuilding, readSuperMemory, scheduleSuperMemory } from "@/lib/memory/superMemory";

const requireAdmin = async () => {
  const actor = await getActor();
  if (actor.role !== "admin") throw new MemoryError("Only administrators can see or rebuild the NEXUS super memory.", 403);
  return actor;
};

/** GET → { memory } NEXUS super memory status per portal (no raw data). Admin only. */
export async function GET() {
  try {
    await requireAdmin();
    return ok({ memory: publicSuperMemory(await readSuperMemory(), { building: isBuilding() }) });
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
