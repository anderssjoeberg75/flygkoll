import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { getUser } from "@/lib/auth";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Flygkoll – drönarbriefing",
  description: "Egen flygbriefing för drönarpiloter: luftrum, NOTAM, väder och skyddade områden.",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Flygkoll", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0f766e" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const theme = user?.theme && user.theme !== "system" ? user.theme : undefined;
  return (
    <html lang="sv" data-theme={theme}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
