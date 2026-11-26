import { connection } from "next/server";
import HomeBody from "@/components/home/HomeBody";
import SettingsModal from "@/components/settings/SettingsModal";
import SettingsContent from "@/components/settings/SettingsContent";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Settings" };

/** Opened directly (refresh or link): the Settings popup over Home. It is never a full page. */
export default async function SettingsPage() {
  await connection();
  const actor = await getPageActor();
  return (
    <>
      <HomeBody />
      <SettingsModal active="/settings/models" isAdmin={actor.role === "admin"} standalone>
        <SettingsContent />
      </SettingsModal>
    </>
  );
}
