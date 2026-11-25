import Link from "next/link";
import { connection } from "next/server";
import AgentConnectors, { usesProjects } from "@/components/agents/AgentConnectors";
import AgentRowActions from "@/components/agents/AgentRowActions";
import { StatusBadge } from "@/components/agents/AgentStatus";
import Button from "@/components/ui/Button";
import { fmtDateTime } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { Alert, EmptyState } from "@/components/ui/States";
import StorageNotice from "@/components/ui/StorageNotice";
import { cn } from "@/components/ui/cn";
import { listAgents, summarize } from "@/lib/agents/agentRepo";
import { describeTrigger } from "@/lib/agents/schedule";
import { getTool } from "@/lib/catalog/toolCatalog";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "My Agents" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "draft", label: "Drafts" },
];

/** Does the agent use this connector? Unlocked agents use every connected project. */
function usesConnector(a, id, projects) {
  if (!usesProjects(a.tools)) return false;
  if (a.connectors.length) return a.connectors.includes(id);
  return projects.some((p) => p.id === id && p.usable);
}

function listHref(status, connector) {
  const q = new URLSearchParams();
  if (status !== "all") q.set("status", status);
  if (connector) q.set("connector", connector);
  const qs = q.toString();
  return qs ? `/agents?${qs}` : "/agents";
}

export default async function AgentsPage({ searchParams }) {
  await connection();
  const { status: raw, connector: rawConnector, deleted } = await searchParams;
  const status = FILTERS.some((f) => f.id === raw) ? raw : "all";

  const [records, projects] = await Promise.all([listAgents(await getPageActor()), projectStatusList()]);
  const everything = records.map(summarize);

  // Connector filter options: every project, plus ids agents still point to after a project was removed.
  const names = new Map(projects.map((p) => [p.id, p.name]));
  for (const a of everything) for (const id of a.connectors) if (!names.has(id)) names.set(id, `${id} (removed)`);
  const connectorOptions = [...names].map(([id, name]) => ({ id, name }));
  const connector = typeof rawConnector === "string" && names.has(rawConnector) ? rawConnector : null;

  const all = connector ? everything.filter((a) => usesConnector(a, connector, projects)) : everything;
  const counts = { all: all.length, active: 0, paused: 0, draft: 0 };
  for (const a of all) counts[a.status] += 1;
  const agents = status === "all" ? all : all.filter((a) => a.status === status);

  return (
    <>
      <PageHeader
        title="My Agents"
        description="Run, pause, resume, edit or delete the agents you have created."
        actions={
          <Button href="/agents/new">
            <Icon name="plus" className="size-4" />
            Create agent
          </Button>
        }
      />
      <StorageNotice>
        Saved agents are kept in the server&apos;s temporary folder on Vercel and can disappear when it restarts. The
        always-on server deployment keeps them; permanent storage comes with the database.
      </StorageNotice>
      {deleted && (
        <Alert tone="success" className="mb-4">
          Agent deleted.
        </Alert>
      )}

      {everything.length === 0 ? (
        <EmptyState
          icon="bot"
          title="No agents yet"
          description="Describe a task in plain language and IntelligenceOS builds the agent for you."
          action={<Button href="/agents/new">Create your first agent</Button>}
        />
      ) : (
        <>
          <nav aria-label="Filter agents" className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={listHref(f.id, connector)}
                aria-current={status === f.id ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
                  status === f.id ? "bg-brand-500 text-white ring-brand-500" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {f.label} <span className={status === f.id ? "text-white/80" : "text-slate-400"}>{counts[f.id]}</span>
              </Link>
            ))}
          </nav>

          {connectorOptions.length > 0 && (
            <nav aria-label="Filter by connector" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="mr-1 inline-flex items-center gap-1 font-medium text-slate-500">
                <Icon name="plug" className="size-3.5" />
                Connector:
              </span>
              {[{ id: null, name: "Any" }, ...connectorOptions].map((c) => (
                <Link
                  key={c.id || "any"}
                  href={listHref(status, c.id)}
                  aria-current={connector === c.id ? "page" : undefined}
                  className={cn(
                    "max-w-[220px] truncate rounded-full px-2.5 py-1 ring-1 ring-inset",
                    connector === c.id ? "bg-brand-50 font-medium text-brand-700 ring-brand-500/40" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          )}

          {agents.length === 0 ? (
            <EmptyState
              icon="bot"
              title={
                connector
                  ? `No ${status === "all" ? "" : `${FILTERS.find((f) => f.id === status).label.toLowerCase()} `}agents use ${names.get(connector)}`
                  : `No ${FILTERS.find((f) => f.id === status).label.toLowerCase()} agents`
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {agents.map((a) => (
                <li key={a.id} className="flex flex-col gap-3 px-4 py-4 hover:bg-slate-50/60 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/agents/${a.id}`} className="truncate font-semibold text-ink hover:text-brand-600">
                        {a.name}
                      </Link>
                      <StatusBadge status={a.status} />
                    </div>
                    {a.description && <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{a.description}</p>}
                    {usesProjects(a.tools) && <AgentConnectors compact className="mt-1.5" ids={a.connectors} projects={projects} />}
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="clock" className="size-3.5" />
                        {describeTrigger(a.trigger)}
                      </span>
                      <span>
                        {a.stepCount} step{a.stepCount === 1 ? "" : "s"}
                        {a.tools.length > 0 && ` · ${[...new Set(a.tools.map((t) => getTool(t)?.connectorName))].join(", ")}`}
                      </span>
                      {a.approvals > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Icon name="shield" className="size-3.5" />
                          {a.approvals} approval{a.approvals === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>Updated {fmtDateTime(a.updatedAt)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Button href={`/agents/${a.id}`} variant="secondary" size="sm">
                      Open
                    </Button>
                    <AgentRowActions id={a.id} name={a.name} status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
