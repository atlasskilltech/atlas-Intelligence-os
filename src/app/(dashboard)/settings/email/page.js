import { connection } from "next/server";
import EmailSenderForm from "@/components/settings/EmailSenderForm";
import PageHeader from "@/components/ui/PageHeader";
import { getSendGridConfig } from "@/lib/config/env";
import { getPageActor } from "@/lib/context";
import { getSenderFor } from "@/lib/email/senderSettings";

export const metadata = { title: "Email sender" };

export default async function EmailSenderPage() {
  await connection();
  const actor = await getPageActor();
  const sender = await getSenderFor(actor.id);
  return (
    <>
      <PageHeader
        title="Email sender"
        description="Choose which address your agents' emails come from. Emails always go to your own inbox."
      />
      <EmailSenderForm initialSender={sender} configured={Boolean(getSendGridConfig())} myEmail={actor.email || ""} />
    </>
  );
}
