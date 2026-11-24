"use client";

import Button from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { LIMITS } from "@/lib/agents/agentConfig";
import { CONNECTORS, getTool } from "@/lib/catalog/toolCatalog";
import { ApprovalBadge, AvailabilityBadge, RiskBadge } from "./ToolBadges";

let keySeq = 0;
export const newStepKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-navy-800 disabled:opacity-30 disabled:hover:bg-transparent"
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

/** Editable, reorderable list of plan steps. `steps` items carry a client-only `key`. */
export default function StepsEditor({ steps, onChange }) {
  const update = (i, patch) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const add = () =>
    onChange([...steps, { key: newStepKey(), title: "", details: "", tool: null, successCriteria: "" }]);

  return (
    <div className="space-y-3">
      {steps.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
          No steps yet. Add at least one step.
        </p>
      )}
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const tool = s.tool ? getTool(s.tool) : null;
          return (
            <li key={s.key} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-start gap-3 p-4">
                <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <Input
                    aria-label={`Step ${i + 1} title`}
                    value={s.title}
                    maxLength={LIMITS.stepTitle}
                    placeholder="What happens in this step?"
                    onChange={(e) => update(i, { title: e.target.value })}
                    invalid={!s.title.trim()}
                    className="font-medium"
                  />
                  <Textarea
                    aria-label={`Step ${i + 1} details`}
                    rows={2}
                    value={s.details}
                    maxLength={LIMITS.stepText}
                    placeholder="Details, decisions and what to do if something goes wrong"
                    onChange={(e) => update(i, { details: e.target.value })}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label htmlFor={`tool-${s.key}`} className="mb-1 block text-xs font-medium text-slate-500">
                        Tool
                      </label>
                      <ToolSelect id={`tool-${s.key}`} value={s.tool} onChange={(tool) => update(i, { tool })} />
                    </div>
                    <div>
                      <label htmlFor={`sc-${s.key}`} className="mb-1 block text-xs font-medium text-slate-500">
                        Done when…
                      </label>
                      <Input
                        id={`sc-${s.key}`}
                        value={s.successCriteria}
                        maxLength={LIMITS.stepText}
                        placeholder="How we know this step succeeded"
                        onChange={(e) => update(i, { successCriteria: e.target.value })}
                      />
                    </div>
                  </div>
                  {tool && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="mr-1 font-medium text-navy-800">{tool.connectorName}</span>
                      <RiskBadge risk={tool.risk} />
                      {tool.requiresApproval && <ApprovalBadge />}
                      <AvailabilityBadge toolId={tool.id} />
                    </div>
                  )}
                </div>
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
          );
        })}
      </ol>
      <Button variant="secondary" size="sm" onClick={add} disabled={steps.length >= LIMITS.maxPlanSteps}>
        <Icon name="plus" className="size-4" />
        Add step
      </Button>
    </div>
  );
}
