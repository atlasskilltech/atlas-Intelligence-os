import { connection } from "next/server";
import SettingsContent from "@/components/settings/SettingsContent";
import SettingsModal from "@/components/settings/SettingsModal";

/** /settings/models opened from inside the app: show it in the Settings popup. */
export default async function SettingsPopup() {
  await connection();
  return (
    <SettingsModal active="/settings/models">
      <SettingsContent />
    </SettingsModal>
  );
}
