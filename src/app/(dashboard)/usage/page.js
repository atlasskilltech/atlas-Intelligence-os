import { connection } from "next/server";
import UsageContent from "@/components/usage/UsageContent";

export const metadata = { title: "Usage" };

export default async function UsagePage() {
  await connection();
  return <UsageContent />;
}
