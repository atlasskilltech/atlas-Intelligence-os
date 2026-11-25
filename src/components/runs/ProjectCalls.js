import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

/**
 * Adds up project calls across runs: [{ project, ok, failed, simulated }] per project.
 * `runs` are run summaries (each with `projectCalls`).
 */
export function sumProjectCalls(runs = []) {
  const byProject = new Map();
  for (const r of runs) {
    for (const c of r.projectCalls || []) {
      const t = byProject.get(c.project) || { project: c.project, ok: 0, failed: 0, simulated: 0 };
      t.ok += c.ok || 0;
      t.failed += c.failed || 0;
      t.simulated += c.simulated || 0;
      byProject.set(c.project, t);
    }
  }
  return [...byProject.values()];
}

const total = (c) => (c.ok || 0) + (c.failed || 0) + (c.simulated || 0);

function parts(c) {
  return [
    c.ok && `${c.ok} ok`,
    c.failed && `${c.failed} failed`,
    c.simulated && `${c.simulated} simulated`,
  ].filter(Boolean);
}

/**
 * The ATLAS projects a run actually called.
 * `calls` = [{ project, ok, failed, simulated, actions? }]; `projects` = [{ id, name }] for names.
 * Compact: one chip per project (history list). Otherwise: one row per project with its actions (run page).
 */
export default function ProjectCalls({ calls = [], projects = [], compact = false, showLabel = true, className }) {
  if (!calls.length) return null;
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const nameOf = (id) => names.get(id) || id;

  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
        {showLabel && <span className="text-slate-400">Called</span>}
        {calls.map((c) => (
          <span
            key={c.project}
            title={parts(c).join(" · ")}
            className={cn(
              "inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-0.5",
              c.failed ? "bg-red-50 text-red-700" : c.ok ? "bg-slate-100 text-slate-700" : "border border-dashed border-slate-300 bg-slate-50 text-slate-500",
            )}
          >
            <span className="truncate">{nameOf(c.project)}</span>
            <span className="shrink-0 tabular-nums opacity-70">×{total(c)}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <ul className={cn("space-y-3 text-sm", className)}>
      {calls.map((c) => (
        <li key={c.project}>
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <Icon name="plug" className="size-3.5 text-slate-400" />
            <span className="truncate">{nameOf(c.project)}</span>
            <span className="ml-auto shrink-0 text-xs font-normal tabular-nums text-slate-500">
              {total(c)} call{total(c) === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-0.5 text-xs">
            {parts(c).map((t, i) => (
              <span key={t} className={cn(t.includes("failed") ? "text-red-600" : t.includes("simulated") ? "text-slate-500" : "text-emerald-700")}>
                {i > 0 && <span className="text-slate-300"> · </span>}
                {t}
              </span>
            ))}
          </p>
          {c.actions?.length > 0 && <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{c.actions.join(", ")}</p>}
        </li>
      ))}
    </ul>
  );
}
