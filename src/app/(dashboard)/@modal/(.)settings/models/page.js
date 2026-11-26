import { connection } from "next/server";
import SettingsContent from "@/components/settings/SettingsContent";
import SettingsModal from "@/components/settings/SettingsModal";
import { getPageActor } from "@/lib/context";

/** /settings/models opened from inside the app: show it in the Settings popup. */
export default async function SettingsPopup() {
  await connection();
  const actor = await getPageActor();
  return (
    <SettingsModal active="/settings/models" isAdmin={actor.role === "admin"}>
      <SettingsContent />
    </SettingsModal>
  );
}
