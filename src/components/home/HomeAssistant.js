"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConnectorPicker, { loadSelectedConnectors } from "@/components/agents/ConnectorPicker";
import PromptComposer from "@/components/agents/PromptComposer";
import Icon from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";

const MODES = [
  { id: "auto", label: "Auto", hint: "Questions get an answer, tasks become an agent" },
  { id: "ask", label: "Ask", hint: "Just answer — never create an agent" },
  { id: "agent", label: "Build agent", hint: "Turn this into an agent" },
];

/** Minimal safe text renderer: paragraphs, "- " bullets and **bold**. No HTML injection. */
function Rich({ text }) {
  const inline = (line, k) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={`${k}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      ),
    );
  const blocks = [];
  let list = null;
  text.split("\n").forEach((raw, i) => {
    const bullet = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) blocks.push((list = { type: "ul", items: [] }));
      list.items.push(inline(bullet[1], i));
      return;
    }
    list = null;
    if (raw.trim()) blocks.push({ type: "p", content: inline(raw, i) });
  });
  return (
    <div className="space-y-2 text-[15px] leading-6 text-slate-700">
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {b.content}
          </p>
        ),
      )}
    </div>
  );
}

/**
 * Home prompt: a question gets a direct answer right here (read-only lookups
 * in the selected connectors); work to automate goes to the agent builder.
 */
export default function HomeAssistant({ suggestions = [] }) {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [mode, setMode] = useState("auto");
  const [thread, setThread] = useState([]); // { role: "user"|"assistant", content, sources?, error?, agentPrompt? }
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    queueMicrotask(() => setProjects(loadSelectedConnectors()));
  }, []);
  useEffect(() => {
    if (thread.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [thread, busy]);

  const toAgent = (text) => {
    const q = new URLSearchParams({ prompt: text });
    if (projects.length) q.set("projects", projects.join(","));
    router.push(`/agents/new?${q}`);
  };

  async function send(text) {
    if (busy) return;
    if (mode === "agent") return toAgent(text);
    const history = thread.filter((m) => !m.error && !m.agentPrompt).map(({ role, content }) => ({ role, content }));
    setThread((t) => [...t, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, projects, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || "Something went wrong. Please try again.");
      if (data.route === "agent") {
        setThread((t) => [
          ...t,
          { role: "assistant", content: "This looks like work to automate, so I'll set up an agent for it…", agentPrompt: text },
        ]);
        toAgent(text);
        return;
      }
      setThread((t) => [...t, { role: "assistant", content: data.answer, sources: data.sources || [] }]);
    } catch (err) {
      setThread((t) => [...t, { role: "assistant", content: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  const uniqueSources = (s = []) => [...new Map(s.map((x) => [`${x.project}|${x.action}`, x])).values()];

  return (
    <div className="w-full">
      {thread.length > 0 && (
        <div className="mb-4 space-y-4">
          {thread.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-500 px-4 py-2 text-[15px] text-white">{m.content}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <Icon name={m.error ? "alert" : "sparkles"} className="size-4" />
                </span>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3",
                    m.error ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-surface",
                  )}
                >
                  {m.error ? <p className="text-sm">{m.content}</p> : <Rich text={m.content} />}
                  {m.sources?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {uniqueSources(m.sources).map((s) => (
                        <span key={`${s.project}|${s.action}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                          <Icon name="plug" className="size-3" />
                          {s.project} · {s.action}
                        </span>
                      ))}
                    </div>
                  )}
                  {!m.error && !m.agentPrompt && i > 0 && (
                    <button
                      type="button"
                      onClick={() => toAgent(thread[i - 1].content)}
                      className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      Automate this as an agent →
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-3 pl-10 text-sm text-slate-500">
              <Spinner /> Looking it up…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <PromptComposer
        autoFocus
        disabled={busy}
        key={thread.length}
        placeholder={thread.length ? "Ask a follow-up…" : "Ask a question or describe a task to automate…"}
        onSubmit={send}
        toolbar={<ConnectorPicker value={projects} onChange={setProjects} disabled={busy} />}
        suggestions={thread.length ? [] : suggestions}
        footer={
          <div className="flex flex-wrap items-center justify-center gap-1 text-xs">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
                  mode === m.id ? "bg-ink/90 text-white dark:bg-brand-600" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {m.label}
              </button>
            ))}
            {thread.length > 0 && (
              <button type="button" onClick={() => setThread([])} className="ml-2 rounded-full px-2.5 py-1 text-slate-500 hover:bg-slate-100">
                New chat
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}
