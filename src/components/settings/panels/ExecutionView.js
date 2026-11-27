"use client";

import Link from "next/link";
import { useState } from "react";
import RunTable from "@/components/runs/RunTable";
import { EmptyState } from "@/components/ui/States";
import PanelHeader from "./PanelHeader";

// Same groups as the Execution page ("queued", "running" and "waiting_approval" are in progress).
const IN_PROGRESS = ["queued", "running", "waiting_approval"];
const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "In progress", test: (r) => IN_PROGRESS.includes(r.status) },
  { id: "waiting_approval", label: "Needs approval", test: (r) => r.status === "waiting_approval" },
  { id: "succeeded", label: "Succeeded", test: (r) => r.status === "succeeded" },
  { id: "failed", label: "Failed", test: (r) => r.status === "failed" },
];

/**
 * Execution tab of the Settings popup: the latest agent runs, filtered by
 * status. Click a run for its step-by-step log; the full Execution page has
 * more filters and the logs view. Data: /api/settings/panel/execution.
 */
export default function ExecutionView({ runs = [], projects = [] }) {
  const [filter, setFilter] = useState("all");
  const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
  const shown = runs.filter(f.test);

  return (
    <>
      <PanelHeader title="Execution" description="Your agents' latest runs. Click one to see each step and its result." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Show" className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-surface p-0.5">
          {FILTERS.map((x) => {
            const n = runs.filter(x.test).length;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={filter === x.id}
                onClick={() => setFilter(x.id)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  filter === x.id ? "bg-slate-100 font-medium text-ink" : "text-slate-500 hover:text-ink"
                }`}
              >
                {x.label}
                {x.id !== "all" && n > 0 && <span className="ml-1 text-xs text-slate-400">{n}</span>}
              </button>
            );
          })}
        </div>
        <Link href="/runs" className="text-sm font-medium text-brand-600 hover:underline">
          Open full Execution (filters &amp; logs) →
        </Link>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="history"
          title={runs.length === 0 ? "No runs yet" : "No runs match this filter"}
          description={runs.length === 0 ? "Open an agent and press Run test to see it work." : "Pick another filter."}
        />
      ) : (
        <RunTable runs={shown} projects={projects} />
      )}
      {runs.length >= 100 && <p className="mt-3 text-xs text-slate-500">Showing the latest 100 runs.</p>}
    </>
  );
}
