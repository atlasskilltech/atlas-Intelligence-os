import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import PageHeader from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/States";

export const metadata = { title: "Create Agent" };

const STEPS = ["Describe", "Review plan", "Test & activate"];

const EXAMPLES = [
  "Every morning, check new admission leads in our CRM, identify duplicate entries, summarize the lead status, and prepare a daily report.",
  "Every Monday, check atlasuniversity.edu.in for broken links and send me a summary.",
  "When a new research paper is submitted, check required fields and notify the reviewer.",
];

export default function CreateAgentPage() {
  return (
    <>
      <PageHeader
        title="Create an agent"
        description="Describe a task in plain language. IntelligenceOS will turn it into an agent with a plan you can review before anything runs."
      />

      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-semibold",
                i === 0 ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600",
              )}
            >
              {i + 1}
            </span>
            <span className={i === 0 ? "font-medium text-slate-900" : "text-slate-500"}>{step}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300 sm:w-10" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="prompt" className="text-sm font-medium text-slate-900">
                What should your agent do?
              </label>
              <Badge tone="brand">Available in Milestone 3</Badge>
            </div>
            <textarea
              id="prompt"
              rows={7}
              disabled
              placeholder="e.g. Every morning, check new admission leads in our CRM and prepare a daily report…"
              className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed"
            />
            <Alert tone="info">
              Agent generation needs the AI provider, which is connected in Milestone 2 and wired to this
              form in Milestone 3.
            </Alert>
            <div className="flex justify-end">
              <Button disabled>Generate agent</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-sm font-medium text-slate-900">Example prompts</p>
            <ul className="mt-3 space-y-2">
              {EXAMPLES.map((e) => (
                <li key={e} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {e}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
