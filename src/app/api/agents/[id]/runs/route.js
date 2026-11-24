import { after } from "next/server";
import { executeRun, startRun } from "@/lib/engine/runner";
import { getActor } from "@/lib/context";
import { fail, ok, readJsonBody } from "@/lib/http/respond";
import { listRuns, publicRun } from "@/lib/runs/runRepo";

// The run continues after the response; allow the platform up to 5 minutes (Vercel).
// On an always-on server there is no limit (the agent's own time limit applies).
export const maxDuration = 300;

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    return ok({ runs: await listRuns((await getActor()), { agentId: id, limit: 20 }) });
  } catch (err) {
    return fail(err);
  }
}

/** POST { mode: "test" | "live", input? } → { run } (202); the run executes in the background. */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const run = await startRun((await getActor()), id, { mode: body.mode === "live" ? "live" : "test", input: body.input, trigger: "manual" });
    after(() => executeRun(run.id));
    return ok({ run: publicRun(run) }, 202);
  } catch (err) {
    return fail(err);
  }
}
