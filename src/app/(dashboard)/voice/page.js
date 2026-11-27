import VoiceAgent from "@/components/voice/VoiceAgent";
import { SUPER_AGENT } from "@/lib/portals/portalAgents";

export const metadata = { title: `${SUPER_AGENT.name} Voice` };

/** Full-screen voice mode (covers the app shell, like ChatGPT's voice mode). */
export default function VoicePage() {
  return <VoiceAgent />;
}
