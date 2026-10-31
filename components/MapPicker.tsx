"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { loadLeaflet, baseLayers } from "./leaflet";

type Zone = { id: string; name: string; lat: number; lon: number; radius_m: number };

export function MapPicker({
  initial,
  zones,
}: {
  initial?: { lat: number; lon: number; radius: number } | null;
  zones: Zone[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const marker = useRef<Leaflet.Circle | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(initial ? { lat: initial.lat, lon: initial.lon } : null);
  const [radius, setRadius] = useState(initial?.radius ?? 500);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((Lf) => {
      if (cancelled || !el.current || map.current) return;
      L.current = Lf;
      const layers = baseLayers(Lf);
      const m = Lf.map(el.current, { layers: [layers["Karta (OSM)"]] }).setView(initial ? [initial.lat, initial.lon] : [62.5, 16.5], initial ? 13 : 5);
      Lf.control.layers(layers).addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => setPos({ lat: e.latlng.lat, lon: e.latlng.lng }));
      map.current = m;
      setReady(true);
      if (!initial && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((p) => m.setView([p.coords.latitude, p.coords.longitude], 12), () => {}, { timeout: 5000 });
      }
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current, Lf = L.current;
    if (!m || !Lf || !pos) return;
    if (!marker.current) marker.current = Lf.circle([pos.lat, pos.lon], { radius, color: "#0f766e", weight: 2, fillOpacity: 0.12 }).addTo(m);
    marker.current.setLatLng([pos.lat, pos.lon]);
    marker.current.setRadius(radius);
  }, [pos, radius, ready]);

  async function search(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    setResults(r.ok ? await r.json() : []);
  }

  function go(lat: number, lon: number, r?: number) {
    setPos({ lat, lon });
    if (r) setRadius(r);
    map.current?.setView([lat, lon], 13);
    setResults([]);
  }

  return (
    <div className="stack">
      <div className="row">
        <input
          placeholder="Sök plats i Sverige…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(e)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="button" className="btn secondary" onClick={search}>Sök</button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => navigator.geolocation?.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude))}
        >
          Min position
        </button>
      </div>
      {results.length > 0 && (
        <div className="card" style={{ padding: 6 }}>
          {results.map((r) => (
            <button key={r.lat + r.lon} type="button" className="btn secondary small" style={{ display: "block", width: "100%", textAlign: "left", border: "none", marginBottom: 2 }} onClick={() => go(+r.lat, +r.lon)}>
              {r.display_name}
            </button>
          ))}
        </div>
      )}
      {zones.length > 0 && (
        <div className="row small">
          <span className="muted">Standardzoner:</span>
          {zones.map((z) => (
            <button key={z.id} type="button" className="btn secondary small" onClick={() => go(z.lat, z.lon, z.radius_m)}>{z.name}</button>
          ))}
        </div>
      )}
      <div ref={el} className="map" />
      <div className="grid g2">
        <div>
          <label>Operationsradie: {radius} m</label>
          <input type="range" min={100} max={10000} step={100} value={radius} onChange={(e) => setRadius(+e.target.value)} />
        </div>
        <div>
          <label>Exakt radie (m)</label>
          <input type="number" min={50} max={20000} value={radius} onChange={(e) => setRadius(Math.max(50, +e.target.value))} />
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {pos ? `Vald punkt: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}` : "Klicka på kartan för att välja operationsområde."}
      </p>
      <input type="hidden" name="lat" value={pos?.lat ?? ""} />
      <input type="hidden" name="lon" value={pos?.lon ?? ""} />
      <input type="hidden" name="radius" value={radius} />
    </div>
  );
}
