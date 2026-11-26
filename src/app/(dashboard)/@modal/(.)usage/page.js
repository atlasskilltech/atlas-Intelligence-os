import { connection } from "next/server";
import SettingsModal from "@/components/settings/SettingsModal";
import UsageContent from "@/components/usage/UsageContent";

/** /usage opened from inside the app: show it in the Settings popup. */
export default async function UsagePopup() {
  await connection();
  return (
    <SettingsModal active="/usage">
      <UsageContent />
    </SettingsModal>
  );
}
