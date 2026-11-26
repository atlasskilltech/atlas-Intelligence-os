import Link from "next/link";
import { connection } from "next/server";
import { connectorOptions, matchesConnector } from "@/components/agents/ConnectorFilter";
import RunTable from "@/components/runs/RunTable";
import { agentFilterOptions } from "@/components/runs/agentFilter";
import Button from "@/components/ui/Button";
import { fmtDateTime } from "@/components/ui/format";
import LinkSelect from "@/components/ui/LinkSelect";
import SearchSelect from "@/components/ui/SearchSelect";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { listAgents } from "@/lib/agents/agentRepo";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";
import { listEvents, listRuns } from "@/lib/runs/runRepo";
import { emailForActorId } from "@/lib/users/userRepo";

export const metadata = { title: "Execution" };

const TABS = [
  { id: "runs", label: "Runs" },
  { id: "logs", label: "Logs" },
];

const STATUS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "waiting_approval", label: "Needs approval" },
  { id: "succeeded", label: "Succeeded" },
  { id: "failed", label: "Failed" },
];

const LEVELS = [
  { id: "all", label: "All" },
  { id: "warning", label: "Warnings" },
  { id: "error", label: "Errors" },
];
const DOT = { info: "bg-slate-300", warning: "bg-amber-500", error: "bg-red-500" };

const SHOW_MAX = 200;

function runsHref({ status, agent, connector }) {
  const q = new URLSearchParams();
  if (status && status !== "all") q.set("status", status);
  if (agent) q.set("agent", agent);
  if (connector) q.set("connector", connector);
  const qs = q.toString();
  return qs ? `/runs?${qs}` : "/runs";
}

function logsHref({ level, agent }) {
  const q = new URLSearchParams();
  q.set("tab", "logs");
  if (level && level !== "all") q.set("level", level);
  if (agent) q.set("agent", agent);
  return `/runs?${q.toString()}`;
}

