import { describe, expect, it } from "vitest";
import { convertUasZones, maxKpInWindow, parseGpsJam, parseNotamCoord } from "@/lib/sources";

describe("parseNotamCoord", () => {
  it("tolkar grader och minuter", () => {
    const [lon, lat] = parseNotamCoord("5641N01617E")!;
    expect(lat).toBeCloseTo(56 + 41 / 60, 6);
    expect(lon).toBeCloseTo(16 + 17 / 60, 6);
  });
  it("tolkar sekunder och syd/väst", () => {
    const [lon, lat] = parseNotamCoord("564130S0161730W")!;
    expect(lat).toBeCloseTo(-(56 + 41 / 60 + 30 / 3600), 6);
    expect(lon).toBeCloseTo(-(16 + 17 / 60 + 30 / 3600), 6);
  });
  it("returnerar null för ogiltiga strängar", () => {
    expect(parseNotamCoord("")).toBeNull();
    expect(parseNotamCoord("5641N")).toBeNull();
    expect(parseNotamCoord(null)).toBeNull();
  });
});

describe("maxKpInWindow", () => {
  const rows = [
    { time_tag: "2026-11-01 00:00:00", kp: 2, observed: "observed" },
    { time_tag: "2026-11-01 03:00:00", kp: 3, observed: "estimated" },
    { time_tag: "2026-11-01 06:00:00", kp: 6, observed: "predicted" },
    { time_tag: "2026-11-01 09:00:00", kp: 4, observed: "predicted" },
  ];
  it("tar högsta Kp i hela fönstret, inte bara vid start", () => {
    const r = maxKpInWindow(rows, new Date("2026-11-01T04:00:00Z"), new Date("2026-11-01T07:00:00Z"));
    expect(r).toMatchObject({ kp: 6, kind: "predicted", at: "2026-11-01T06:00:00.000Z" });
  });
  it("fungerar för en tidpunkt", () => {
    expect(maxKpInWindow(rows, new Date("2026-11-01T01:00:00Z"), new Date("2026-11-01T01:00:00Z"))?.kp).toBe(2);
  });
  it("returnerar null utanför prognosen", () => {
    expect(maxKpInWindow(rows, new Date("2026-12-01T00:00:00Z"), new Date("2026-12-01T03:00:00Z"))).toBeNull();
  });
});

describe("parseGpsJam", () => {
  it("bygger en karta per cell och hoppar över rubrik och skräp", () => {
    const m = parseGpsJam("hex,count_good_aircraft,count_bad_aircraft\n841f05bffffffff,10,2\n\nbad,line\n");
    expect(m.get("841f05bffffffff")).toEqual([10, 2]);
    expect(m.size).toBe(1);
  });
});

describe("convertUasZones", () => {
  it("gör cirklar till polygoner och plockar svenska texter", () => {
    const fc = convertUasZones({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [18, 59], extent: { subType: "Circle", radius: 1000 }, layer: { upper: 120, upperReference: "AGL", lower: 0, lowerReference: "AGL", uom: "m" } } as never,
          properties: { identifier: "Z1", name: [{ text: "Zone", lang: "en" }, { text: "Zon", lang: "sv-SE" }], type: "REQ_AUTHORIZATION" },
        },
        { type: "Feature", geometry: null, properties: { identifier: "Z2" } },
      ],
    });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe("Polygon");
    expect(fc.features[0].properties).toMatchObject({ id: "Z1", name: "Zon", zoneType: "REQ_AUTHORIZATION", upper: "120 m AGL" });
  });
});
