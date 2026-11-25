import AgentBuilder from "@/components/agents/AgentBuilder";

export const metadata = { title: "New agent" };

export default async function NewAgentPage({ searchParams }) {
  const { prompt, projects } = await searchParams;
  const initial = typeof prompt === "string" ? prompt.trim().slice(0, 4000) : "";
  const picked =
    typeof projects === "string"
      ? [...new Set(projects.split(",").filter((id) => /^[A-Za-z0-9_-]{1,40}$/.test(id)))].slice(0, 30)
      : [];
  return <AgentBuilder initialPrompt={initial} initialProjects={picked} />;
}
