import Link from "next/link";
import { StatusBadge } from "@/components/agents/AgentStatus";
import { Card } from "@/components/ui/Card";
import { fmtInr, fmtInt, fmtUsd } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/States";

function Avatar({ name, email, picture }) {
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element -- Google profile photo
    return <img src={picture} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />;
  }
  const letter = (name || email || "?").trim()[0]?.toUpperCase() || "?";
  return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-navy-800 text-sm font-bold text-white">{letter}</span>;
}

function Cost({ usd, inrRate, unpriced, className = "" }) {
  return (
    <span className={`text-right tabular-nums ${className}`}>
      <span className="block font-medium text-ink">
        {fmtUsd(usd)}
        {unpriced > 0 && <span className="ml-1 text-[11px] font-normal text-amber-600">+ unpriced</span>}
      </span>
      <span className="block text-xs text-slate-500">{fmtInr(usd, inrRate)}</span>
    </span>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * All Agents popup (#agents), separate from Settings: who built how many agents, and each
 * agent's all-time tokens and estimated cost in $ and ₹. Admins see everyone.
 * Data comes from /api/settings/panel/agents.
 */
export default function AgentsView({ isAdmin, inrRate = 88, owners = [], totals }) {
  return (
    <>
      <p className="mb-5 text-sm text-slate-500">
        {isAdmin
          ? "Everyone's agents: who built how many, and what each has used so far in tokens and estimated cost."
          : "Your agents and what each has used so far in tokens and estimated cost."}
      </p>

      {owners.length === 0 ? (
        <EmptyState icon="bot" title="No agents yet" description="Agents appear here once someone builds one from Home." />
      ) : (
        <>
          <div className="mb-6 grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-4">
            {isAdmin && <Stat label="People" value={fmtInt(totals.people)} hint="who built an agent" />}
            <Stat label="Agents" value={fmtInt(totals.agents)} hint={`${fmtInt(totals.active)} active`} />
            <Stat label="Tokens used" value={fmtInt(totals.tokens)} hint="all time" />
            <Stat label="Estimated cost" value={fmtUsd(totals.costUsd)} hint={`≈ ${fmtInr(totals.costUsd, inrRate)}`} />
          </div>

          <div className="space-y-3">
            {owners.map((o, i) => (
              <Card key={o.ownerId} className="overflow-hidden">
                <details open={owners.length === 1 || i === 0} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <Avatar name={o.name} email={o.email} picture={o.picture} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <span className="truncate">{o.name || o.email || "Unknown user"}</span>
                        {o.isYou && <span className="shrink-0 rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold uppercase text-brand-700">You</span>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {o.name && o.email ? `${o.email} · ` : ""}
                        {fmtInt(o.agentCount)} agent{o.agentCount === 1 ? "" : "s"} · {fmtInt(o.activeCount)} active · {fmtInt(o.tokens)} tokens
                      </span>
                    </span>
                    <Cost usd={o.costUsd} inrRate={inrRate} unpriced={o.unpricedCalls} />
                    <Icon name="chevronsUpDown" className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="overflow-x-auto border-t border-slate-200">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Agent</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 text-right font-medium">AI calls</th>
                          <th className="px-4 py-2 text-right font-medium">Tokens</th>
                          <th className="px-4 py-2 text-right font-medium">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {o.agents.map((a) => (
                          <tr key={a.id}>
                            <td className="max-w-[16rem] px-4 py-2">
                              <Link href={`/agents/${a.id}`} className="block truncate font-medium text-slate-700 hover:text-brand-600" title={a.name}>
                                {a.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2">
                              <StatusBadge status={a.status} />
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtInt(a.calls)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtInt(a.tokens)}</td>
                            <td className="px-4 py-2">
                              <Cost usd={a.costUsd} inrRate={inrRate} unpriced={a.unpricedCalls} className="block" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Costs are estimates from the prices and ₹ rate in Settings, over all recorded usage.</p>
        </>
      )}
    </>
  );
}
