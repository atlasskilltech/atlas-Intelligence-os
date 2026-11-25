import Link from "next/link";
import { connection } from "next/server";
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

export default async function RunsPage({ searchParams }) {
  await connection();
  const { status: raw } = await searchParams;
  const status = FILTERS.some((f) => f.id === raw) ? raw : "all";
  const [runs, projects] = await Promise.all([
    listRuns(await getPageActor(), { status: status === "all" ? undefined : status, limit: 200 }),
    projectStatusList(),
  ]);

  return (
    <>
      <PageHeader title="Execution History" description="Every agent run with its status, duration, actions and cost." />
      <nav aria-label="Filter runs" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/runs" : `/runs?status=${f.id}`}
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
      {runs.length === 0 ? (
        <EmptyState
          icon="history"
          title={status === "all" ? "No runs yet" : "No runs match this filter"}
          description="Open an agent and press Run test to see it work."
          action={status === "all" && <Button href="/agents" variant="secondary">Go to My Agents</Button>}
        />
      ) : (
        <RunTable runs={runs} projects={projects} />
      )}
    </>
  );
}
