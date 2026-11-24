import { reconcileStale } from "@/lib/engine/runner";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";
import { getRun, publicRun } from "@/lib/runs/runRepo";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    await getRun((await getActor()), id); // permission check first
    const run = await reconcileStale(id);
    return ok({ run: publicRun(run) });
  } catch (err) {
    return fail(err);
  }
}
