import { connection } from "next/server";
import SettingsModal from "@/components/settings/SettingsModal";
import UsageContent from "@/components/usage/UsageContent";
import { getPageActor } from "@/lib/context";

/** /usage opened from inside the app: show it in the Settings popup. */
export default async function UsagePopup() {
  await connection();
  const actor = await getPageActor();
  return (
    <SettingsModal active="/usage" isAdmin={actor.role === "admin"}>
      <UsageContent />
    </SettingsModal>
  );
}
