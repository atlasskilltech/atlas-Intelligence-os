import { connection } from "next/server";
import HomeBody from "@/components/home/HomeBody";
import SettingsModal from "@/components/settings/SettingsModal";
import UsageContent from "@/components/usage/UsageContent";
import { getPageActor } from "@/lib/context";

export const metadata = { title: "Usage" };

/** Opened directly (refresh or link): the Settings popup over Home. It is never a full page. */
export default async function UsagePage() {
  await connection();
  const actor = await getPageActor();
  return (
    <>
      <HomeBody />
      <SettingsModal active="/usage" isAdmin={actor.role === "admin"} standalone>
        <UsageContent />
      </SettingsModal>
    </>
  );
}
