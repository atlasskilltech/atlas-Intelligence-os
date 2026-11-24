import AgentBuilder from "@/components/agents/AgentBuilder";

export const metadata = { title: "New agent" };

export default async function NewAgentPage({ searchParams }) {
  const { prompt } = await searchParams;
  const initial = typeof prompt === "string" ? prompt.trim().slice(0, 4000) : "";
  return <AgentBuilder initialPrompt={initial} />;
}
