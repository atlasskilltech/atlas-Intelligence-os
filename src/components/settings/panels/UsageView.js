import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { fmtDateTime, fmtInr, fmtInt, fmtUsd } from "@/components/ui/format";
import PanelHeader from "./PanelHeader";
import StatCard from "@/components/ui/StatCard";
import StorageNoticeView from "@/components/ui/StorageNoticeView";
import { Alert, EmptyState } from "@/components/ui/States";

const PURPOSE_LABEL = { planner: "Agent planning", agent: "Agent runs", agent_run: "Agent runs", chat: "Questions", voice: "Voice assistant", test: "Connection tests", other: "Other" };

/** "2026-11" → "Nov 2026". */
const fmtMonth = (key) => {
  const [y, m] = String(key).split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
};

function Breakdown({ title, rows, labelFor = (k) => k, mono, inrRate }) {
  const max = Math.max(...rows.map((r) => r.inputTokens + r.outputTokens), 1);
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">Name</th>
              <th className="px-5 py-2.5 text-right font-medium">Calls</th>
              <th className="px-5 py-2.5 font-medium">Tokens</th>
              <th className="px-5 py-2.5 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const tokens = r.inputTokens + r.outputTokens;
              return (
                <tr key={r.key}>
                  <td className={`px-5 py-2.5 text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{labelFor(r.key)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {fmtInt(r.calls)}
                    {r.failed > 0 && <span className="ml-1 text-xs text-red-600">({r.failed} failed)</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(tokens / max) * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-slate-600">{fmtInt(tokens)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {fmtUsd(r.costUsd)}
                    {r.unpricedCalls > 0 && <span className="ml-1 text-xs text-amber-700">+ unpriced</span>}
                    {inrRate ? <span className="block text-xs text-slate-400">{fmtInr(r.costUsd, inrRate)}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Usage tab of the Settings popup: tokens and estimated AI cost. Data comes from /api/settings/panel/usage. */
export default function UsageView({ usage: u, inrRate = 88, agentNames = {}, temporary = false }) {
  const agentName = new Map(Object.entries(agentNames));
  const byAgent = u.byAgent.map((r) => ({ ...r, label: agentName.get(r.key) || `${r.key} (removed)` }));

  return (
    <>
      <PanelHeader
        title="Usage"
        description="Tokens used and estimated AI cost over the last 30 days, per agent. Costs are estimates based on the prices and ₹ rate in Settings."
      />

      <StorageNoticeView temporary={temporary} what="Usage records" />
      <div className="grid gap-4 @sm:grid-cols-2 @5xl:grid-cols-4">
        <StatCard
          label="AI calls (30 days)"
          value={fmtInt(u.totals.calls)}
          icon="cpu"
          hint={u.totals.failed ? `${u.totals.failed} failed` : "No failures"}
        />
        <StatCard label="Input tokens" value={fmtInt(u.totals.inputTokens)} icon="chart" />
        <StatCard label="Output tokens" value={fmtInt(u.totals.outputTokens)} icon="chart" />
        <StatCard
          label="Cost this month"
          value={fmtUsd(u.thisMonth.costUsd)}
          icon="chart"
          hint={`≈ ${fmtInr(u.thisMonth.costUsd, inrRate)} · estimated`}
        />
      </div>

      {u.totals.unpricedCalls > 0 && (
        <Alert tone="warning" className="mt-6" title={`${u.totals.unpricedCalls} call(s) used a model with no price set`}>
          Their tokens are counted but not included in cost. Add the model&apos;s price in{" "}
          <a href="#settings/settings" className="font-medium underline">
            Settings
          </a>
          .
        </Alert>
      )}

      {u.totals.calls === 0 ? (
        <EmptyState
          className="mt-6"
          icon="chart"
          title="No AI usage recorded yet"
          description="Every AI call is logged here with its tokens and estimated cost. Run a connection test to record the first one."
          action={
            <Button href="#settings/settings" variant="secondary">
              Go to Settings
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid gap-6 [&>*]:min-w-0">
          {u.byMonth?.length > 0 && (
            <Breakdown title="By month (spend tracking, last 12 months)" rows={u.byMonth} labelFor={fmtMonth} inrRate={inrRate} />
          )}
          {byAgent.length > 0 && (
            <Breakdown title="By agent (tokens & cost)" rows={byAgent} labelFor={(k) => agentName.get(k) || `${k} (removed)`} inrRate={inrRate} />
          )}
          <Breakdown title="By day" rows={u.byDay} inrRate={inrRate} />
          <Breakdown title="By model" rows={u.byModel} mono inrRate={inrRate} />
          <Breakdown title="By purpose" rows={u.byPurpose} labelFor={(k) => PURPOSE_LABEL[k] || k} inrRate={inrRate} />
          <Card>
            <CardHeader title="Recent calls" />
            <ul className="divide-y divide-slate-100">
              {u.recent.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-700">{e.model}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDateTime(e.ts)} · {PURPOSE_LABEL[e.purpose] || e.purpose}
                    </p>
                  </div>
                  <div className="text-xs">
                    {e.ok ? (
                      <span className="tabular-nums text-slate-600">
                        {fmtInt((e.inputTokens || 0) + (e.outputTokens || 0))} tok ·{" "}
                        {e.costUsd == null ? "unpriced" : fmtUsd(e.costUsd)}
                      </span>
                    ) : (
                      <Badge tone="danger">{e.errorType}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
