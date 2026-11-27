import VoiceAgentV3 from "@/components/voice/VoiceAgentV3";
import { SUPER_AGENT } from "@/lib/portals/portalAgents";

export const metadata = { title: `${SUPER_AGENT.name} Voice (3D Hero)` };

/** Full-screen voice mode with a full-body cartoon 3D hero (v3). /voice and /voicev2 are untouched. */
export default function VoiceV3Page() {
  return <VoiceAgentV3 />;
}
