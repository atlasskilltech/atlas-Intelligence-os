"use client";

import Button from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { LIMITS } from "@/lib/agents/agentConfig";
import { CONNECTORS, getTool } from "@/lib/catalog/toolCatalog";
import Badge from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { ApprovalBadge, AvailabilityBadge, RiskBadge } from "./ToolBadges";

let keySeq = 0;
export const newStepKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;
export const blankStep = () => ({ key: newStepKey(), title: "", details: "", tool: null, successCriteria: "" });

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ToolSelect({ id, value, onChange }) {
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">AI step — no tool (analyse, compare, summarise, decide)</option>
      {CONNECTORS.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.actions.map((a) => (
            <option key={a.id} value={`${c.id}.${a.id}`}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** The editable fields of one step — shared by the list editor and the flow view. */
export function StepFields({ step, index, onPatch, preApproved = [], className }) {
  const tool = step.tool ? getTool(step.tool) : null;
  return (
    <div className={cn("@container min-w-0 flex-1 space-y-3", className)}>
      <Input
        aria-label={`Step ${index + 1} title`}
        value={step.title}
        maxLength={LIMITS.stepTitle}
        placeholder="What happens in this step?"
        onChange={(e) => onPatch({ title: e.target.value })}
        invalid={!step.title.trim()}
        className="font-medium"
      />
      <Textarea
        aria-label={`Step ${index + 1} details`}
        rows={2}
        value={step.details}
        maxLength={LIMITS.stepText}
        placeholder="Details, decisions and what to do if something goes wrong"
        onChange={(e) => onPatch({ details: e.target.value })}
      />
      <div className="grid gap-3 @lg:grid-cols-2">
        <div>
          <label htmlFor={`tool-${step.key}`} className="mb-1 block text-xs font-medium text-slate-500">
            Tool
          </label>
          <ToolSelect id={`tool-${step.key}`} value={step.tool} onChange={(tool) => onPatch({ tool })} />
        </div>
        <div>
          <label htmlFor={`sc-${step.key}`} className="mb-1 block text-xs font-medium text-slate-500">
            Done when…
          </label>
          <Input
            id={`sc-${step.key}`}
            value={step.successCriteria}
            maxLength={LIMITS.stepText}
            placeholder="How we know this step succeeded"
            onChange={(e) => onPatch({ successCriteria: e.target.value })}
          />
        </div>
      </div>
      {tool && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span className="mr-1 font-medium text-ink">{tool.connectorName}</span>
          <RiskBadge risk={tool.risk} />
          {tool.requiresApproval && !preApproved.includes(tool.id) && <ApprovalBadge />}
          {tool.requiresApproval && preApproved.includes(tool.id) && <Badge tone="neutral">Pre-approved</Badge>}
          <AvailabilityBadge toolId={tool.id} />
        </div>
      )}
    </div>
  );
}

/** Editable, reorderable list of plan steps. `steps` items carry a client-only `key`. */
export default function StepsEditor({ steps, onChange, preApproved = [] }) {
  const update = (i, patch) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const add = () => onChange([...steps, blankStep()]);

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No steps yet. Add at least one step.
        </p>
      )}
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="rounded-lg border border-slate-200 bg-surface">
            <div className="flex items-start gap-3 p-4">
              <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                {i + 1}
              </span>
              <StepFields step={s} index={i} onPatch={(patch) => update(i, patch)} preApproved={preApproved} />
              <div className="flex shrink-0 flex-col">
                <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  <Icon name="arrowUp" className="size-4" />
                </IconButton>
                <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                  <Icon name="arrowUp" className="size-4 rotate-180" />
                </IconButton>
                <IconButton label="Delete step" onClick={() => remove(i)}>
                  <Icon name="close" className="size-4" />
                </IconButton>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="secondary" size="sm" onClick={add} disabled={steps.length >= LIMITS.maxPlanSteps}>
        <Icon name="plus" className="size-4" />
        Add step
      </Button>
    </div>
  );
}
