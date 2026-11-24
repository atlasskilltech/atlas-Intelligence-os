import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";
import { listEvents } from "@/lib/runs/runRepo";

/** GET /api/logs?level=&runId=&limit= → { events } (newest first) */
export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 300));
    return ok({ events: await listEvents(getActor(), { limit, level: q.get("level") || undefined, runId: q.get("runId") || undefined }) });
  } catch (err) {
    return fail(err);
  }
}
