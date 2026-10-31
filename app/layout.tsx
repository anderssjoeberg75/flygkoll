import type { Metadata } from "next";
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
