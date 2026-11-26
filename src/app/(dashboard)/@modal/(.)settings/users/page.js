import { connection } from "next/server";
import SettingsModal from "@/components/settings/SettingsModal";
import AccountContent from "@/components/users/AccountContent";
import { getPageActor } from "@/lib/context";

/** /settings/users opened from inside the app: show it in the Settings popup. */
export default async function AccountPopup() {
  await connection();
  const actor = await getPageActor();
  return (
    <SettingsModal active="/settings/users" isAdmin={actor.role === "admin"}>
      <AccountContent />
    </SettingsModal>
  );
}
