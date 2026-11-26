import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import { getAIStatus } from "@/lib/ai";
import { listAgents } from "@/lib/agents/agentRepo";
import { listChats } from "@/lib/chats/chatRepo";
import { getPageActor } from "@/lib/context";

export default async function DashboardLayout({ children }) {
  await connection(); // render per request: status reflects the live server config
  const ai = getAIStatus();
  const actor = await getPageActor();
  const [agents, recentChats] = await Promise.all([listAgents(actor), listChats(actor, { limit: 50 })]);
  const recentAgents = agents.slice(0, 50).map((a) => ({ id: a.id, name: a.config.name, status: a.status, updatedAt: a.updatedAt }));
  return (
    <AppShell
      aiConfigured={ai.configured}
      recentAgents={recentAgents}
      recentChats={recentChats}
      user={{ name: actor.name, email: actor.email, role: actor.role, picture: actor.picture || "", local: actor.local }}
    >
      {children}
    </AppShell>
  );
}
