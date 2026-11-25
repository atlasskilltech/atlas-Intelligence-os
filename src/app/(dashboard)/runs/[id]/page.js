import { notFound } from "next/navigation";
import RunView from "@/components/runs/RunView";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";
import { reconcileStale } from "@/lib/engine/runner";
import { RunNotFound, getRun, publicRun } from "@/lib/runs/runRepo";

export const metadata = { title: "Run" };

export default async function RunPage({ params }) {
  const { id } = await params;
  try {
    await getRun((await getPageActor()), id);
  } catch (err) {
    if (err instanceof RunNotFound) notFound();
    throw err;
  }
  const [run, projects] = await Promise.all([reconcileStale(id), projectStatusList()]);
  return <RunView initial={publicRun(run)} projects={projects} />;
}
