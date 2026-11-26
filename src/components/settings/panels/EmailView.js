import EmailSenderForm from "@/components/settings/EmailSenderForm";
import PageHeader from "@/components/ui/PageHeader";

/** Email sender tab of the Settings popup. Data comes from /api/settings/panel/email. */
export default function EmailView({ sender, configured, myEmail }) {
  return (
    <>
      <PageHeader
        title="Email sender"
        description="Choose which address your agents' emails come from. Emails always go to your own inbox."
      />
      <EmailSenderForm initialSender={sender} configured={configured} myEmail={myEmail} />
    </>
  );
}
