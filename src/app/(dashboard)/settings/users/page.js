import { connection } from "next/server";
import HomeBody from "@/components/home/HomeBody";
import SettingsModal from "@/components/settings/SettingsModal";
import AccountContent from "@/components/users/AccountContent";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Account" };

/** Opened directly (refresh or link): the Settings popup over Home. It is never a full page. */
export default async function AccountPage() {
  await connection();
  const actor = await getPageActor();
  return (
    <>
      <HomeBody />
      <SettingsModal active="/settings/users" isAdmin={actor.role === "admin"} standalone>
        <AccountContent />
      </SettingsModal>
    </>
  );
}
