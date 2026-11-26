import ModelSettingsForm from "@/components/settings/ModelSettingsForm";
import PageHeader from "@/components/ui/PageHeader";
import StorageNotice from "@/components/ui/StorageNotice";
import { getAIStatus } from "@/lib/ai";
import { DEFAULT_PRICING } from "@/lib/ai/pricing";
import { ELEVENLABS_MODELS, getModelSettings, LIMITS, MAX_ELEVENLABS_VOICES } from "@/lib/settings/modelSettings";

/** Model settings. Shown as a page (/settings/models) and in the Settings popup. */
export default async function SettingsContent() {
  const settings = await getModelSettings();
  const status = getAIStatus();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Choose which AI models plan and run your agents, and set safety limits. API keys stay on the server and are never shown here."
      />
      <StorageNotice what="Settings" />

      <ModelSettingsForm
        initialSettings={settings}
        status={status}
        limits={LIMITS}
        defaultPricing={DEFAULT_PRICING}
        elevenlabsModels={ELEVENLABS_MODELS}
        maxVoices={MAX_ELEVENLABS_VOICES}
      />
    </>
  );
}
