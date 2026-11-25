import { notFound } from "next/navigation";
import AgentDetail from "@/components/agents/AgentDetail";
import { connectorOptions, matchesConnector } from "@/components/agents/ConnectorFilter";
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
  const { saved, called: rawCalled, connector: rawConnector } = await searchParams;
  const rec = await load(id);
  if (!rec) notFound();
  const [recentRuns, projects] = await Promise.all([
    listRuns(await getPageActor(), { agentId: id, limit: 1000 }),
    projectStatusList(),
  ]);
  const projectCalls = sumProjectCalls(recentRuns);
  const nameOf = (pid) => projects.find((p) => p.id === pid)?.name || `${pid} (removed)`;

  // Runs-list filters (searched across recent runs, then the latest 10 shown):
  //   ?connector=<project>  runs that were allowed to use it
  //   ?called=<project>     runs that actually called it
  const { options: allConnectors, pick } = connectorOptions(projects, recentRuns);
  const connectorChoices = allConnectors.filter((o) => recentRuns.some((r) => matchesConnector(r, o.id, projects)));
  const connector = connectorChoices.some((o) => o.id === pick(rawConnector)) ? pick(rawConnector) : null;
  const calledChoices = projectCalls.map((c) => ({ id: c.project, name: nameOf(c.project) })).sort((a, b) => a.name.localeCompare(b.name));
  const called = typeof rawCalled === "string" && calledChoices.some((o) => o.id === rawCalled) ? rawCalled : null;
  const runs = recentRuns
    .filter((r) => !connector || matchesConnector(r, connector, projects))
    .filter((r) => !called || r.projectCalls?.some((c) => c.project === called))
    .slice(0, 10);
  const runFilters = { connector, called, connectorChoices, calledChoices };
  const s = rec.config.trigger?.type === "schedule" ? rec.config.trigger.schedule : null;
  const schedule = s ? await scheduleInfo(id, s) : null;
  return <AgentDetail initial={rec} runs={runs} schedule={schedule} projects={projects} projectCalls={projectCalls} runFilters={runFilters} justSaved={saved === "active" || saved === "draft" ? saved : null} />;
}
