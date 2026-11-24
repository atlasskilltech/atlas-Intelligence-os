import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/States";

export const metadata = { title: "Connectors" };

// Roadmap only — nothing here is connected yet. Real connectors are registered in Milestones 6–8.
const PLANNED = [
  { group: "ATLAS internal", name: "ATLAS University website", detail: "Page health, broken links, content checks", milestone: 7 },
  { group: "ATLAS internal", name: "ATLAS CRM / Admissions", detail: "Leads, duplicates, status reports via a secure Agent API", milestone: 7 },
  { group: "General", name: "Custom REST API", detail: "Connect any approved API by configuration", milestone: 6 },
  { group: "External", name: "Gmail", detail: "Read mail, send with approval", milestone: 8 },
  { group: "External", name: "Google Calendar", detail: "Read and create events with approval", milestone: 8 },
];

export default function ConnectorsPage() {
  return (
    <>
      <PageHeader
        title="Connectors"
        description="Connectors are the approved apps and actions your agents are allowed to use."
      />
      <Alert tone="info" className="mb-6" title="No connectors are active yet">
        The list below is the planned rollout. Each connector will show its actions, risk level and a
        connection test once it is built.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLANNED.map((c) => (
          <Card key={c.name} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="plug" />
              </span>
              <Badge>Milestone {c.milestone}</Badge>
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">{c.group}</p>
            <h3 className="mt-1 text-sm font-semibold text-ink">{c.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{c.detail}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