function TabNav({ tab }) {
  return (
    <nav aria-label="Execution view" className="mb-4 flex gap-1.5">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.id === "runs" ? "/runs" : "/runs?tab=logs"}
          aria-current={tab === t.id ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
            tab === t.id ? "bg-brand-500 text-white ring-brand-500" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function ExecutionPage({ searchParams }) {
  await connection();
  const sp = await searchParams;
  const tab = sp.tab === "logs" ? "logs" : "runs";
  const actor = await getPageActor();

  if (tab === "logs") {
    const level = LEVELS.some((l) => l.id === sp.level) ? sp.level : "all";
    const [agents, runsForNames] = await Promise.all([listAgents(actor), listRuns(actor, { limit: 1000 })]);
    const { options: agentOptions, pick, nameOf } = agentFilterOptions(agents, runsForNames);
    const agent = pick(sp.agent);
    const events = await listEvents(actor, { limit: 300, level: level === "all" ? undefined : level, agentId: agent || undefined });
    const href = (patch) => logsHref({ level, agent, ...patch });

    return (
      <>
        <PageHeader title="Execution" description="Agent runs and the step-by-step logs behind them." />
        <TabNav tab="logs" />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <LinkSelect
            id="logs-level"
            label="Show"
            icon="terminal"
            value={level}
            options={LEVELS.map((l) => ({ value: l.id, label: l.label, href: href({ level: l.id }) }))}
          />
          {agentOptions.length > 1 && (
            <SearchSelect
              id="logs-agent"
              label="Agent"
              icon="bot"
              value={agent || ""}
              placeholder="Search agents…"
              options={[{ id: "", name: "All agents" }, ...agentOptions].map((o) => ({ value: o.id, label: o.name, href: href({ agent: o.id || null }) }))}
            />
          )}
        </div>
        {events.length === 0 ? (
          <EmptyState
            icon="terminal"
            title={agent ? `No log entries for ${nameOf(agent)}` : "No log entries"}
            description={agent || level !== "all" ? "Try another filter." : "Logs appear here as soon as an agent runs."}
          />
        ) : (
          <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
            {events.map((e, i) => (
              <li key={`${e.runId}-${i}`} className="flex gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", DOT[e.level] || DOT.info)} />
                <div className="min-w-0 flex-1">
                  <p className={cn("break-words", e.level === "error" ? "text-red-700" : e.level === "warning" ? "text-amber-800" : "text-slate-700")}>
                    {e.message}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                    <span>{fmtDateTime(e.at)}</span>
                    <Link href={`/runs/${e.runId}`} className="hover:text-brand-600">
                      {e.agentName} · {e.mode === "test" ? "test run" : "run"}
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </>
    );
  }

  // --- Runs tab ---
  const status = STATUS.some((f) => f.id === sp.status) ? sp.status : "all";
  const [everything, found, projects, agents] = await Promise.all([
    listRuns(actor, { limit: 1000 }),
    status === "all" ? null : listRuns(actor, { status, limit: 1000 }),
    projectStatusList(),
    listAgents(actor),
  ]);

  const { options: agentOptions, pick: pickAgent, nameOf: agentNameOf } = agentFilterOptions(agents, everything);
  const agent = pickAgent(sp.agent);
  const { options, names, pick } = connectorOptions(projects, everything);
  const connector = pick(sp.connector);

  const hrefWith = (patch) => runsHref({ status, agent, connector, ...patch });
  const statusSelectOptions = STATUS.map((f) => ({ value: f.id, label: f.label, href: hrefWith({ status: f.id }) }));
  const pool = found ?? everything;
  const runs = pool
    .filter((r) => !agent || r.agentId === agent)
    .filter((r) => !connector || matchesConnector(r, connector, projects))
    .slice(0, SHOW_MAX);

  // Who created each run's agent (by email). Newer runs store it; resolve older ones.
  const ownerEmail = new Map();
  for (const r of runs) if (r.ownerId && r.ownerEmail && !ownerEmail.has(r.ownerId)) ownerEmail.set(r.ownerId, r.ownerEmail);
  const missing = [...new Set(runs.map((r) => r.ownerId))].filter((id) => id && !ownerEmail.has(id));
  for (const [id, email] of await Promise.all(missing.map(async (id) => [id, await emailForActorId(id)]))) if (email) ownerEmail.set(id, email);
  const runsWithOwner = runs.map((r) => ({ ...r, ownerEmail: r.ownerEmail || ownerEmail.get(r.ownerId) || null }));

  const agentName = agent && agentNameOf(agent);
  const emptyTitle =
    agent || connector
      ? `No ${status === "all" ? "" : "matching "}runs${agent ? ` of ${agentName}` : ""}${connector ? ` with ${names.get(connector)}` : ""}`
      : status === "all"
        ? "No runs yet"
        : "No runs match this filter";

  return (
    <>
      <PageHeader title="Execution" description="Agent runs and the step-by-step logs behind them." />
      <TabNav tab="runs" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <LinkSelect id="filter-status" label="Show" icon="history" value={status} options={statusSelectOptions} />
        {agentOptions.length > 1 && (
          <SearchSelect
            id="filter-agent"
            label="Agent"
            icon="bot"
            value={agent || ""}
            placeholder="Search agents…"
            options={[{ id: "", name: "All agents" }, ...agentOptions].map((o) => ({ value: o.id, label: o.name, href: hrefWith({ agent: o.id || null }) }))}
          />
        )}
        {options.length > 0 && (
          <SearchSelect
            id="filter-connector"
            label="Connector"
            icon="plug"
            value={connector || ""}
            placeholder="Search connectors…"
            options={[{ id: "", name: "Any connector" }, ...options].map((o) => ({ value: o.id, label: o.name, href: hrefWith({ connector: o.id || null }) }))}
          />
        )}
      </div>
      {runs.length === 0 ? (
        <EmptyState
          icon="history"
          title={emptyTitle}
          description={connector ? "Runs from before connectors were recorded are not included." : "Open an agent and press Run test to see it work."}
          action={status === "all" && !agent && !connector && <Button href="#agents" variant="secondary">Go to All Agents</Button>}
        />
      ) : (
        <RunTable runs={runsWithOwner} projects={projects} />
      )}
    </>
  );
}
