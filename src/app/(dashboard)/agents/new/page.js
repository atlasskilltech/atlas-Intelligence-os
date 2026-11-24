import PromptComposer from "@/components/agents/PromptComposer";
import { PROMPT_SUGGESTIONS } from "@/components/agents/suggestions";
import { cn } from "@/components/ui/cn";
import PageHeader from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/States";

export const metadata = { title: "New agent" };

const STEPS = ["Describe", "Review plan", "Test & activate"];

export default async function NewAgentPage({ searchParams }) {
  const { prompt } = await searchParams;
  const initial = typeof prompt === "string" ? prompt.slice(0, 4000) : "";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Create an agent"
        description="Describe the task. IntelligenceOS will propose an agent with a plan you can review and edit before anything runs."
      />

      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-bold",
                i === 0 ? "bg-brand-500 text-white" : "bg-slate-200 text-slate-500",
              )}
            >
              {i + 1}
            </span>
            <span className={i === 0 ? "font-semibold text-navy-800" : "text-slate-500"}>{step}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300 sm:w-10" />}
          </li>
        ))}
      </ol>

      <PromptComposer
        key={initial}
        defaultValue={initial}
        disabled
        suggestions={PROMPT_SUGGESTIONS}
        footer={
          <Alert tone="info" title="Agent generation arrives in Milestone 3">
            Your prompt is kept here. In the next milestone, continuing will generate the agent&apos;s name, steps,
            tools, schedule and permissions for you to review.
          </Alert>
        }
      />
    </div>
  );
}
