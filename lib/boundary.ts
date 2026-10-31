import * as turf from "@turf/turf";
import type { Feature, MultiPolygon } from "geojson";

export const SWEDEN_BOUNDS: Feature<MultiPolygon> = turf.multiPolygon([
  // Fastlandet
  [
    [
      [11.0, 58.8],
      [11.1, 59.8],
      [12.1, 60.2],
      [12.2, 61.4],
      [12.8, 62.1],
      [12.0, 63.2],
      [13.5, 64.2],
      [14.2, 65.0],
      [15.0, 66.0],
      [16.5, 67.0],
      [18.0, 68.5],
      [20.6, 69.1], // Treriksröset
      [22.5, 68.5],
      [24.2, 65.8], // Haparanda
      [21.5, 65.0],
      [19.0, 63.5],
      [18.0, 60.5],
      [19.0, 59.8],
      [18.5, 59.0],
      [17.0, 57.0],
      [16.0, 56.0],
      [14.5, 55.3],
      [13.3, 55.3], // Smygehuk
      [12.8, 55.4], // Falsterbonäset
      [12.8, 55.7], // Malmö
      [12.6, 56.2], // Helsingborg / Kullen
      [11.7, 57.6],
      [11.0, 58.8],
    ],
  ],
  // Gotland
  [
    [
      [17.8, 56.8],
      [19.6, 56.8],
      [19.6, 58.4],
      [17.8, 58.4],
      [17.8, 56.8],
    ],
  ],
  // Öland
  [
    [
      [16.2, 56.1],
      [17.2, 56.1],
      [17.2, 57.5],
      [16.2, 57.5],
      [16.2, 56.1],
    ],
  ],
]);

export function isInSweden(lat: number, lon: number): boolean {
  if (lat < 54.5 || lat > 69.5 || lon < 10.5 || lon > 24.5) return false;
  try {
    return turf.booleanPointInPolygon(turf.point([lon, lat]), SWEDEN_BOUNDS);
  } catch {
    return false;
  }
}
