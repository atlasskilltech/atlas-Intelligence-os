"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { cn } from "@/components/ui/cn";
import { LIMITS } from "@/lib/agents/agentConfig";
import { getTool } from "@/lib/catalog/toolCatalog";
import { StepFields, blankStep } from "./StepsEditor";

/**
 * n8n-style node view of an agent's plan: Trigger → steps → Done, joined by
 * connectors. Editable mode adds "+" on every connector, hover delete,
 * drag-to-reorder and an edit panel for the selected node. `readOnly` shows
 * the same diagram for viewing, optionally with per-step run `statuses`.
 */

const CONNECTOR_ICON = { report: "chart", notify: "monitor", atlas_project: "plug" };

const STATUS = {
  done: { label: "Done", tone: "success", ring: "border-emerald-400" },
  approved: { label: "Approved", tone: "success", ring: "border-emerald-400" },
  skipped: { label: "Skipped", tone: "neutral", ring: "border-slate-300 border-dashed" },
  running: { label: "Running…", tone: "brand", ring: "border-brand-400 animate-pulse" },
  simulated: { label: "Simulated", tone: "neutral", ring: "border-slate-400" },
  waiting: { label: "Waiting for you", tone: "warning", ring: "border-amber-400 animate-pulse" },
  rejected: { label: "Stopped", tone: "warning", ring: "border-amber-400" },
  failed: { label: "Failed", tone: "danger", ring: "border-red-400" },
};

const stepKey = (s) => s.key ?? s.id;

function Handle({ side }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-slate-300 bg-surface",
        side === "left" ? "-left-1.5" : "-right-1.5",
      )}
    />
  );
}

