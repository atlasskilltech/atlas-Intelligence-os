"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { fmtInt, fmtUsd } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { LIMITS, normalizeAgentConfig } from "@/lib/agents/agentConfig";
import { describeTrigger } from "@/lib/agents/schedule";
import { getTool, isToolAvailable } from "@/lib/catalog/toolCatalog";
import PromptComposer from "./PromptComposer";
import StepsEditor, { newStepKey } from "./StepsEditor";
import { ApprovalBadge, AvailabilityBadge, RiskBadge } from "./ToolBadges";
import TriggerEditor from "./TriggerEditor";
import { PROMPT_SUGGESTIONS } from "./suggestions";

const DRAFT_KEY = "atlas.agentDraft.v1";
const STEPS = ["Describe", "Review plan", "Test & activate"];

// ---------- helpers ----------
const toDraft = (agent) => ({ ...agent, steps: agent.steps.map((s) => ({ ...s, key: newStepKey() })) });

async function postGenerate(body) {
  const res = await fetch("/api/agents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Could not generate the agent. Please try again.");
  return data;
}

function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}
function save(state) {
  try {
    if (state) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function clientErrors(draft) {
  const e = {};
  if (!draft.name?.trim()) e.name = "Give the agent a name.";
  if (!draft.instructions?.trim()) e.instructions = "Instructions are required.";
  if (!draft.steps?.length) e.steps = "Add at least one step.";
  else if (draft.steps.some((s) => !s.title.trim())) e.steps = "Every step needs a title.";
  return e;
}

// ---------- small pieces ----------
function Stepper({ current }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-2">
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-xs font-bold",
              i < current ? "bg-brand-100 text-brand-700" : i === current ? "bg-brand-500 text-white" : "bg-slate-200 text-slate-500",
            )}
          >
            {i < current ? <Icon name="check" className="size-3.5" /> : i + 1}
          </span>
          <span className={i === current ? "font-semibold text-navy-800" : "text-slate-500"}>{step}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-slate-300 sm:w-8" />}
        </li>
      ))}
    </ol>
  );
}

