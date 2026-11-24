import { notFound } from "next/navigation";
import AgentDetail from "@/components/agents/AgentDetail";
import { AgentNotFound, getAgent } from "@/lib/agents/agentRepo";
import { getActor } from "@/lib/context";

async function load(id) {
  try {
    return await getAgent(getActor(), id);
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
  return <AgentDetail initial={rec} justSaved={saved === "active" || saved === "draft" ? saved : null} />;
}
