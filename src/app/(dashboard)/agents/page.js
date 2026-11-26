import Link from "next/link";
import { connection } from "next/server";
import AgentConnectors, { usesProjects } from "@/components/agents/AgentConnectors";
import AgentRowActions from "@/components/agents/AgentRowActions";
import { StatusBadge } from "@/components/agents/AgentStatus";
import ProjectCalls, { sumProjectCalls } from "@/components/runs/ProjectCalls";
import Button from "@/components/ui/Button";
import { fmtDateTime } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import LinkSelect from "@/components/ui/LinkSelect";
import PageHeader from "@/components/ui/PageHeader";
import SearchSelect from "@/components/ui/SearchSelect";
import { Alert, EmptyState } from "@/components/ui/States";
import StorageNotice from "@/components/ui/StorageNotice";
import { listAgents, summarize } from "@/lib/agents/agentRepo";
import { describeTrigger } from "@/lib/agents/schedule";
import { getTool } from "@/lib/catalog/toolCatalog";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";
import { listRuns } from "@/lib/runs/runRepo";
import { emailForActorId } from "@/lib/users/userRepo";

export const metadata = { title: "My Agents" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "draft", label: "Drafts" },
];

function listHref({ status, owner }) {
  const p = new URLSearchParams();
  if (status !== "all") p.set("status", status);
  if (owner && owner !== "mine") p.set("owner", owner); // "mine" is the default — keep the URL clean
  const qs = p.toString();
  return qs ? `/agents?${qs}` : "/agents";
}

export default async function AgentsPage({ searchParams }) {
  await connection();
  const { status: raw, owner: rawOwner, deleted } = await searchParams;
  const status = FILTERS.some((f) => f.id === raw) ? raw : "all";

  const actor = await getPageActor();
  const isAdmin = actor.role === "admin";
  const [records, projects, recentRuns] = await Promise.all([listAgents(actor), projectStatusList(), listRuns(actor, { limit: 1000 })]);
  const everything = records.map(summarize);

  // Who built each agent, keyed by email. Newer agents store ownerEmail; resolve older ones from the database.
  const ownerEmail = new Map();
  for (const a of everything) if (a.ownerId && a.ownerEmail && !ownerEmail.has(a.ownerId)) ownerEmail.set(a.ownerId, a.ownerEmail);
  const unresolved = [...new Set(everything.map((a) => a.ownerId))].filter((id) => id && !ownerEmail.has(id));
  for (const [id, email] of await Promise.all(unresolved.map(async (id) => [id, await emailForActorId(id)]))) if (email) ownerEmail.set(id, email);
  const ownerLabel = (id) => ownerEmail.get(id) || (id === actor.id ? actor.email || "You" : id);

  // "Created by" filter: your own agents by default; admins can switch to Everyone or one person (matched by email).
  const ownerIds = [...new Set(everything.map((a) => a.ownerId).filter(Boolean))];
  const owner = isAdmin ? (rawOwner === "all" ? "all" : ownerIds.includes(rawOwner) ? rawOwner : "mine") : "mine";
  const ownerOptions = isAdmin
    ? ownerIds
        .filter((id) => id !== actor.id)
        .map((id) => ({ id, label: ownerLabel(id) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];
  const ownerMatch = owner === "all" ? () => true : owner === "mine" ? (a) => a.ownerId === actor.id : (a) => a.ownerId === owner;
  const showOwner = (a) => owner === "all" || a.ownerId !== actor.id;

  // Projects each agent's runs actually called (from the run history) — shown per row, not a filter.
  const runsByAgent = new Map();
  for (const r of recentRuns) {
    if (!r.projectCalls?.length) continue;
    if (!runsByAgent.has(r.agentId)) runsByAgent.set(r.agentId, []);
    runsByAgent.get(r.agentId).push(r);
  }
  const calledBy = new Map([...runsByAgent].map(([id, list]) => [id, new Map(sumProjectCalls(list).map((c) => [c.project, c]))]));
  const callsOf = (agentId) => [...(calledBy.get(agentId)?.values() || [])];

  const hrefWith = (patch) => listHref({ status, owner, ...patch });

  const all = everything.filter(ownerMatch);
  const counts = { all: all.length, active: 0, paused: 0, draft: 0 };
  for (const a of all) counts[a.status] += 1;
  const agents = status === "all" ? all : all.filter((a) => a.status === status);

  const statusWord = status === "all" ? "" : `${FILTERS.find((f) => f.id === status).label.toLowerCase()} `;

  // Dropdown options (value / label / href) for the status and "Created by" filters.
  const statusSelectOptions = FILTERS.map((f) => ({ value: f.id, label: `${f.label} (${counts[f.id]})`, href: hrefWith({ status: f.id }) }));
  const ownerSelectOptions = [
    { value: "mine", label: "Mine", href: hrefWith({ owner: "mine" }) },
    { value: "all", label: "Everyone", href: hrefWith({ owner: "all" }) },
    ...ownerOptions.map((o) => ({ value: o.id, label: o.label, href: hrefWith({ owner: o.id }) })),
  ];

  return (
    <>
      <PageHeader
        title="My Agents"
        description="Your own agents by default. Admins can use “Created by” to see agents built by others."
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <LinkSelect id="status-filter" label="Show" icon="bot" value={status} options={statusSelectOptions} />
            {isAdmin && ownerOptions.length > 0 && (
              <SearchSelect id="owner-filter" label="Created by" icon="user" value={owner} options={ownerSelectOptions} placeholder="Search people…" />
            )}
          </div>

          {agents.length === 0 ? (
            <EmptyState icon="bot" title={`No ${statusWord}agents`} />
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
                    {(usesProjects(a.tools) || calledBy.has(a.id)) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {usesProjects(a.tools) && <AgentConnectors compact ids={a.connectors} projects={projects} />}
                        <ProjectCalls compact calls={callsOf(a.id)} projects={projects} />
                      </div>
                    )}
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {showOwner(a) && (
                        <span className="inline-flex items-center gap-1" title={`Built by ${ownerLabel(a.ownerId)}`}>
                          <Icon name="user" className="size-3.5" />
                          {ownerLabel(a.ownerId)}
                        </span>
                      )}
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
