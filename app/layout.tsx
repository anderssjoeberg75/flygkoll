import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Flygkoll – drönarbriefing",
  description: "Egen flygbriefing för drönarpiloter: luftrum, NOTAM, väder och skyddade områden.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const theme = user?.theme && user.theme !== "system" ? user.theme : undefined;
  return (
    <html lang="sv" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
