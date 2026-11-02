import type { Metadata, Viewport } from "next";
// typsnitten paketeras och serveras från appen själv – inga anrop till Google (#28)
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter-tight/500.css";
import "@fontsource/inter-tight/600.css";
import "@fontsource/inter-tight/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Flygkoll – drönarbriefing",
  description: "Egen flygbriefing för drönarpiloter: luftrum, NOTAM, väder och skyddade områden.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Flygkoll",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const theme = user?.theme && user.theme !== "system" ? user.theme : undefined;
  return (
    <html lang="sv" data-theme={theme}>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  );
}