function Planning({ prompt }) {
  const phases = ["Understanding your task", "Choosing tools and connectors", "Writing the step-by-step plan", "Checking permissions"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, phases.length - 1)), 4000);
    return () => clearInterval(t);
  }, [phases.length]);
  return (
    <Card className="mx-auto max-w-3xl">
      <CardBody className="space-y-5 py-8">
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-navy-800">Your task: </span>
          {prompt}
        </div>
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <p className="text-sm font-semibold text-navy-800">Planning your agent…</p>
            <p className="text-xs text-slate-500">{phases[i]} · this can take up to a minute</p>
          </div>
        </div>
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((k) => (
            <div key={k} className="h-14 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${k * 150}ms` }} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function NoteList({ tone, title, items, action }) {
  if (!items?.length) return null;
  return (
    <Alert tone={tone} title={title}>
      <ul className="mt-1 space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start justify-between gap-3">
            <span>• {t}</span>
            {action && (
              <button type="button" onClick={() => action(t)} className="shrink-0 text-xs font-semibold underline">
                Answer
              </button>
            )}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

// ---------- refine panel (chat-style) ----------
function RefinePanel({ history, busy, onSend, text, setText, inputRef }) {
  const send = () => {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    onSend(t);
    setText("");
  };
  return (
    <Card>
      <CardHeader title="Refine with AI" description="Ask for changes in plain language." />
      <CardBody className="space-y-3">
        {history.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {history.map((h, i) => (
              <li key={i} className={cn("rounded-lg px-3 py-2 text-sm", h.role === "user" ? "ml-6 bg-brand-50 text-navy-800" : "mr-6 bg-slate-100 text-slate-600")}>
                {h.text}
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-lg border border-slate-200 focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/15">
          <textarea
            ref={inputRef}
            rows={3}
            value={text}
            maxLength={2000}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="e.g. Run at 8:30 AM on weekdays and email the report to me"
            className="block w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none"
          />
          <div className="flex justify-end px-2 pb-2">
            <Button size="sm" onClick={send} disabled={busy || text.trim().length < 3}>
              {busy ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : <Icon name="sparkles" className="size-3.5" />}
              {busy ? "Updating…" : "Apply change"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------- main ----------
export default function AgentBuilder({ initialPrompt = "" }) {
  const router = useRouter();
  const [phase, setPhase] = useState("describe"); // describe | generating | review
  const [prompt, setPrompt] = useState(initialPrompt);
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [refining, setRefining] = useState(false);
  const [refineText, setRefineText] = useState("");
  const refineRef = useRef(null);
  const started = useRef(false);

  async function generate(text) {
    setPrompt(text);
    setError(null);
    setPhase("generating");
    try {
      const data = await postGenerate({ prompt: text });
      const d = toDraft(data.agent);
      setDraft(d);
      setMeta(data.meta);
      setWarnings(data.warnings || []);
      setHistory([]);
      setPhase("review");
      save({ draft: d, meta: data.meta, warnings: data.warnings || [], prompt: text, history: [] });
    } catch (err) {
      setError(err.message);
      setPhase("describe");
    }
  }

  // Restore a draft from this tab, or auto-start when arriving with ?prompt=.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialPrompt) {
      router.replace("/agents/new", { scroll: false }); // a refresh must not re-run the planner
      generate(initialPrompt);
      return;
    }
    const saved = loadSaved();
    if (saved?.draft) {
      // One-time restore after hydration (sessionStorage is not available during SSR).
      setDraft(saved.draft);
      setMeta(saved.meta);
      setWarnings(saved.warnings || []);
      setPrompt(saved.prompt || "");
      setHistory(saved.history || []);
      setPhase("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist edits for this browser tab.
  useEffect(() => {
    if (phase === "review" && draft) save({ draft, meta, warnings, prompt, history });
  }, [phase, draft, meta, warnings, prompt, history]);

  const derived = useMemo(() => (draft ? normalizeAgentConfig(draft).config : null), [draft]);
  const errors = draft ? clientErrors(draft) : {};
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function refine(instruction) {
    setRefining(true);
    setHistory((h) => [...h, { role: "user", text: instruction }]);
    try {
      const data = await postGenerate({ agent: derived, instruction });
      setDraft(toDraft(data.agent));
      setMeta(data.meta);
      setWarnings(data.warnings || []);
      setHistory((h) => [...h, { role: "ai", text: "Done — I've updated the plan. Review the changes." }]);
    } catch (err) {
      setHistory((h) => [...h, { role: "ai", text: `Couldn't apply that: ${err.message}` }]);
    } finally {
      setRefining(false);
    }
  }

  function startOver() {
    save(null);
    setDraft(null);
    setMeta(null);
    setWarnings([]);
    setHistory([]);
    setError(null);
    setPhase("describe");
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(derived, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(derived.name || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ----- describe / generating -----
  if (phase !== "review") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-xl font-extrabold tracking-tight text-brand-500">Create an agent</h1>
          <p className="mt-1 text-sm text-slate-500">
            Describe the task. IntelligenceOS proposes an agent with a plan you can review and edit before anything runs.
          </p>
        </div>
        <div className="mb-6">
          <Stepper current={0} />
        </div>
        {phase === "generating" ? (
          <Planning prompt={prompt} />
        ) : (
          <PromptComposer
            key={prompt}
            defaultValue={prompt}
            autoFocus
            onSubmit={generate}
            suggestions={PROMPT_SUGGESTIONS}
            footer={error && <Alert tone="error" title="Couldn't create the agent">{error}</Alert>}
          />
        )}
      </div>
    );
  }

  // ----- review -----
  const approvalTools = derived.permissions.toolsRequiringApproval;
  const unavailable = derived.tools.filter((id) => !isToolAvailable(id));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-brand-500">Review your agent</h1>
          <p className="mt-1 text-sm text-slate-500">Check the plan, edit anything, or ask the AI for changes.</p>
        </div>
        <Stepper current={1} />
      </div>

      {warnings.length > 0 && (
        <Alert tone="warning" className="mb-4" title="Adjusted by safety checks">
          {warnings.join(" ")}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Editor */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <Field label="Agent name" htmlFor="name" error={errors.name}>
                <Input id="name" value={draft.name} maxLength={LIMITS.name} onChange={(e) => set({ name: e.target.value })} invalid={!!errors.name} className="text-base font-semibold" />
              </Field>
              <Field label="Description" htmlFor="desc">
                <Textarea id="desc" rows={2} value={draft.description} maxLength={LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span className="font-medium text-slate-600">Original request: </span>
                {prompt}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Execution plan" description="The steps the agent follows, in order." />
            <CardBody>
              {errors.steps && <p className="mb-3 text-sm text-red-600">{errors.steps}</p>}
              <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When it runs" />
            <CardBody>
              <TriggerEditor trigger={draft.trigger} onChange={(trigger) => set({ trigger })} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Agent instructions" description="What the AI is told when it runs. Edit freely." />
            <CardBody>
              <Field error={errors.instructions}>
                <Textarea
                  aria-label="Agent instructions"
                  rows={12}
                  value={draft.instructions}
                  maxLength={LIMITS.instructions}
                  onChange={(e) => set({ instructions: e.target.value })}
                  invalid={!!errors.instructions}
                  className="text-[13px]"
                />
              </Field>
              <p className="mt-1.5 text-right text-xs text-slate-400">
                {draft.instructions.length}/{LIMITS.instructions}
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Runs</p>
                <p className="mt-0.5 text-navy-800">{describeTrigger(derived.trigger)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Tools ({derived.tools.length})</p>
                {derived.tools.length === 0 ? (
                  <p className="mt-0.5 text-slate-500">AI-only steps — no connectors needed.</p>
                ) : (
                  <ul className="mt-1.5 space-y-2">
                    {derived.tools.map((id) => {
                      const t = getTool(id);
                      return (
                        <li key={id}>
                          <p className="font-medium text-navy-800">
                            {t.connectorName} · {t.name}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <RiskBadge risk={t.risk} />
                            <AvailabilityBadge toolId={id} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Approvals</p>
                {approvalTools.length === 0 ? (
                  <p className="mt-0.5 text-slate-500">None — this agent only reads data and writes reports.</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    <ApprovalBadge />
                    <p className="text-slate-600">
                      The agent pauses and asks you before:{" "}
                      {approvalTools.map((id) => getTool(id).name.toLowerCase()).join(", ")}.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Safety limits</p>
                <p className="mt-0.5 text-slate-600">
                  Up to {derived.limits.maxSteps} actions and {derived.limits.timeoutMinutes} minutes per run.
                </p>
              </div>
            </CardBody>
            <div className="space-y-2 border-t border-slate-100 px-5 py-4">
              <Button className="w-full" disabled title="Saving agents arrives in Milestone 4">
                Save agent
              </Button>
              <p className="text-center text-xs text-slate-500">Saving arrives in Milestone 4 · test runs in Milestone 5</p>
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" size="sm" className="flex-1" onClick={downloadJson}>
                  Download JSON
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={startOver}>
                  Start over
                </Button>
              </div>
            </div>
          </Card>

          <RefinePanel
            history={history}
            busy={refining}
            onSend={refine}
            text={refineText}
            setText={setRefineText}
            inputRef={refineRef}
          />

          <NoteList
            tone="warning"
            title="Not possible yet"
            items={[
              ...derived.notes.missingCapabilities,
              ...(unavailable.length
                ? [`Some tools need connectors that are built in later milestones (${[...new Set(unavailable.map((id) => getTool(id).availableIn))].sort().map((m) => `M${m}`).join(", ")}).`]
                : []),
            ]}
          />
          <NoteList
            tone="info"
            title="Questions to improve this agent"
            items={derived.notes.clarifyingQuestions}
            action={(q) => {
              setRefineText(`${q} — `);
              refineRef.current?.focus();
            }}
          />
          <NoteList tone="info" title="Assumptions made" items={derived.notes.assumptions} />

          {meta && (
            <p className="text-center text-xs text-slate-400">
              Planned with <span className="font-mono">{meta.model}</span> · {fmtInt((meta.usage?.inputTokens || 0) + (meta.usage?.outputTokens || 0))} tokens ·{" "}
              {meta.costUsd == null ? "price not set" : fmtUsd(meta.costUsd)} · {((meta.latencyMs || 0) / 1000).toFixed(1)}s
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Badge tone="neutral">Draft</Badge> kept in this browser tab until saved
          </p>
        </div>
      </div>
    </div>
  );
}
