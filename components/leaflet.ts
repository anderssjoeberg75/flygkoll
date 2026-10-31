"use client";

import type * as Leaflet from "leaflet";

let p: Promise<typeof Leaflet> | null = null;
export function loadLeaflet(): Promise<typeof Leaflet> {
  if (!p) p = import("leaflet").then((m) => (m.default ?? m) as typeof Leaflet);
  return p;
}

export function baseLayers(L: typeof Leaflet) {
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  });
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "© OpenTopoMap (CC-BY-SA)",
  });
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Esri World Imagery",
  });
  return { "Karta (OSM)": osm, Topografi: topo, Flygfoto: sat };
}

export const LAYER_STYLE: Record<string, { color: string; label: string; dash?: string; fill?: number }> = {
  RSTA: { color: "#dc2626", label: "R-område" },
  DNGA: { color: "#ea580c", label: "D-område", dash: "6 4" },
  CTR: { color: "#2563eb", label: "CTR", fill: 0.05 },
  TIZ: { color: "#0891b2", label: "TIZ", dash: "4 4", fill: 0.04 },
  ATZ: { color: "#0e7490", label: "ATZ", dash: "2 4", fill: 0.04 },
  RWY5K: { color: "#7c3aed", label: "5 km-zon bana", fill: 0.08 },
  HKP1K: { color: "#db2777", label: "Helikopterplats 1 km" },
  SUP: { color: "#b91c1c", label: "AIP SUP", dash: "8 4" },
  NOTAM: { color: "#f59e0b", label: "NOTAM-område", dash: "3 3" },
  UAS: { color: "#9333ea", label: "UAS-zon", fill: 0.12 },
  NP: { color: "#15803d", label: "Nationalpark", fill: 0.15 },
  NR: { color: "#65a30d", label: "Naturreservat/NVO", fill: 0.1 },
  N2000: { color: "#0d9488", label: "Natura 2000", dash: "2 3", fill: 0.05 },
};
