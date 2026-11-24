import { notFound } from "next/navigation";
import AgentDetail from "@/components/agents/AgentDetail";
import { AgentNotFound, getAgent } from "@/lib/agents/agentRepo";
import { getPageActor } from "@/lib/context";
import { listRuns } from "@/lib/runs/runRepo";

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
  const { saved } = await searchParams;
  const rec = await load(id);
  if (!rec) notFound();
  const runs = await listRuns((await getPageActor()), { agentId: id, limit: 10 });
  return <AgentDetail initial={rec} runs={runs} justSaved={saved === "active" || saved === "draft" ? saved : null} />;
}
