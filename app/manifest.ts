import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flygkoll – drönarbriefing",
    short_name: "Flygkoll",
    description: "Egen flygbriefing för drönarpiloter: luftrum, NOTAM, väder och skyddade områden.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f766e",
    lang: "sv",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
