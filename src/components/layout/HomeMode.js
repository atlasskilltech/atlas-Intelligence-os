"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

const MODE_KEY = "atlas.homeMode";

// Two modes for Home: a normal chat (answers only, read-only lookups) or
// "new agent" (the text opens the agent builder).
export const HOME_MODES = [
  { id: "ask", label: "Chat", icon: "chatSearch", hint: "Chat: get an answer straight away (never creates an agent)" },
  { id: "agent", label: "Agent", icon: "code", hint: "Agent: turn a task into an agent that runs on its own" },
];

const HomeModeContext = createContext({ mode: "ask", setMode: () => {} });

export function HomeModeProvider({ children }) {
  const [mode, setModeState] = useState("ask");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration
      if (saved === "agent" || saved === "ask") setModeState(saved);
    } catch {}
  }, []);
  const setMode = (m) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };
  return <HomeModeContext.Provider value={{ mode, setMode }}>{children}</HomeModeContext.Provider>;
}

export const useHomeMode = () => useContext(HomeModeContext);

/** Claude-style Chat / Agent switch for the top of the sidebar. Picking one opens Home in that mode. */
export function HomeModeToggle({ onNavigate }) {
  const { mode, setMode } = useHomeMode();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div role="radiogroup" aria-label="Chat or agent" className="inline-flex items-center gap-0.5 rounded-lg bg-white/8 p-0.5">
      {HOME_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          aria-label={m.label}
          title={m.hint}
          onClick={() => {
            setMode(m.id);
            if (pathname !== "/") {
              router.push("/");
              onNavigate?.();
            }
          }}
          className={cn(
            "grid size-7 place-items-center rounded-md transition-colors",
            mode === m.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white",
          )}
        >
          <Icon name={m.icon} className="size-4" />
        </button>
      ))}
    </div>
  );
}
