"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { FeatureCollection, Feature } from "geojson";
import { loadLeaflet, baseLayers, LAYER_STYLE } from "./leaflet";

const SEV_TEXT: Record<string, string> = { permission: "Tillstånd krävs", caution: "Försiktighet", info: "Info" };

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function GeoMap({
  data,
  center,
  radius,
  track,
  className = "map",
  hidden = ["N2000", "TIZ"],
  fitTo,
}: {
  data?: FeatureCollection;
  center?: [number, number]; // lon, lat
  radius?: number;
  track?: [number, number][]; // lat, lon
  className?: string;
  hidden?: string[];
  fitTo?: "center" | "data" | "track";
}) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: Leaflet.Map | null = null;
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return;
      const bases = baseLayers(L);
      map = L.map(el.current, { layers: [bases["Karta (OSM)"]] }).setView(center ? [center[1], center[0]] : [62.5, 16.5], center ? 12 : 5);
      const overlays: Record<string, Leaflet.Layer> = {};
      if (data) {
        const byLayer = new Map<string, Feature[]>();
        for (const f of data.features) {
          const k = String(f.properties?.layer ?? "other");
          if (!byLayer.has(k)) byLayer.set(k, []);
          byLayer.get(k)!.push(f);
        }
        for (const [k, feats] of byLayer) {
          const st = LAYER_STYLE[k] ?? { color: "#64748b", label: k };
          const g = L.geoJSON({ type: "FeatureCollection", features: feats } as FeatureCollection, {
            style: () => ({ color: st.color, weight: 2, dashArray: st.dash, fillOpacity: st.fill ?? 0.1 }),
            onEachFeature: (f, layer) => {
              const p = f.properties || {};
              let extra = "";
              if (p.severity === "permission") {
                extra += `<br/><a href="https://www.lfv.se/dronare" target="_blank" rel="noopener noreferrer" style="color:#0f766e;font-weight:600;font-size:12px;display:inline-block;margin-top:4px;">Sök tillstånd (LFV) ↗</a>`;
              }
              if (k === "NR" || k === "NP") {
                extra += `<br/><a href="https://skyddadnatur.naturvardsverket.se/" target="_blank" rel="noopener noreferrer" style="color:#0f766e;font-weight:600;font-size:12px;display:inline-block;margin-top:4px;">Skyddad natur (Naturvårdsverket) ↗</a>`;
              }
              layer.bindPopup(
                `<strong>${esc(p.name)}</strong><br/>${esc(st.label)}${p.severity ? ` · ${esc(SEV_TEXT[p.severity] ?? p.severity)}` : ""}` +
                  (p.lower || p.upper ? `<br/>Höjd: ${esc(p.lower)} – ${esc(p.upper)}` : "") +
                  extra
              );
            },
          });
          const label = `<span style="display:inline-block;width:10px;height:10px;border:2px solid ${st.color};border-radius:2px;margin-right:4px"></span>${st.label} (${feats.length})`;
          overlays[label] = g;
          if (!hidden.includes(k)) g.addTo(map);
        }
      }
      if (center && radius) {
        const c = L.circle([center[1], center[0]], { radius, color: "#0f766e", weight: 3, fillOpacity: 0.08, dashArray: "6 6" }).addTo(map);
        c.bindTooltip("Operationsområde");
        if (fitTo !== "data") map.fitBounds(c.getBounds().pad(0.6));
        L.circleMarker([center[1], center[0]], { radius: 5, color: "#0f766e", fillOpacity: 1 }).addTo(map);
      }
      if (track && track.length > 1) {
        const line = L.polyline(track, { color: "#e11d48", weight: 3 }).addTo(map);
        L.circleMarker(track[0], { radius: 6, color: "#15803d", fillOpacity: 1 }).bindTooltip("Start").addTo(map);
        L.circleMarker(track[track.length - 1], { radius: 6, color: "#b91c1c", fillOpacity: 1 }).bindTooltip("Slut").addTo(map);
        map.fitBounds(line.getBounds().pad(0.2));
      }
      L.control.layers(bases, overlays, { collapsed: true }).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, center, radius, track, fitTo]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className} />;
}
