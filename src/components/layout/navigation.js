// Single source of truth for the sidebar. Add new pages here.
export const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/voice", label: "Voice Assistant", icon: "mic" },
  { href: "/agents", label: "My Agents", icon: "bot" },
  { href: "/runs", label: "Execution History", icon: "history" },
  { href: "/logs", label: "Execution Logs", icon: "terminal" },
  { href: "/connectors", label: "Connectors", icon: "plug" },
];

export const SECONDARY_NAV = [
  { href: "/settings/models", label: "Model Settings", icon: "cpu" },
  { href: "/settings/email", label: "Email sender", icon: "mail" },
  { href: "/usage", label: "API Usage", icon: "chart" },
  { href: "/settings/users", label: "Users", icon: "user", adminOnly: true },
];

const ALL_ITEMS = [...PRIMARY_NAV, ...SECONDARY_NAV, { href: "/agents/new", label: "New agent" }];

/** Longest matching item wins, so /agents/new is not treated as "My Agents". */
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
