import { notFound } from "next/navigation";
import RunView from "@/components/runs/RunView";
import { getActor } from "@/lib/context";
import { reconcileStale } from "@/lib/engine/runner";
import { RunNotFound, getRun, publicRun } from "@/lib/runs/runRepo";

export const metadata = { title: "Run" };

export default async function RunPage({ params }) {
  const { id } = await params;
  try {
    await getRun(getActor(), id);
  } catch (err) {
    if (err instanceof RunNotFound) notFound();
    throw err;
  }
  const run = await reconcileStale(id);
  return <RunView initial={publicRun(run)} />;
}
