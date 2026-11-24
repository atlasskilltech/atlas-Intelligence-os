import { notFound } from "next/navigation";
import { connection } from "next/server";
import ProjectDetail from "@/components/connectors/ProjectDetail";
import { getProject, publicProject } from "@/lib/connectors/projects/projectRepo";
import { getActor } from "@/lib/context";

export const metadata = { title: "Project access" };

export default async function ProjectPage({ params }) {
  await connection();
  const { id } = await params;
  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }
  return <ProjectDetail initialProject={publicProject(project)} isAdmin={getActor().role === "admin"} />;
}
