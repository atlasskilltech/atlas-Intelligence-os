import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

/**
 * Does an agent (or run) use this connector?
 * `item` = { usesProjects, connectors } — connectors [] means "all connected projects",
 * which matches only projects that are connected now.
 */
export function matchesConnector(item, id, projects) {
  if (!item.usesProjects) return false;
  const ids = item.connectors || [];
  if (ids.length) return ids.includes(id);
  return projects.some((p) => p.id === id && p.usable);
}

/**
 * Filter options: every project, plus ids that items still point to after a
 * project was removed. Returns { options: [{ id, name }], names: Map, pick(raw) }.
 */
export function connectorOptions(projects, items = []) {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  for (const it of items) for (const id of it.connectors || []) if (!names.has(id)) names.set(id, `${id} (removed)`);
  return {
    options: [...names].map(([id, name]) => ({ id, name })),
    names,
    pick: (raw) => (typeof raw === "string" && names.has(raw) ? raw : null),
  };
}

/** "Connector: Any · CRM · ERP" chip row. `hrefFor(id | null)` builds each link. */
export default function ConnectorFilter({ options, current, hrefFor, className, label = "Connector", icon = "plug", scroll = true }) {
  if (!options.length) return null;
  return (
    <nav aria-label={`Filter by ${label.toLowerCase()}`} className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="mr-1 inline-flex items-center gap-1 font-medium text-slate-500">
        <Icon name={icon} className="size-3.5" />
        {label}:
      </span>
      {[{ id: null, name: "Any" }, ...options].map((c) => (
        <Link
          key={c.id || "any"}
          href={hrefFor(c.id)}
          scroll={scroll}
          aria-current={current === c.id ? "page" : undefined}
          className={cn(
            "max-w-[220px] truncate rounded-full px-2.5 py-1 ring-1 ring-inset",
            current === c.id ? "bg-brand-50 font-medium text-brand-700 ring-brand-500/40" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50",
          )}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
