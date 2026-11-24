import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import { getAIStatus } from "@/lib/ai";
import { listAgents } from "@/lib/agents/agentRepo";
import { getPageActor } from "@/lib/context";

export default async function DashboardLayout({ children }) {
  await connection(); // render per request: status reflects the live server config
  const ai = getAIStatus();
  const actor = await getPageActor();
  const recentAgents = (await listAgents(actor))
    .slice(0, 8)
    .map((a) => ({ id: a.id, name: a.config.name, status: a.status }));
  return (
    <AppShell
      aiConfigured={ai.configured}
      recentAgents={recentAgents}
      user={{ name: actor.name, email: actor.email, role: actor.role, picture: actor.picture || "", local: actor.local }}
    >
      {children}
    </AppShell>
  );
}