function Edge({ onAdd, canAdd, active, index }) {
  return (
    <div className="relative flex w-14 shrink-0 items-center" aria-hidden={!onAdd}>
      <div className={cn("h-0.5 w-full", active ? "bg-brand-400" : "bg-slate-300")} />
      <span
        className={cn(
          "absolute -right-0.5 size-0 border-y-[5px] border-l-[7px] border-y-transparent",
          active ? "border-l-brand-400" : "border-l-slate-300",
        )}
      />
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          aria-label={`Add a step at position ${index + 1}`}
          title={canAdd ? "Add a step here" : `At most ${LIMITS.maxPlanSteps} steps`}
          className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-300 bg-surface text-slate-500 shadow-xs transition hover:border-brand-500 hover:bg-brand-500 hover:text-white disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:bg-surface disabled:hover:text-slate-500"
        >
          <Icon name="plus" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function TriggerNode({ label }) {
  return (
    <div className="relative w-44 shrink-0 rounded-l-[2rem] rounded-r-xl border-2 border-slate-200 bg-surface px-4 py-3 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="clock" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Trigger</p>
          <p className="line-clamp-2 text-xs font-medium text-ink">{label}</p>
        </div>
      </div>
      <Handle side="right" />
    </div>
  );
}

function EndNode({ status }) {
  const st = status && STATUS[status];
  return (
    <div className="relative flex shrink-0 flex-col items-center gap-1.5 self-center">
      <span
        className={cn(
          "grid size-12 place-items-center rounded-full border-2 bg-surface shadow-xs",
          st ? st.ring : "border-slate-200",
          status === "failed" ? "text-red-500" : "text-brand-600",
        )}
      >
        <Icon name={status === "failed" ? "close" : "check"} className="size-5" />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{status === "failed" ? "Ended" : "Done"}</span>
      <Handle side="left" />
    </div>
  );
}

function StepNode({ step, index, selected, status, readOnly, preApproved, onSelect, onDelete, drag }) {
  const tool = step.tool ? getTool(step.tool) : null;
  const st = status && STATUS[status];
  const invalid = !readOnly && !String(step.title || "").trim();
  const asks = tool?.requiresApproval && !preApproved.includes(tool.id);

  return (
    <div
      className={cn("group relative w-52 shrink-0", drag.over && "translate-x-1 transition-transform")}
      draggable={!readOnly}
      onDragStart={drag.onStart}
      onDragOver={drag.onOver}
      onDragLeave={drag.onLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onEnd}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={readOnly && !onSelect}
        aria-pressed={readOnly ? undefined : selected}
        aria-label={`Step ${index + 1}: ${step.title || "untitled"}`}
        className={cn(
          "block w-full rounded-xl border-2 bg-surface p-3 text-left shadow-xs transition",
          !readOnly && "cursor-grab hover:border-brand-300 active:cursor-grabbing",
          selected ? "border-brand-500 ring-4 ring-brand-500/15" : st ? st.ring : invalid ? "border-red-300" : "border-slate-200",
          drag.over && "border-dashed border-brand-500",
          readOnly && "cursor-default",
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              tool ? "bg-slate-100 text-slate-600" : "bg-violet-50 text-violet-600",
            )}
          >
            <Icon name={tool ? CONNECTOR_ICON[tool.connectorId] || "plug" : "sparkles"} className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-slate-400">
              Step {index + 1} · {tool ? tool.connectorName : "AI step"}
            </p>
            <p className={cn("line-clamp-2 text-sm font-semibold leading-snug", invalid ? "text-red-600" : "text-ink")}>
              {step.title || "Untitled step"}
            </p>
          </div>
        </div>
        {(tool || st) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tool && <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{tool.name}</span>}
            {st ? <Badge tone={st.tone}>{st.label}</Badge> : asks && <Badge tone="warning">Asks first</Badge>}
          </div>
        )}
      </button>
      <Handle side="left" />
      <Handle side="right" />
      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete step ${index + 1}`}
          title="Delete step"
          className={cn(
            "absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full border border-slate-200 bg-surface text-slate-400 shadow-xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 focus:opacity-100",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export default function StepsFlow({ steps, onChange, readOnly = false, preApproved = [], triggerLabel = "Manual", statuses = {}, endStatus = null }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const selectedIndex = steps.findIndex((s) => stepKey(s) === selectedKey);
  const selected = selectedIndex >= 0 ? steps[selectedIndex] : null;
  const canAdd = steps.length < LIMITS.maxPlanSteps;

  const update = (i, patch) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const insert = (i) => {
    const s = blankStep();
    onChange([...steps.slice(0, i), s, ...steps.slice(i)]);
    setSelectedKey(s.key);
  };
  const remove = (i) => {
    if (stepKey(steps[i]) === selectedKey) setSelectedKey(null);
    onChange(steps.filter((_, j) => j !== i));
  };
  const moveTo = (from, to) => {
    if (from === to || from == null || to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    onChange(next);
  };

  const dragProps = (i) =>
    readOnly
      ? {}
      : {
          over: dragOver === i && dragFrom !== i,
          onStart: (e) => {
            setDragFrom(i);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(i));
          },
          onOver: (e) => {
            if (dragFrom == null) return;
            e.preventDefault();
            setDragOver(i);
          },
          onLeave: () => setDragOver((o) => (o === i ? null : o)),
          onDrop: (e) => {
            e.preventDefault();
            moveTo(dragFrom, i);
            setDragFrom(null);
            setDragOver(null);
          },
          onEnd: () => {
            setDragFrom(null);
            setDragOver(null);
          },
        };

  const passed = (st) => !!st && st !== "running" && st !== "waiting";
  const reached = (i) => (i < 0 ? Object.keys(statuses).length > 0 || !!endStatus : passed(statuses[steps[i]?.id]));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 bg-[radial-gradient(circle,var(--color-slate-300)_1px,transparent_1px)] bg-size-[18px_18px]">
        <div className="flex w-max items-center p-6">
          <TriggerNode label={triggerLabel} />
          <Edge index={0} active={reached(-1)} canAdd={canAdd} onAdd={readOnly ? null : () => insert(0)} />
          {steps.length === 0 && (
            <>
              <div className="grid w-52 shrink-0 place-items-center rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                {readOnly ? "No steps." : "No steps yet — press + to add one."}
              </div>
              <Edge index={0} />
            </>
          )}
          {steps.map((s, i) => (
            <div key={stepKey(s)} className="flex items-center">
              <StepNode
                step={s}
                index={i}
                selected={!readOnly && stepKey(s) === selectedKey}
                status={statuses[s.id]}
                readOnly={readOnly}
                preApproved={preApproved}
                onSelect={readOnly ? null : () => setSelectedKey((k) => (k === stepKey(s) ? null : stepKey(s)))}
                onDelete={() => remove(i)}
                drag={dragProps(i)}
              />
              <Edge index={i + 1} active={reached(i)} canAdd={canAdd} onAdd={readOnly ? null : () => insert(i + 1)} />
            </div>
          ))}
          <EndNode status={endStatus} />
        </div>
      </div>

      {!readOnly && !selected && steps.length > 0 && (
        <p className="text-xs text-slate-500">Click a step to edit it. Drag steps to reorder, press + between steps to insert one.</p>
      )}

      {selected && (
        <div className="rounded-xl border border-brand-200 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Edit step {selectedIndex + 1}</p>
            <div className="flex items-center gap-1">
              <PanelButton label="Move left" onClick={() => moveTo(selectedIndex, selectedIndex - 1)} disabled={selectedIndex === 0}>
                <Icon name="arrowUp" className="size-4 -rotate-90" />
              </PanelButton>
              <PanelButton label="Move right" onClick={() => moveTo(selectedIndex, selectedIndex + 1)} disabled={selectedIndex === steps.length - 1}>
                <Icon name="arrowUp" className="size-4 rotate-90" />
              </PanelButton>
              <PanelButton label="Delete step" onClick={() => remove(selectedIndex)} danger>
                <Icon name="trash" className="size-4" />
              </PanelButton>
              <PanelButton label="Close" onClick={() => setSelectedKey(null)}>
                <Icon name="close" className="size-4" />
              </PanelButton>
            </div>
          </div>
          <div className="p-4">
            <StepFields step={selected} index={selectedIndex} onPatch={(patch) => update(selectedIndex, patch)} preApproved={preApproved} />
          </div>
        </div>
      )}
    </div>
  );
}

function PanelButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-slate-400 disabled:opacity-30 disabled:hover:bg-transparent",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
