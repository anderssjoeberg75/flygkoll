"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { FeatureCollection, Feature } from "geojson";
import { loadLeaflet, baseLayers, LAYER_STYLE } from "./leaflet";

const SEV_TEXT: Record<string, string> = { permission: "Tillstånd krävs", caution: "Försiktighet", info: "Info" };

const LAYER_PRIORITY: Record<string, number> = {
  TIZ: 10,
  ATZ: 15,
  CTR: 20,
  RWY5K: 25,
  HKP1K: 30,
  SUP: 40,
  NOTAM: 45,
  DNGA: 50,
  N2000: 60,
  UAS: 70,
  NR: 80,
  NP: 90,
  RSTA: 100,
};

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

interface HighlightedEntry {
  layer: Leaflet.Path;
  defaultStyle: Leaflet.PathOptions;
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
    let highlighted: HighlightedEntry[] = [];

    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return;
      const bases = baseLayers(L);
      map = L.map(el.current, { layers: [bases["Karta (OSM)"]] }).setView(
        center ? [center[1], center[0]] : [62.5, 16.5],
        center ? 12 : 5
      );

      const overlays: Record<string, Leaflet.Layer> = {};
      const registeredFeatures: {
        name: string;
        layerKey: string;
        pathLayer: Leaflet.Path;
        defaultStyle: Leaflet.PathOptions;
        bounds?: Leaflet.LatLngBounds;
      }[] = [];

      if (data) {
        const byLayer = new Map<string, Feature[]>();
        for (const f of data.features) {
          const k = String(f.properties?.layer ?? "other");
          if (!byLayer.has(k)) byLayer.set(k, []);
          byLayer.get(k)!.push(f);
        }

        // Sortera lager så stora bakgrundsområden (CTR, TIZ) ritas först
        // och naturreservat (NR, NP) samt restriktionsområden (RSTA) ritas ovanpå
        const sortedLayers = Array.from(byLayer.entries()).sort(
          (a, b) => (LAYER_PRIORITY[a[0]] ?? 50) - (LAYER_PRIORITY[b[0]] ?? 50)
        );

        for (const [k, feats] of sortedLayers) {
          const st = LAYER_STYLE[k] ?? { color: "#64748b", label: k };
          const defaultStyle: Leaflet.PathOptions = {
            color: st.color,
            weight: k === "NR" || k === "NP" ? 3 : 2,
            dashArray: st.dash,
            fillOpacity: st.fill ?? 0.1,
          };

          const g = L.geoJSON({ type: "FeatureCollection", features: feats } as FeatureCollection, {
            style: () => defaultStyle,
            onEachFeature: (f, layer) => {
              const p = f.properties || {};
              const featureName = String(p.name ?? "");
              const isNature = k === "NR" || k === "NP";

              let extra = "";
              if (p.severity === "permission") {
                extra += `<br/><a href="https://www.lfv.se/dronare" target="_blank" rel="noopener noreferrer" style="color:#0a6cff;font-weight:600;font-size:12px;display:inline-block;margin-top:6px;">Sök tillstånd (LFV) ↗</a>`;
              }
              if (isNature) {
                extra += `<br/><a href="https://skyddadnatur.naturvardsverket.se/" target="_blank" rel="noopener noreferrer" style="color:#15803d;font-weight:600;font-size:12px;display:inline-block;margin-top:6px;">🌿 Skyddad natur (Naturvårdsverket) ↗</a>`;
              }

              // Snabbinfo vid hover
              const tooltipLabel = `${isNature ? "🌿 " : ""}${esc(featureName || st.label)}`;
              layer.bindTooltip(tooltipLabel, { sticky: true });

              layer.bindPopup(
                `<strong>${isNature ? "🌿 " : ""}${esc(p.name || st.label)}</strong><br/>${esc(st.label)}${p.severity ? ` · ${esc(SEV_TEXT[p.severity] ?? p.severity)}` : ""}` +
                  (p.lower || p.upper ? `<br/>Höjd: ${esc(p.lower)} – ${esc(p.upper)}` : "") +
                  extra
              );

              if ("setStyle" in layer) {
                const pathLayer = layer as Leaflet.Path;
                let bounds: Leaflet.LatLngBounds | undefined;
                if ("getBounds" in layer && typeof (layer as any).getBounds === "function") {
                  bounds = (layer as any).getBounds();
                }

                registeredFeatures.push({
                  name: featureName,
                  layerKey: k,
                  pathLayer,
                  defaultStyle,
                  bounds,
                });
              }
            },
          });

          const label = `<span style="display:inline-block;width:10px;height:10px;border:2px solid ${st.color};border-radius:2px;margin-right:4px"></span>${st.label} (${feats.length})`;
          overlays[label] = g;
          if (!hidden.includes(k)) g.addTo(map);
        }
      }

