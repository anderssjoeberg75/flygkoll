import type { Feature, FeatureCollection, Geometry } from "geojson";
import * as turf from "@turf/turf";
import { requireUser } from "@/lib/auth";
import { lfvLayer, uasZones } from "@/lib/sources";
import { GeoMap } from "@/components/GeoMap";

export const dynamic = "force-dynamic";

export default async function AirspaceMap() {
  await requireUser();
  const now = new Date();
  const iso = now.toISOString().replace(/\.\d+Z$/, ".000Z");
  const layers: [string, Promise<FeatureCollection>][] = [
    ["CTR", lfvLayer("mais:CTR")],
    ["TIZ", lfvLayer("mais:TIZ")],
    ["RSTA", lfvLayer("mais:RSTA")],
    ["DNGA", lfvLayer("mais:DNGA")],
    ["RWY5K", lfvLayer("DAIM_TOPO:RWY5K")],
    ["HKP1K", lfvLayer("DAIM_TOPO:HKP1K")],
    ["SUP", lfvLayer("DAIM_TOPO:SUP", `TO>='${iso}' AND FROM<='${iso}'`, 3600e3)],
    ["UAS", uasZones()],
  ];
  const results = await Promise.allSettled(layers.map((l) => l[1]));
  const features: Feature[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const key = layers[i][0];
    if (r.status === "rejected") return failed.push(key);
    for (const f of r.value.features) {
      if (!f.geometry) continue;
      const p = (f.properties || {}) as Record<string, unknown>;
      const lower = String(p.LOWER ?? p.lower ?? "");
      if ((key === "RSTA" || key === "DNGA") && lower && !/^(GND|SFC|0)$/i.test(lower) && parseFloat(lower) > 400) continue;
      features.push({
        type: "Feature",
        geometry: (() => { try { return turf.simplify(f, { tolerance: 0.0005 }).geometry as Geometry; } catch { return f.geometry; } })(),
        properties: { layer: key, name: String(p.NAMEOFAREA ?? p.NAME ?? p.name ?? p.LOCATION ?? p.DESIG ?? key), lower, upper: String(p.UPPER ?? p.upper ?? "") },
      });
    }
  });
  const data: FeatureCollection = { type: "FeatureCollection", features };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Luftrumskarta</h1>
          <p className="muted" style={{ margin: 0 }}>Aktuellt luftrum från LFV: kontrollzoner, R/D-områden, 5 km-zoner, helikopterplatser, aktiva SUP och UAS-zoner.</p>
        </div>
      </div>
      {failed.length > 0 && <div className="notice n-warn" style={{ marginBottom: 12 }}><strong>Vissa lager kunde inte hämtas</strong>{failed.join(", ")}</div>}
      <GeoMap data={data} className="map tall" hidden={["TIZ", "HKP1K"]} fitTo="data" />
    </>
  );
}
