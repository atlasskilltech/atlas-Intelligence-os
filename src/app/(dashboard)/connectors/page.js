import { connection } from "next/server";
import ProjectsSection from "@/components/connectors/ProjectsSection";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import StorageNotice from "@/components/ui/StorageNotice";
import { RISK_LEVELS } from "@/lib/catalog/toolCatalog";
import { getEncryptionKey } from "@/lib/config/env";
import { connectorOverview } from "@/lib/connectors";
import { listProjects, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Connectors" };

const GROUPS = { "built-in": "Built in", general: "General", atlas: "ATLAS internal", external: "External" };

export default async function ConnectorsPage() {
  await connection();
  const [overview, projects] = await Promise.all([connectorOverview(), listProjects()]);
  const isAdmin = (await getPageActor()).role === "admin";

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Connectors are the approved apps and actions your agents are allowed to use. Actions that change data or send messages always ask for approval."
      />
      <StorageNotice>
        API connections are saved in the server&apos;s temporary folder and can disappear whenever Vercel restarts the app.
        Use the always-on server for connections you rely on.
      </StorageNotice>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {overview.map((c) => (
          <Card key={c.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <span className={`grid size-10 place-items-center rounded-lg ${c.ready ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-500"}`}>
                <Icon name="plug" />
              </span>
              {c.ready ? (
                <Badge tone="success">
                  <Icon name="check" className="size-3" /> Ready
                </Badge>
              ) : c.built ? (
                <Badge tone="warning">Needs setup</Badge>
              ) : (
                <Badge>Milestone {c.availableIn}</Badge>
              )}
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">{GROUPS[c.category] || c.category}</p>
            <h3 className="mt-1 text-sm font-semibold text-ink">{c.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{c.description}</p>
            <p className="mt-2 text-xs text-slate-500">{c.message}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {c.actions.map((a) => (
                <li key={a.id}>
                  <Badge tone={RISK_LEVELS[a.risk].tone === "success" ? "neutral" : RISK_LEVELS[a.risk].tone} className="font-normal">
                    {a.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <ProjectsSection
        initialProjects={projects.map(publicProject)}
        isAdmin={isAdmin}
        canStoreKeys={(getEncryptionKey() || "").length >= 16}
      />
    </>
  );
}
