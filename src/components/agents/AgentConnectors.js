import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

/** Does this agent use ATLAS projects at all? */
export const usesProjects = (tools = []) => tools.some((id) => id.startsWith("atlas_project."));

/**
 * The connectors (ATLAS projects) an agent is locked to, as chips.
 * `ids` = config.connectors.projects (empty = all connected projects);
 * `projects` = [{ id, name, usable }] from the server, for names and status.
 */
export default function AgentConnectors({ ids = [], projects = [], className, compact = false }) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  if (!ids.length) {
    const live = projects.filter((p) => p.usable);
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          <Icon name="plug" className="size-3" />
          All connected projects
        </span>
        {!compact && live.length > 0 && (
          <span className="text-xs text-slate-400">
            ({live.map((p) => p.name).join(", ")})
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {ids.map((id) => {
        const p = byId.get(id);
        const ok = p?.usable;
        return (
          <span
            key={id}
            title={ok ? "Connected" : p ? "Not connected right now — steps using it are skipped" : "This project was removed"}
            className={cn(
              "inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              ok ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700",
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-brand-500" : "bg-amber-500")} />
            <span className="truncate">{p?.name || id}</span>
            {!ok && <span className="shrink-0">· {p ? "not connected" : "removed"}</span>}
          </span>
        );
      })}
    </div>
  );
}
