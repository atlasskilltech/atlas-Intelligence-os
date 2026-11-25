"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import AgentWorkspace, { agentApi, downloadAgentJson, postGenerate, toDraft, toPayload, workspaceErrors } from "./AgentWorkspace";
import ConnectorPicker, { loadSelectedConnectors } from "./ConnectorPicker";
import PromptComposer from "./PromptComposer";
import { PROMPT_SUGGESTIONS } from "./suggestions";

const DRAFT_KEY = "atlas.agentDraft.v1";
const STEPS = ["Describe", "Review plan", "Test & activate"];

// ---------- helpers ----------
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
          <span className={i === current ? "font-semibold text-ink" : "text-slate-500"}>{step}</span>
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
          <span className="font-medium text-ink">Your task: </span>
          {prompt}
        </div>
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <p className="text-sm font-semibold text-ink">Planning your agent…</p>
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

// ---------- main ----------
export default function AgentBuilder({ initialPrompt = "", initialProjects = [] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects); // connectors picked for this agent
  const [phase, setPhase] = useState("describe"); // describe | generating | review
  const [prompt, setPrompt] = useState(initialPrompt);
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(null); // null | "active" | "draft"
  const [saveError, setSaveError] = useState(null);
  const [serverErrors, setServerErrors] = useState({});
  const started = useRef(false);

  async function generate(text, picked = projects) {
    setPrompt(text);
    setError(null);
    setPhase("generating");
    try {
      const data = await postGenerate({ prompt: text, ...(picked.length ? { projects: picked } : {}) });
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
  // Runs once after hydration (sessionStorage is not available during SSR).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    queueMicrotask(() => {
      if (initialPrompt) {
        router.replace("/agents/new", { scroll: false }); // a refresh must not re-run the planner
        generate(initialPrompt, initialProjects);
        return;
      }
      if (!initialProjects.length) setProjects(loadSelectedConnectors());
      const saved = loadSaved();
      if (saved?.draft) {
        setDraft(saved.draft);
        setMeta(saved.meta);
        setWarnings(saved.warnings || []);
        setPrompt(saved.prompt || "");
        setHistory(saved.history || []);
        setPhase("review");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist edits for this browser tab.
  useEffect(() => {
    if (phase === "review" && draft) save({ draft, meta, warnings, prompt, history });
  }, [phase, draft, meta, warnings, prompt, history]);

  function applyAI(data) {
    setDraft(toDraft(data.agent));
    setMeta(data.meta);
    setWarnings(data.warnings || []);
  }

  async function saveAgent(activate) {
    setSaving(activate ? "active" : "draft");
    setSaveError(null);
    setServerErrors({});
    try {
      const { agent } = await agentApi("/api/agents", "POST", { agent: toPayload(draft), activate });
      save(null);
      router.push(`/agents/${agent.id}?saved=${activate ? "active" : "draft"}`);
      router.refresh(); // sidebar "Recent agents" + counts
    } catch (err) {
      setSaveError(err.message);
      setServerErrors(err.fields || {});
      setSaving(null);
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
            onSubmit={(text) => generate(text)}
            toolbar={<ConnectorPicker value={projects} onChange={setProjects} />}
            suggestions={PROMPT_SUGGESTIONS}
            footer={error && <Alert tone="error" title="Couldn't create the agent">{error}</Alert>}
          />
        )}
      </div>
    );
  }

  // ----- review -----
  const blocking = Object.keys(workspaceErrors(draft)).length > 0;
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-brand-500">Review your agent</h1>
          <p className="mt-1 text-sm text-slate-500">Check the plan, edit anything, or ask the AI for changes — then save.</p>
        </div>
        <Stepper current={1} />
      </div>
      {saveError && (
        <Alert tone="error" className="mb-4" title="Couldn't save the agent">
          {saveError}
        </Alert>
      )}
      <AgentWorkspace
        draft={draft}
        setDraft={setDraft}
        prompt={prompt}
        warnings={warnings}
        meta={meta}
        onAIResult={applyAI}
        history={history}
        setHistory={setHistory}
        serverErrors={serverErrors}
        actions={
          <>
            <Button className="w-full" onClick={() => saveAgent(true)} disabled={!!saving || blocking}>
              {saving === "active" ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="check" className="size-4" />}
              {saving === "active" ? "Saving…" : "Save & activate"}
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => saveAgent(false)} disabled={!!saving || blocking}>
              {saving === "draft" ? "Saving…" : "Save as draft"}
            </Button>
            <p className="text-center text-xs text-slate-500">
              {blocking ? "Fix the highlighted fields to save." : "After saving, use Run test to try it safely"}
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => downloadAgentJson(toPayload(draft))}>
                Download JSON
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={startOver} disabled={!!saving}>
                Start over
              </Button>
            </div>
          </>
        }
        footnote={
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Badge tone="neutral">Unsaved</Badge> kept in this browser tab until you save
          </p>
        }
      />
    </div>
  );
}
