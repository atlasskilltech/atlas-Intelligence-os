import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";
import { listRuns } from "@/lib/runs/runRepo";

/** GET /api/runs?status=&agentId= → { runs: [summary] } */
export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    return ok({ runs: await listRuns(getActor(), { status: q.get("status") || undefined, agentId: q.get("agentId") || undefined }) });
  } catch (err) {
    return fail(err);
  }
}
