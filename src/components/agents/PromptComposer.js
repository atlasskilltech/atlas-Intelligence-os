"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";

const MAX = 4000;

/**
 * ChatGPT/Claude-style prompt box. Enter submits, Shift+Enter adds a line.
 * - With `onSubmit`, calls it with the text.
 * - Otherwise navigates to /agents/new?prompt=… (used on the home page).
 */
export default function PromptComposer({
  defaultValue = "",
  placeholder = "Describe a task you want an agent to do…",
  onSubmit,
  disabled = false,
  footer,
  suggestions = [],
  autoFocus = false,
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const ref = useRef(null);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [value]);

  const text = value.trim();
  const canSend = !disabled && text.length > 0 && text.length <= MAX;

  function submit() {
    if (!canSend) return;
    if (onSubmit) onSubmit(text);
    else router.push(`/agents/new?prompt=${encodeURIComponent(text)}`);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_4px_24px_-8px_rgba(15,23,42,.12)] transition-colors",
          "focus-within:border-brand-500/60 focus-within:ring-4 focus-within:ring-brand-500/10",
        )}
      >
        <label htmlFor="agent-prompt" className="sr-only">
          Describe your task
        </label>
        <textarea
          id="agent-prompt"
          ref={ref}
          rows={2}
          value={value}
          autoFocus={autoFocus}
          maxLength={MAX}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="block max-h-[260px] w-full resize-none bg-transparent px-3 pt-2 pb-1 text-[15px] leading-6 text-navy-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <p className="truncate text-xs text-slate-400">
            {value.length > MAX * 0.9 ? `${value.length}/${MAX}` : "Enter to continue · Shift+Enter for a new line"}
          </p>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Continue"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Icon name="arrowUp" className="size-[18px]" />
          </button>
        </div>
      </form>

      {footer && <div className="mt-3">{footer}</div>}

      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                setValue(s.prompt);
                ref.current?.focus();
              }}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] text-slate-600 transition-colors hover:border-brand-500/50 hover:bg-brand-50 hover:text-brand-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
