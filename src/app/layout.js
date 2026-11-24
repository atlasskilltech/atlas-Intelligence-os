import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Same typefaces as the ATLAS CRM: Inter for UI, JetBrains Mono for code.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata = {
  title: {
    default: "ATLAS IntelligenceOS",
    template: "%s · ATLAS IntelligenceOS",
  },
  description: "Internal AI Agent Builder for ATLAS SkillTech University employees.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-navy-800">{children}</body>
    </html>
  );
}
