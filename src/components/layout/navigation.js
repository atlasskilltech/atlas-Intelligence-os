// Single source of truth for the sidebar. Add new pages here.
export const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview", icon: "home" },
      { href: "/agents/new", label: "Create Agent", icon: "sparkles" },
      { href: "/agents", label: "My Agents", icon: "bot" },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/runs", label: "Execution History", icon: "history" },
      { href: "/logs", label: "Execution Logs", icon: "terminal" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/connectors", label: "Connectors", icon: "plug" },
      { href: "/settings/models", label: "Model Settings", icon: "cpu" },
      { href: "/usage", label: "API Usage", icon: "chart" },
    ],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Longest matching nav item wins, so /agents/new highlights "Create Agent", not "My Agents". */
export function activeHref(pathname) {
  let best = null;
  for (const item of ALL_ITEMS) {
    const matches =
      item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

export function titleFor(pathname) {
  const href = activeHref(pathname);
  return ALL_ITEMS.find((i) => i.href === href)?.label ?? "ATLAS IntelligenceOS";
}
