import { notFound } from "next/navigation";
import AgentDetail from "@/components/agents/AgentDetail";
import { sumProjectCalls } from "@/components/runs/ProjectCalls";
import { AgentNotFound, getAgent } from "@/lib/agents/agentRepo";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";
import { listRuns } from "@/lib/runs/runRepo";
import { scheduleInfo } from "@/lib/scheduler/scheduler";

async function load(id) {
  try {
    return await getAgent((await getPageActor()), id);
  } catch (err) {
    if (err instanceof AgentNotFound) return null;
    throw err;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const rec = await load(id);
  return { title: rec ? rec.config.name : "Agent not found" };
}

export default async function AgentPage({ params, searchParams }) {
  const { id } = await params;
  const { saved, called: rawCalled } = await searchParams;
  const rec = await load(id);
  if (!rec) notFound();
  const [recentRuns, projects] = await Promise.all([
    listRuns(await getPageActor(), { agentId: id, limit: 1000 }),
    projectStatusList(),
  ]);
  const projectCalls = sumProjectCalls(recentRuns);
  // ?called=<project>: only runs that called that project (searched across recent runs, then the latest 10 shown).
  const called = typeof rawCalled === "string" && projectCalls.some((c) => c.project === rawCalled) ? rawCalled : null;
  const runs = (called ? recentRuns.filter((r) => r.projectCalls?.some((c) => c.project === called)) : recentRuns).slice(0, 10);
  const s = rec.config.trigger?.type === "schedule" ? rec.config.trigger.schedule : null;
  const schedule = s ? await scheduleInfo(id, s) : null;
  return <AgentDetail initial={rec} runs={runs} schedule={schedule} projects={projects} projectCalls={projectCalls} called={called} justSaved={saved === "active" || saved === "draft" ? saved : null} />;
}
