import * as turf from "@turf/turf";
import type { Feature, MultiPolygon } from "geojson";

/**
 * Förenklad polygon runt Sverige inklusive territorialvatten, Öland och Gotland, med lite marginal mot
 * grannländerna. Utesluter Oslo, Köpenhamn, Bornholm, Åland och Finland men täcker hela Norrlandskusten
 * och skärgårdarna. [lon, lat] medurs från Falsterbo.
 */
export const SWEDEN_BOUNDS: Feature<MultiPolygon> = turf.multiPolygon([
  [
    [
      [12.7, 55.3], [12.85, 55.55], [12.82, 55.75], [12.68, 56.0], [12.2, 56.4], [11.5, 57.2], [11.0, 58.0], [10.9, 58.9],
      [11.4, 59.0], [11.75, 59.6], [12.2, 60.3], [12.7, 61.0], [12.1, 62.3], [11.9, 63.3], [13.8, 64.6], [14.2, 65.2],
      [15.0, 66.2], [16.2, 67.5], [18.0, 68.5], [20.6, 69.1], // Treriksröset
      [22.6, 68.45], [23.7, 68.0], [23.85, 67.4], [24.0, 66.8], [24.25, 65.8], // Torneälven, Haparanda
      [22.9, 65.3], [21.6, 64.3], [20.6, 63.4], [18.8, 62.3], [18.6, 61.0], [19.0, 60.3], // Bottenviken, Kvarken, Bottenhavet
      [19.5, 59.6], [19.6, 58.5], [19.6, 56.9], // väster om Åland, öster om Gotland
      [17.3, 56.3], [16.0, 55.9], [14.5, 55.35], // norr om Bornholm
      [12.7, 55.3],
    ],
  ],
]);

export function isInSweden(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  try {
    return turf.booleanPointInPolygon(turf.point([lon, lat]), SWEDEN_BOUNDS);
  } catch {
    return false;
  }
}
