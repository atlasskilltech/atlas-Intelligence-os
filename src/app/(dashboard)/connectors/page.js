import { connection } from "next/server";
import Link from "next/link";
import ProjectsSection from "@/components/connectors/ProjectsSection";
import Icon from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import StorageNotice from "@/components/ui/StorageNotice";
import { getEncryptionKey } from "@/lib/config/env";
import { connectorOverview } from "@/lib/connectors";
import { listProjects, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Connectors" };

export default async function ConnectorsPage() {
  await connection();
  const [overview, projects] = await Promise.all([connectorOverview(), listProjects()]);
  const isAdmin = (await getPageActor()).role === "admin";
  const email = overview.find((c) => c.id === "email");

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Connect your ATLAS apps so agents can use them. Actions that change data or send messages always ask for approval."
      />
      <StorageNotice>
        API connections are saved in the server&apos;s temporary folder and can disappear whenever Vercel restarts the app.
        Use the always-on server for connections you rely on.
      </StorageNotice>

      <p className="flex items-start gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-500">
        <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <span>
          Every agent can already create a report, notify you in the dashboard and email you. These are built in and need no setup.
          {email && !email.ready && (
            <>
              {" "}
              Email isn&apos;t ready yet: {email.message}{" "}
              <Link href="/settings/email" className="font-medium text-brand-600 hover:underline">
                Email sender
              </Link>
            </>
          )}
        </span>
      </p>

      <ProjectsSection
        initialProjects={projects.map(publicProject)}
        isAdmin={isAdmin}
        canStoreKeys={(getEncryptionKey() || "").length >= 16}
      />
    </>
  );
}
