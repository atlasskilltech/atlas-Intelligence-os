import Link from "next/link";
import { connection } from "next/server";
import ConnectorFilter, { connectorOptions, matchesConnector } from "@/components/agents/ConnectorFilter";
import RunTable from "@/components/runs/RunTable";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { projectStatusList } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";
import { listRuns } from "@/lib/runs/runRepo";

export const metadata = { title: "Execution History" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "waiting_approval", label: "Needs approval" },
  { id: "succeeded", label: "Succeeded" },
  { id: "failed", label: "Failed" },
];

const SHOW_MAX = 200;

function listHref(status, connector) {
  const q = new URLSearchParams();
  if (status !== "all") q.set("status", status);
  if (connector) q.set("connector", connector);
  const qs = q.toString();
  return qs ? `/runs?${qs}` : "/runs";
}

export default async function RunsPage({ searchParams }) {
  await connection();
  const { status: raw, connector: rawConnector } = await searchParams;
  const status = FILTERS.some((f) => f.id === raw) ? raw : "all";
  // Filter by connector before trimming to SHOW_MAX, so older matching runs still show up.
  const actor = await getPageActor();
  const [everything, found, projects] = await Promise.all([
    listRuns(actor, { limit: 1000 }), // filter options stay the same whatever the status filter
    status === "all" ? null : listRuns(actor, { status, limit: 1000 }),
    projectStatusList(),
  ]);
  const { options, names, pick } = connectorOptions(projects, everything);
  const connector = pick(rawConnector);
  const pool = found ?? everything;
  const runs = (connector ? pool.filter((r) => matchesConnector(r, connector, projects)) : pool).slice(0, SHOW_MAX);

  return (
    <>
      <PageHeader title="Execution History" description="Every agent run with its status, duration, actions and cost." />
      <nav aria-label="Filter runs" className="mb-3 flex flex-wrap gap-1.5">
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
            {f.label}
          </Link>
        ))}
      </nav>
      <ConnectorFilter className="mb-4" options={options} current={connector} hrefFor={(id) => listHref(status, id)} />
      {runs.length === 0 ? (
        <EmptyState
          icon="history"
          title={connector ? `No ${status === "all" ? "" : "matching "}runs with ${names.get(connector)}` : status === "all" ? "No runs yet" : "No runs match this filter"}
          description={connector ? "Runs from before connectors were recorded are not included." : "Open an agent and press Run test to see it work."}
          action={status === "all" && !connector && <Button href="/agents" variant="secondary">Go to My Agents</Button>}
        />
      ) : (
        <RunTable runs={runs} projects={projects} />
      )}
    </>
  );
}
