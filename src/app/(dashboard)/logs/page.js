import Link from "next/link";
import { connection } from "next/server";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { fmtDateTime } from "@/components/ui/format";
import { getActor } from "@/lib/context";
import { listEvents } from "@/lib/runs/runRepo";

export const metadata = { title: "Execution Logs" };

const LEVELS = [
  { id: "all", label: "All" },
  { id: "warning", label: "Warnings" },
  { id: "error", label: "Errors" },
];
const DOT = { info: "bg-slate-300", warning: "bg-amber-500", error: "bg-red-500" };

export default async function LogsPage({ searchParams }) {
  await connection();
  const { level: raw } = await searchParams;
  const level = LEVELS.some((l) => l.id === raw) ? raw : "all";
  const events = await listEvents(getActor(), { limit: 300, level: level === "all" ? undefined : level });

  return (
    <>
      <PageHeader
        title="Execution Logs"
        description="Every step agents took across all runs, newest first. Secrets are hidden. Open a run for its full timeline."
      />
      <nav aria-label="Filter logs" className="mb-4 flex flex-wrap items-center gap-1.5">
        {LEVELS.map((l) => (
          <Link
            key={l.id}
            href={l.id === "all" ? "/logs" : `/logs?level=${l.id}`}
            aria-current={level === l.id ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
              level === l.id ? "bg-brand-500 text-white ring-brand-500" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {l.label}
          </Link>
        ))}
        <Link href={level === "all" ? "/logs" : `/logs?level=${level}`} className="ml-auto text-sm font-medium text-brand-600 hover:underline">
          Refresh
        </Link>
      </nav>
      {events.length === 0 ? (
        <EmptyState icon="terminal" title="No log entries" description="Logs appear here as soon as an agent runs." />
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
