import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// Same typefaces as the ATLAS CRM: Inter for UI, JetBrains Mono for code.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata = {
  title: {
    default: "ATLAS IntelligenceOS",
    template: "%s · ATLAS IntelligenceOS",
  },
  description: "Internal AI Agent Builder for ATLAS SkillTech University employees.",
  // src/app/icon.svg is the favicon (Next serves it automatically).
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the boot script adds the "dark" class before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-slate-50 font-sans text-ink">{children}</body>
    </html>
  );
}
