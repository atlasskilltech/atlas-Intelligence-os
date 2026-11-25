import VoiceAgent from "@/components/voice/VoiceAgent";

export const metadata = { title: "Voice Assistant" };

/** Full-screen voice mode (covers the app shell, like ChatGPT's voice mode). */
export default function VoicePage() {
  return <VoiceAgent />;
}
