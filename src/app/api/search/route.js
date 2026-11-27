import { listAgents } from "@/lib/agents/agentRepo";
import { searchChats } from "@/lib/chats/chatRepo";
import { getActor } from "@/lib/context";
import { fail, ok } from "@/lib/http/respond";

const LIMIT = 20;

/**
 * GET /api/search?q=<text>&type=all|chats|agents → { chats, agents }
 * Chats: your own (title or message text). Agents: the ones you can see
 * (admins: everyone's), by name or description. Empty q → the most recent.
 */
export async function GET(request) {
  try {
    const actor = await getActor();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    const type = ["chats", "agents"].includes(url.searchParams.get("type")) ? url.searchParams.get("type") : "all";
    const needle = q.trim().toLowerCase();

    const [chats, agents] = await Promise.all([
      type === "agents" ? [] : searchChats(actor, q, { limit: LIMIT }),
      type === "chats"
        ? []
        : listAgents(actor).then((list) =>
            list
              .filter((a) => !needle || `${a.config?.name || ""} ${a.config?.description || ""}`.toLowerCase().includes(needle))
              .slice(0, LIMIT)
              .map((a) => ({
                id: a.id,
                name: a.config?.name || a.id,
                description: a.config?.description || "",
                status: a.status,
                updatedAt: a.updatedAt,
                mine: a.ownerId === actor.id,
                ownerEmail: a.ownerId === actor.id ? "" : a.ownerEmail || "",
              })),
          ),
    ]);
    return ok({ chats, agents });
  } catch (err) {
    return fail(err);
  }
}
