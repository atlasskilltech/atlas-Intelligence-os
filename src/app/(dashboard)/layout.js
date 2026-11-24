import { connection } from "next/server";
import AppShell from "@/components/layout/AppShell";
import { getAIStatus } from "@/lib/ai";

export default async function DashboardLayout({ children }) {
  await connection(); // render per request: status reflects the live server config
  const ai = getAIStatus();
  return <AppShell aiConfigured={ai.configured}>{children}</AppShell>;
}
