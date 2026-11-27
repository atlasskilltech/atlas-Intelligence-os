"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { Alert, Spinner } from "@/components/ui/States";
import { SUPER_AGENT } from "@/lib/portals/portalAgents";
import { api } from "./ProjectsSection";

const when = (iso) =>
  iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso)) + " IST" : "—";
const TONE = { ok: "success", partial: "warning", stale: "warning", error: "danger" };
const LABEL = { ok: "Up to date", partial: "Partly fetched", stale: "Last fetch failed (older memory kept)", error: "Not available" };

/**
 * NEXUS super memory (admin): what each connected portal's agent shared
 * (its <agent>_memory / <agent>_brain), when, and what failed — with "Rebuild now".
 */
export default function SuperMemorySection() {
  const [memory, setMemory] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshPortals, setRefreshPortals] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/memory/super");
      setMemory(d.memory);
      setError(null);
      return d.memory;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // While a build runs, check again every few seconds.
  useEffect(() => {
    if (!busy && !memory?.building) return;
    const t = setInterval(async () => {
      const m = await load();
      if (m && !m.building) setBusy(false);
    }, 4000);
    return () => clearInterval(t);
  }, [busy, memory?.building, load]);

  async function rebuild() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/memory/super", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshPortals }),
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const building = busy || memory?.building;
  return (
    <Card className="mt-6">
      <CardHeader
        title={`${SUPER_AGENT.name} super memory`}
        description={`Every night (02:30–04:30 IST), after a plugin connects, and on demand, ${SUPER_AGENT.name} reads each connected portal agent's memory and brain and keeps a summary, so it understands every portal without asking. Personal values are never stored.`}
      />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">
            Last built {when(memory?.builtAt)}
            {memory?.lastRun ? ` · ${memory.lastRun.reason}, ${memory.lastRun.ok}/${memory.lastRun.fetched?.length || 0} portals fine` : ""}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600" title="First asks each portal agent to rebuild its own memory, then reads it about a minute later. Slower.">
            <input type="checkbox" checked={refreshPortals} onChange={(e) => setRefreshPortals(e.target.checked)} disabled={building} />
            Rebuild portal memories too
          </label>
          <Button size="sm" variant="secondary" onClick={rebuild} disabled={building}>
            {building ? <Spinner className="size-3.5" /> : <Icon name="history" className="size-3.5" />} {building ? "Building…" : "Rebuild now"}
          </Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {memory && !memory.portals.length && (
          <p className="text-sm text-slate-500">No portal memory yet. Connect an ATLAS portal that offers a memory or brain action, then rebuild.</p>
        )}
        {memory?.portals?.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {memory.portals.map((p) => (
              <li key={p.projectId} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{p.portal}</span>
                  {p.persona && <span className="text-xs text-slate-500">{p.persona}</span>}
                  <Badge tone={TONE[p.status] || "warning"}>{LABEL[p.status] || p.status}</Badge>
                  <span className="ml-auto text-xs text-slate-500">{when(p.fetchedAt)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {p.actions.join(", ") || "—"} · {p.collections} collections · {p.vocabularies} value lists · {p.observations} observations
                </p>
                {p.gaps.length > 0 && <p className="text-xs text-amber-700">{p.gaps.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
        {memory?.links?.length > 0 && (
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Cross-portal links ({memory.links.length})</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {memory.links.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
