"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { THEME_KEY } from "@/lib/theme";

const OPTIONS = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" },
];

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(theme) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme;
}

/** Light / Dark / System switch. The boot script in the root layout applies it before paint. */
export default function ThemeToggle({ className }) {
  const [theme, setTheme] = useState(null); // null until mounted (localStorage is client-only)

  useEffect(() => {
    queueMicrotask(() => setTheme(document.documentElement.dataset.theme || "system"));
  }, []);

  // Follow OS changes while on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(t) {
    setTheme(t);
    apply(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex rounded-full border border-slate-200 bg-surface p-0.5", className)}>
      {OPTIONS.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={`${o.label} theme`}
            aria-label={`${o.label} theme`}
            onClick={() => choose(o.id)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors",
              on ? "bg-brand-500 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-ink",
            )}
          >
            <Icon name={o.icon} className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
