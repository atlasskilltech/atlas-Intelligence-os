import VoiceAgentV3 from "@/components/voice/VoiceAgentV3";

export const metadata = { title: "Voice Assistant (3D Hero)" };

/** Full-screen voice mode with a full-body cartoon 3D hero (v3). /voice and /voicev2 are untouched. */
export default function VoiceV3Page() {
  return <VoiceAgentV3 />;
}
