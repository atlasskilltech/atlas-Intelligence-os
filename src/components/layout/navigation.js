// Single source of truth for the sidebar. Add new pages here.
export const PRIMARY_NAV = [
  { href: "/voice", label: "Voice Assistant", icon: "mic" },
  { href: "/agents", label: "My Agents", icon: "bot" },
  { href: "/runs", label: "Execution", icon: "history" },
  { href: "/connectors", label: "Connectors", icon: "plug" },
];

export const SECONDARY_NAV = [
  { href: "/settings/email", label: "Email sender", icon: "mail" },
];

/** "+ New" opens Home, where you either chat or build an agent. */
export const NEW_HREF = "/";

// Account, Settings and Usage live in the account menu (UserMenu), not the sidebar list.
const ACCOUNT_ITEMS = [
  { href: "/settings/users", label: "Account" },
  { href: "/settings/models", label: "Settings" },
  { href: "/usage", label: "Usage" },
];

const ALL_ITEMS = [...PRIMARY_NAV, ...SECONDARY_NAV, ...ACCOUNT_ITEMS, { href: NEW_HREF, label: "New" }, { href: "/agents/new", label: "New agent" }];

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
