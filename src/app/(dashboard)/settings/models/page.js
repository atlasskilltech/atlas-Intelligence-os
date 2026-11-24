import ComingSoon from "@/components/ui/ComingSoon";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "Model Settings" };

export default function ModelSettingsPage() {
  return (
    <>
      <PageHeader
        title="Model Settings"
        description="Choose which AI models plan and run your agents, and set safety limits."
      />
      <ComingSoon
        milestone={2}
        icon="cpu"
        title="AI provider not connected"
        description="OpenAI will be connected through a server-side provider layer. API keys stay on the server and are never shown here."
      />
    </>
  );
}
