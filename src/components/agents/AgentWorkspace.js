"use client";

import { useMemo, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { fmtInt, fmtUsd } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { EMAIL_TOOL, LIMITS, agentWantsEmail, canPreApprove, draftErrors, normalizeAgentConfig } from "@/lib/agents/agentConfig";
import { describeTrigger } from "@/lib/agents/schedule";
import { RISK_LEVELS, getTool, isToolAvailable } from "@/lib/catalog/toolCatalog";
import AgentConnectors, { usesProjects } from "./AgentConnectors";
import ConnectorPicker from "./ConnectorPicker";
import StepsEditor, { newStepKey } from "./StepsEditor";
import StepsFlow from "./StepsFlow";
import { ApprovalBadge, AvailabilityBadge, RiskBadge } from "./ToolBadges";
import TriggerEditor from "./TriggerEditor";

/**
 * The agent editor shared by "Create agent" (/agents/new) and the agent page
 * (/agents/[id]): plan, trigger, instructions, permissions, AI refine panel
 * and summary. The parent owns the draft and supplies the actions.
 */

/** Adds stable React keys to steps for editing. */
export const toDraft = (agent) => ({ ...agent, steps: agent.steps.map((s) => ({ ...s, key: newStepKey() })) });

/** Strips editor-only fields before sending to the server. */
export const toPayload = (draft) => ({ ...draft, steps: draft.steps.map(({ key: _key, ...s }) => s) });

export async function postGenerate(body) {
  const res = await fetch("/api/agents/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Could not generate the agent. Please try again.");
  return data;
}

/** JSON fetch helper for the agents API; throws an Error carrying `.fields` and `.status`. */
export async function agentApi(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || "Something went wrong. Please try again.");
    err.fields = data?.error?.fields;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function downloadAgentJson(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(config.name || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
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
              <li key={i} className={cn("rounded-lg px-3 py-2 text-sm", h.role === "user" ? "ml-6 bg-brand-50 text-ink" : "mr-6 bg-slate-100 text-slate-600")}>
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
            placeholder="e.g. Run at 8:30 AM on weekdays and notify me with the report"
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

/** Per-tool approval switches + run limits. Destructive tools always ask; read/internal tools never do. */
function PermissionsEditor({ draft, derived, set }) {
  const needs = derived.tools.filter((id) => RISK_LEVELS[getTool(id).risk].approval);
  const pre = derived.permissions.preApproved;
  const toggle = (id, ask) => {
    const next = ask ? pre.filter((x) => x !== id) : [...new Set([...pre, id])];
    set({ permissions: { ...derived.permissions, ...draft.permissions, preApproved: next } });
  };
  const limits = draft.limits ?? derived.limits;
  const setLimit = (k, v) => set({ limits: { ...limits, [k]: v === "" ? "" : Number(v) } });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate-700">Approvals</p>
        {needs.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">This agent only reads data and writes inside IntelligenceOS, so it never needs approval.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {needs.map((id) => {
              const t = getTool(id);
              const ask = !pre.includes(id);
              const locked = !canPreApprove(id);
              return (
                <li key={id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {t.connectorName} · {t.name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <RiskBadge risk={t.risk} />
                    </div>
                  </div>
                  <label className={cn("flex shrink-0 items-center gap-2 text-sm", locked ? "text-slate-400" : "text-slate-700")}>
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-500"
                      checked={ask}
                      disabled={locked}
                      onChange={(e) => toggle(id, e.target.checked)}
                    />
                    Ask me first
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {pre.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Pre-approved actions run without asking. Only do this for actions you are comfortable letting the agent take on its own.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max actions per run" htmlFor="lim-steps" hint="1–30">
          <Input id="lim-steps" type="number" min={1} max={30} value={limits.maxSteps} onChange={(e) => setLimit("maxSteps", e.target.value)} />
        </Field>
        <Field label="Time limit per run (minutes)" htmlFor="lim-time" hint="1–15">
          <Input id="lim-time" type="number" min={1} max={15} value={limits.timeoutMinutes} onChange={(e) => setLimit("timeoutMinutes", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function ViewToggle({ value, onChange }) {
  return (
    <div role="group" aria-label="Plan view" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
      {[
        ["flow", "Flow"],
        ["list", "List"],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn("rounded-md px-3 py-1", value === id ? "bg-surface text-ink shadow-xs" : "text-slate-500 hover:text-ink")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function limitErrors(limits) {
  if (!limits) return null;
  const ms = Number(limits.maxSteps);
  const to = Number(limits.timeoutMinutes);
  if (!Number.isInteger(ms) || ms < 1 || ms > 30) return "Max actions must be a whole number from 1 to 30.";
  if (!Number.isInteger(to) || to < 1 || to > 15) return "Time limit must be a whole number from 1 to 15.";
  return null;
}

/** All validation errors for a draft, keyed by field. */
export function workspaceErrors(draft) {
  const e = draftErrors(draft);
  const lim = limitErrors(draft.limits);
  if (lim) e.limits = lim;
  return e;
}

export default function AgentWorkspace({
  draft,
  setDraft,
  prompt,
  warnings = [],
  meta,
  onAIResult,
  history,
  setHistory,
  serverErrors = {},
  actions,
  footnote,
  projects = null, // [{ id, name, usable }] when known (agent page): shows connectors in the summary
  onAddEmail = null, // agent page: one click adds the email step and saves
  addingEmail = false,
}) {
  const [refining, setRefining] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [planView, setPlanView] = useState("flow");
  const refineRef = useRef(null);

  const derived = useMemo(() => normalizeAgentConfig(draft).config, [draft]);
  const errors = { ...serverErrors, ...workspaceErrors(draft) };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function refine(instruction) {
    setRefining(true);
    setHistory((h) => [...h, { role: "user", text: instruction }]);
    try {
      const data = await postGenerate({ agent: toPayload(derived), instruction });
      onAIResult(data);
      setHistory((h) => [...h, { role: "ai", text: "Done — I've updated the plan. Review the changes, then save." }]);
    } catch (err) {
      setHistory((h) => [...h, { role: "ai", text: `Couldn't apply that: ${err.message}` }]);
    } finally {
      setRefining(false);
    }
  }

  const approvalTools = derived.permissions.toolsRequiringApproval;
  const unavailable = derived.tools.filter((id) => !isToolAvailable(id));

  return (
    <>
      {warnings.length > 0 && (
        <Alert tone="warning" className="mb-4" title="Adjusted by safety checks">
          {warnings.join(" ")}
        </Alert>
      )}

      {onAddEmail && agentWantsEmail(derived) && isToolAvailable(EMAIL_TOOL) && (
        <Alert tone="success" className="mb-4" title="Email is now available">
          <p>This agent was planned before email existed, so it still only notifies you on the dashboard.</p>
          <p className="mt-1">One click adds an &quot;Email the report to me&quot; step and saves the agent. Emails only go to your own inbox.</p>
          <Button size="sm" className="mt-3" onClick={onAddEmail} disabled={addingEmail}>
            {addingEmail ? <Spinner className="size-3.5 border-white/40 border-t-white" /> : <Icon name="mail" className="size-3.5" />}
            {addingEmail ? "Adding…" : "Add email to this agent"}
          </Button>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <Field label="Agent name" htmlFor="name" error={errors.name}>
                <Input id="name" value={draft.name} maxLength={LIMITS.name} onChange={(e) => set({ name: e.target.value })} invalid={!!errors.name} className="text-base font-semibold" />
              </Field>
              <Field label="Description" htmlFor="desc">
                <Textarea id="desc" rows={2} value={draft.description} maxLength={LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
              {prompt && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Original request: </span>
                  {prompt}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Execution plan"
              description="The steps the agent follows, in order."
              action={<ViewToggle value={planView} onChange={setPlanView} />}
            />
            <CardBody>
              {errors.steps && <p className="mb-3 text-sm text-red-600">{errors.steps}</p>}
              {planView === "flow" ? (
                <StepsFlow
                  steps={draft.steps}
                  onChange={(steps) => set({ steps })}
                  preApproved={derived.permissions.preApproved}
                  triggerLabel={describeTrigger(derived.trigger)}
                  title={draft.name || "Agent flow"}
                />
              ) : (
                <StepsEditor steps={draft.steps} onChange={(steps) => set({ steps })} preApproved={derived.permissions.preApproved} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="When it runs" />
            <CardBody>
              <TriggerEditor trigger={draft.trigger} onChange={(trigger) => set({ trigger })} />
            </CardBody>
          </Card>

          {usesProjects(derived.tools) && (
            <Card>
              <CardHeader
                title="Plugins"
                description="Which ATLAS projects this agent may use when it runs. Leave it on all connectors, or pick some to lock the agent to them."
              />
              <CardBody>
                <ConnectorPicker
                  remember={false}
                  placement="down"
                  value={draft.connectors?.projects || []}
                  onChange={(projects) => set({ connectors: { projects } })}
                />
              </CardBody>
            </Card>
          )}

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

          <Card>
            <CardHeader title="Permissions & limits" description="Which actions need your approval, and how much one run may do." />
            <CardBody>
              {errors.limits && <p className="mb-3 text-sm text-red-600">{errors.limits}</p>}
              <PermissionsEditor draft={draft} derived={derived} set={set} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Runs</p>
                <p className="mt-0.5 text-ink">{describeTrigger(derived.trigger)}</p>
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
                          <p className="font-medium text-ink">
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
              {projects && usesProjects(derived.tools) && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Plugins</p>
                  <AgentConnectors className="mt-1.5" ids={derived.connectors.projects} projects={projects} />
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Approvals</p>
                {approvalTools.length === 0 ? (
                  <p className="mt-0.5 text-slate-500">
                    {derived.permissions.preApproved.length ? "None — you pre-approved every action." : "None — this agent only reads data and writes reports."}
                  </p>
                ) : (
                  <div className="mt-1 space-y-1">
                    <ApprovalBadge />
                    <p className="text-slate-600">
                      The agent pauses and asks you before: {approvalTools.map((id) => getTool(id).name.toLowerCase()).join(", ")}.
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
            {actions && <div className="space-y-2 border-t border-slate-100 px-5 py-4">{actions}</div>}
          </Card>

          <RefinePanel history={history} busy={refining} onSend={refine} text={refineText} setText={setRefineText} inputRef={refineRef} />

          <NoteList
            tone="warning"
            title="Not possible yet"
            items={[
              ...(onAddEmail && agentWantsEmail(derived) && isToolAvailable(EMAIL_TOOL)
                ? derived.notes.missingCapabilities.filter((m) => !/e-?mail|inbox/i.test(m))
                : derived.notes.missingCapabilities),
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
          {footnote}
        </div>
      </div>
    </>
  );
}
