import Link from "next/link";
import { connection } from "next/server";
import PromptComposer from "@/components/agents/PromptComposer";
import { PROMPT_SUGGESTIONS } from "@/components/agents/suggestions";
import { fmtInt, fmtUsd } from "@/components/ui/format";
import { countAgents } from "@/lib/agents/agentRepo";
import { getActor } from "@/lib/context";
import { getUsageSummary } from "@/lib/usage/usageStore";

export const metadata = { title: "Home" };

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  await connection();
  const [usage, agentCounts] = await Promise.all([getUsageSummary({ days: 31, recent: 0 }), countAgents(getActor())]);

  const stats = [
    { label: "Active agents", value: fmtInt(agentCounts.active), href: "/agents?status=active" },
    { label: "Runs today", value: "0", href: "/runs" },
    { label: "Awaiting approval", value: "0", href: "/runs" },
    { label: "AI cost this month", value: fmtUsd(usage.thisMonth.costUsd), href: "/usage" },
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-6 sm:px-6">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-brand-600">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            What would you like to automate?
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
            Describe a task in plain language. IntelligenceOS turns it into an AI agent with a step-by-step plan you
            review before anything runs.
          </p>
        </div>

        <PromptComposer autoFocus suggestions={PROMPT_SUGGESTIONS} />

        <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-lg border border-slate-200 bg-surface px-4 py-3 transition-colors hover:border-brand-500/40"
            >
              <dt className="text-xs text-slate-500">{s.label}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-ink">{s.value}</dd>
            </Link>
          ))}
        </dl>
      </div>
    </div>
  );
}
