import { connection } from "next/server";
import SettingsContent from "@/components/settings/SettingsContent";

export const metadata = { title: "Settings" };

export default async function ModelSettingsPage() {
  await connection();
  return <SettingsContent />;
}
