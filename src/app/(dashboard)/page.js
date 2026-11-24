import { connection } from "next/server";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { fmtUsd } from "@/components/ui/format";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";
import { getUsageSummary } from "@/lib/usage/usageStore";

export const metadata = { title: "Overview" };

const HOW_IT_WORKS = [
  { icon: "sparkles", title: "Describe the task", text: "Explain in plain language what you want automated." },
  { icon: "check", title: "Review the plan", text: "See the steps, tools and permissions before anything runs." },
  { icon: "shield", title: "Approve & activate", text: "Test safely, then run it manually or on a schedule." },
];

export default async function OverviewPage() {
  await connection();
  const usage = await getUsageSummary({ days: 31, recent: 0 });
  return (
    <>
      <PageHeader
        title="Overview"
        description="See what your AI agents are doing, what needs your attention, and how much they cost."
        actions={
          <Button href="/agents/new">
            <Icon name="plus" className="size-4" />
            Create agent
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active agents" value="0" icon="bot" />
        <StatCard label="Runs today" value="0" icon="history" />
        <StatCard label="Awaiting approval" value="0" icon="shield" />
        <StatCard label="Cost this month" value={fmtUsd(usage.thisMonth.costUsd)} icon="chart" hint="Estimated" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Latest agent runs across your workspace." />
          <CardBody>
            <EmptyState
              className="border-0"
              icon="history"
              title="No agent runs yet"
              description="When your agents run, their results and any errors will appear here."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How it works" />
          <CardBody>
            <ol className="space-y-4">
              {HOW_IT_WORKS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.title}</p>
                    <p className="text-sm text-slate-500">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
