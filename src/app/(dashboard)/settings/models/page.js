import { connection } from "next/server";
import ModelSettingsForm from "@/components/settings/ModelSettingsForm";
import { Card, CardHeader } from "@/components/ui/Card";
import { fmtInr, fmtInt, fmtUsd } from "@/components/ui/format";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import StorageNotice from "@/components/ui/StorageNotice";
import { EmptyState } from "@/components/ui/States";
import { getAIStatus } from "@/lib/ai";
import { DEFAULT_PRICING } from "@/lib/ai/pricing";
import { listAgents } from "@/lib/agents/agentRepo";
import { getPageActor } from "@/lib/context";
import { ELEVENLABS_MODELS, getModelSettings, LIMITS, MAX_ELEVENLABS_VOICES } from "@/lib/settings/modelSettings";
import { getUsageSummary } from "@/lib/usage/usageStore";

export const metadata = { title: "Model Settings" };

export default async function ModelSettingsPage() {
  await connection();
  const actor = await getPageActor();
  const settings = await getModelSettings();
  const [usage, agents] = await Promise.all([getUsageSummary({ days: 30, pricingOverrides: settings.pricingOverrides }), listAgents(actor)]);
  const status = getAIStatus();

  const inrRate = settings.inrPerUsd || 88;
  const nameOf = new Map(agents.map((a) => [a.id, a.config?.name || a.id]));
  const totalTokens = usage.totals.inputTokens + usage.totals.outputTokens;
  const byAgent = usage.byAgent.map((r) => ({
    name: nameOf.get(r.key) || `${r.key} (removed)`,
    tokens: r.inputTokens + r.outputTokens,
    costUsd: r.costUsd,
    unpriced: r.unpricedCalls,
  }));

  return (
    <>
      <PageHeader
        title="Model Settings"
        description="Choose which AI models plan and run your agents, and set safety limits. API keys stay on the server and are never shown here."
      />
      <StorageNotice what="Settings" />

      <Card className="mb-6">
        <CardHeader
          title="Token usage & cost — last 30 days"
          description="How many tokens each agent used and the estimated cost, in dollars and rupees."
        />
        <div className="grid grid-cols-1 gap-4 border-b border-slate-100 p-5 sm:grid-cols-3">
          <StatCard label="Total tokens (30 days)" value={fmtInt(totalTokens)} icon="chart" />
          <StatCard label="Total cost (USD)" value={fmtUsd(usage.totals.costUsd)} icon="chart" hint="Estimated" />
          <StatCard label="Total cost (₹)" value={fmtInr(usage.totals.costUsd, inrRate)} icon="chart" hint={`at ₹${inrRate} / $1`} />
        </div>
        {byAgent.length === 0 ? (
          <EmptyState icon="bot" title="No agent usage yet" description="Run an agent to see its tokens and cost here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Agent</th>
                  <th className="px-5 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-5 py-2.5 text-right font-medium">Cost ($)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Cost (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byAgent.map((r, i) => (
                  <tr key={i}>
                    <td className="px-5 py-2.5 text-slate-700">{r.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">{fmtInt(r.tokens)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {fmtUsd(r.costUsd)}
                      {r.unpriced > 0 && <span className="ml-1 text-xs text-amber-700">+ unpriced</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">{fmtInr(r.costUsd, inrRate)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                <tr>
                  <td className="px-5 py-2.5 text-slate-700">Total</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{fmtInt(totalTokens)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{fmtUsd(usage.totals.costUsd)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-700">{fmtInr(usage.totals.costUsd, inrRate)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <ModelSettingsForm
        initialSettings={settings}
        status={status}
        limits={LIMITS}
        defaultPricing={DEFAULT_PRICING}
        elevenlabsModels={ELEVENLABS_MODELS}
        maxVoices={MAX_ELEVENLABS_VOICES}
      />
    </>
  );
}
