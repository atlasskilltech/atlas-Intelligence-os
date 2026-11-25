import Link from "next/link";
import { fmtDateTime, fmtDuration, fmtUsd } from "@/components/ui/format";
import AgentConnectors from "@/components/agents/AgentConnectors";
import ProjectCalls from "./ProjectCalls";
import { ModeBadge, RunStatusBadge } from "./RunStatus";

const dur = (r) => (r.startedAt && r.finishedAt ? Date.parse(r.finishedAt) - Date.parse(r.startedAt) : null);

/**
 * Run summaries as a responsive list. `showAgent` hides the agent column on an agent's own page.
 * With `projects` ([{ id, name, usable }]), each run shows the connectors it could use.
 */
export default function RunTable({ runs, showAgent = true, projects = null }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
      {runs.map((r) => (
        <li key={r.id}>
          <Link href={`/runs/${r.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {showAgent && <span className="truncate font-semibold text-ink">{r.agentName}</span>}
                <RunStatusBadge status={r.status} />
                <ModeBadge mode={r.mode} />
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {r.error ? <span className="text-red-600">{r.error}</span> : r.reportTitle ? `Report: ${r.reportTitle}` : r.id}
              </p>
              {projects && (r.usesProjects || r.projectCalls?.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {r.usesProjects && <AgentConnectors compact ids={r.connectors} projects={projects} />}
                  <ProjectCalls compact calls={r.projectCalls} projects={projects} />
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-x-4 text-xs text-slate-500 sm:justify-end">
              <span>{fmtDateTime(r.createdAt)}</span>
              <span>{fmtDuration(dur(r))}</span>
              <span>
                {r.actions} action{r.actions === 1 ? "" : "s"}
              </span>
              <span>{r.priced === false && !r.costUsd ? "cost —" : fmtUsd(r.costUsd)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
