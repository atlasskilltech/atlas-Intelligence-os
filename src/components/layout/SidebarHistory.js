"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { useHomeMode } from "./HomeMode";

// Dates are grouped on the India calendar so the server and browser agree.
const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Today / Yesterday / Previous 7 days / Previous 30 days / Older, newest first. */
export function groupByDay(items, dateOf) {
  const today = dayOf(new Date().toISOString());
  const groups = [];
  for (const item of items) {
    const iso = dateOf(item);
    const age = iso ? daysBetween(today, dayOf(iso)) : Infinity;
    const label = age <= 0 ? "Today" : age === 1 ? "Yesterday" : age <= 7 ? "Previous 7 days" : age <= 30 ? "Previous 30 days" : "Older";
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

const itemClass = (active) =>
  cn(
    "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
    active ? "bg-white/10 font-semibold text-white" : "text-white/65 hover:bg-white/8 hover:text-white",
  );

function Groups({ groups, render }) {
  return groups.map((g) => (
    <div key={g.label} className="mt-5 first:mt-6">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.label}</p>
      <ul className="space-y-px">{g.items.map(render)}</ul>
    </div>
  ));
}

/**
 * Sidebar history, like Claude: saved chats in Chat mode, agents in Agent mode,
 * grouped by day.
 */
export default function SidebarHistory({ recentAgents = [], onNavigate }) {
  const { mode, chats, removeChat } = useHomeMode();
  const pathname = usePathname();
  const router = useRouter();
  const [deleting, setDeleting] = useState(null);

  async function remove(chat) {
    if (!window.confirm(`Delete the chat "${chat.title}"?`)) return;
    setDeleting(chat.id);
    try {
      const res = await fetch(`/api/chats/${chat.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
      removeChat(chat.id);
      if (pathname === `/chat/${chat.id}`) router.push("/");
    } catch {
      window.alert("Couldn't delete the chat. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  if (mode === "agent") {
    if (recentAgents.length === 0) return <Empty text="Agents you create will appear here." />;
    return (
      <Groups
        groups={groupByDay(recentAgents, (a) => a.updatedAt)}
        render={(a) => {
          const href = `/agents/${a.id}`;
          const active = pathname === href;
          return (
            <li key={a.id} className="flex">
              <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    a.status === "active" ? "bg-brand-500" : a.status === "paused" ? "bg-amber-400" : "bg-white/30",
                  )}
                  title={a.status}
                />
                <span className="truncate">{a.name}</span>
              </Link>
            </li>
          );
        }}
      />
    );
  }

  if (chats.length === 0) return <Empty text="Your chats will appear here." />;
  return (
    <Groups
      groups={groupByDay(chats, (c) => c.updatedAt)}
      render={(c) => {
        const href = `/chat/${c.id}`;
        const active = pathname === href;
        return (
          <li key={c.id} className="group relative flex">
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={c.title}
              className={cn(itemClass(active), "pr-8")}
            >
              <span className="truncate">{c.title}</span>
            </Link>
            <button
              type="button"
              onClick={() => remove(c)}
              disabled={deleting === c.id}
              aria-label={`Delete chat: ${c.title}`}
              title="Delete chat"
              className="absolute inset-y-0 right-1 my-auto grid size-6 place-items-center rounded-md text-white/50 opacity-0 transition-opacity hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
            >
              <Icon name="trash" className="size-3.5" />
            </button>
          </li>
        );
      }}
    />
  );
}

function Empty({ text }) {
  return <p className="mt-6 px-3 text-xs text-white/45">{text}</p>;
}
