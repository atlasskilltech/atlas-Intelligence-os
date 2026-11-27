import { connection } from "next/server";
import Link from "next/link";
import ProjectsSection from "@/components/connectors/ProjectsSection";
import Icon from "@/components/ui/Icon";
import StorageNotice from "@/components/ui/StorageNotice";
import { getEncryptionKey } from "@/lib/config/env";
import { connectorOverview } from "@/lib/connectors";
import { listProjects, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Plugins" };

export default async function ConnectorsPage() {
  await connection();
  const [overview, projects] = await Promise.all([connectorOverview(), listProjects()]);
  const isAdmin = (await getPageActor()).role === "admin";
  const email = overview.find((c) => c.id === "email");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <StorageNotice>
        Plugin connections are saved in the server&apos;s temporary folder and can disappear whenever Vercel restarts the app.
        Use the always-on server for connections you rely on.
      </StorageNotice>

      <ProjectsSection
        initialProjects={projects.map(publicProject)}
        isAdmin={isAdmin}
        canStoreKeys={(getEncryptionKey() || "").length >= 16}
        notice={
          <p className="flex items-start gap-2 text-sm text-slate-500">
            <Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <span>
              Plugins let your agents use ATLAS apps. Every agent can also create a report, notify you and email you; those are built in.
              Actions that change data or send messages always ask for approval.
              {email && !email.ready && (
                <>
                  {" "}
                  Email isn&apos;t ready yet: {email.message}{" "}
                  <a href="#settings/email" className="font-medium text-brand-600 hover:underline">
                    Email sender
                  </a>
                </>
              )}
            </span>
          </p>
        }
      />
    </div>
  );
}
