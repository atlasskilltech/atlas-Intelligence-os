import ModelSettingsForm from "@/components/settings/ModelSettingsForm";
import PageHeader from "@/components/ui/PageHeader";
import StorageNoticeView from "@/components/ui/StorageNoticeView";

/** Settings tab of the Settings popup: models and limits. Data comes from /api/settings/panel/settings. */
export default function SettingsView({ temporary, settings, status, limits, defaultPricing, elevenlabsModels, maxVoices }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Choose which AI models plan and run your agents, and set safety limits. API keys stay on the server and are never shown here."
      />
      <StorageNoticeView temporary={temporary} what="Settings" />
      <ModelSettingsForm
        initialSettings={settings}
        status={status}
        limits={limits}
        defaultPricing={defaultPricing}
        elevenlabsModels={elevenlabsModels}
        maxVoices={maxVoices}
      />
    </>
  );
}
