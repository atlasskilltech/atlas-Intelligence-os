import { after } from "next/server";
import { decideApproval, executeRun } from "@/lib/engine/runner";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { publicRun } from "@/lib/runs/runRepo";

export const maxDuration = 300;

/** POST { decision: "approve" | "reject", note? } → { run }; the run continues in the background. */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const run = await decideApproval((await getActor()), id, { decision: body.decision, note: body.note });
    after(() => executeRun(run.id));
    return ok({ run: publicRun(run) });
  } catch (err) {
    return fail(err);
  }
}
