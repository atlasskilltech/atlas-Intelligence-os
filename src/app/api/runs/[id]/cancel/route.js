import { cancelRun } from "@/lib/engine/runner";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";
import { publicRun } from "@/lib/runs/runRepo";

export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ run: publicRun(await cancelRun(getActor(), id)) });
  } catch (err) {
    return fail(err);
  }
}