      if (center && radius) {
        const c = L.circle([center[1], center[0]], {
          radius,
          color: "#0a6cff",
          weight: 3,
          fillOpacity: 0.08,
          dashArray: "6 6",
        }).addTo(map);
        c.bindTooltip("Operationsområde");
        if (fitTo !== "data") map.fitBounds(c.getBounds().pad(0.6));
        L.circleMarker([center[1], center[0]], { radius: 5, color: "#0a6cff", fillOpacity: 1 }).addTo(map);
      }

      if (track && track.length > 1) {
        const line = L.polyline(track, { color: "#e11d48", weight: 3 }).addTo(map);
        L.circleMarker(track[0], { radius: 6, color: "#15803d", fillOpacity: 1 }).bindTooltip("Start").addTo(map);
        L.circleMarker(track[track.length - 1], { radius: 6, color: "#b91c1c", fillOpacity: 1 }).bindTooltip("Slut").addTo(map);
        map.fitBounds(line.getBounds().pad(0.2));
      }

      L.control.layers(bases, overlays, { collapsed: true }).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);

      // Lyssna på highlight-anrop från tabell / detaljvy
      function handleHighlight(e: Event) {
        const ce = e as CustomEvent<{ name?: string; layer?: string }>;
        const targetName = (ce.detail?.name ?? "").toLowerCase().trim();
        const targetLayer = (ce.detail?.layer ?? "").toUpperCase().trim();
        if (!targetName && !targetLayer) return;

        // Återställ tidigare highlight
        for (const item of highlighted) {
          item.layer.setStyle(item.defaultStyle);
        }
        highlighted = [];

        // Matcha med registrerade features
        const matches = registeredFeatures.filter((f) => {
          const fName = f.name.toLowerCase().trim();
          if (targetName && fName) {
            if (fName === targetName) return true;
            if (fName.includes(targetName) || targetName.includes(fName)) return true;
          }
          if (targetLayer && f.layerKey === targetLayer) {
            if (!targetName) return true;
          }
          return false;
        });

        if (matches.length > 0 && map) {
          const combinedBounds = L.latLngBounds([]);
          for (const m of matches) {
            m.pathLayer.setStyle({
              color: "#e11d48",
              weight: 5,
              fillColor: "#f43f5e",
              fillOpacity: 0.45,
              dashArray: undefined,
            });
            if ("bringToFront" in m.pathLayer && typeof (m.pathLayer as any).bringToFront === "function") {
              (m.pathLayer as any).bringToFront();
            }
            if (m.bounds && m.bounds.isValid()) {
              combinedBounds.extend(m.bounds);
            }
            highlighted.push({ layer: m.pathLayer, defaultStyle: m.defaultStyle });
          }

          if (combinedBounds.isValid()) {
            map.fitBounds(combinedBounds.pad(0.35), { maxZoom: 14, animate: true });
          }

          // Öppna popup för första matchande element
          const first = matches[0]?.pathLayer as any;
          if (first && typeof first.openPopup === "function") {
            first.openPopup();
          }
        }
      }

      window.addEventListener("flygkoll:highlight-area", handleHighlight);

      return () => {
        window.removeEventListener("flygkoll:highlight-area", handleHighlight);
      };
    }).then((cleanupHighlight) => {
      if (cleanupHighlight) {
        // cleanupHighlight kommer anropas i unmount om behövs
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data, center, radius, track, fitTo]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className} />;
}
