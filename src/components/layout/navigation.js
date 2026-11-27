// Single source of truth for the sidebar. Add new pages here.
export const PRIMARY_NAV = [
  { href: "/voice", label: "Voice Agent", icon: "mic" },
  { href: "/connectors", label: "Plugins", icon: "plug" },
];

// Settings, Email sender, Usage and Account are tabs of the Settings popup (account menu).
export const SECONDARY_NAV = [];

/** "+ New" opens Home, where you either chat or build an agent. */
export const NEW_HREF = "/";

const ALL_ITEMS = [...PRIMARY_NAV, ...SECONDARY_NAV, { href: "/runs", label: "Execution" }, { href: "/agents", label: "All Agents" }, { href: NEW_HREF, label: "New" }, { href: "/agents/new", label: "New agent" }];

/** Longest matching item wins, so /agents/new is not treated as "All Agents". */
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
