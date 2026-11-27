import VoiceAgentV2 from "@/components/voice/VoiceAgentV2";
import { SUPER_AGENT } from "@/lib/portals/portalAgents";

export const metadata = { title: `${SUPER_AGENT.name} Voice (3D)` };

/** Full-screen voice mode with a talking 3D avatar (v2). The original /voice page is untouched. */
export default function VoiceV2Page() {
  return <VoiceAgentV2 />;
}
