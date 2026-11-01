import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const failing = new Set<string>();
let smhiRows: { time: string; data: Record<string, number> }[] = [];

vi.mock("@/lib/sources", async (orig) => {
  const actual = await orig<typeof import("@/lib/sources")>();
  return {
    ...actual,
    lfvLayer: vi.fn(async (t: string) => {
      if (failing.has(t)) throw new Error("Timeout från daim.lfv.se");
      return empty;
    }),
    uasZones: vi.fn(async () => empty),
    smhiForecast: vi.fn(async () => smhiRows),
    smhiWarnings: vi.fn(async () => []),
    windProfile: vi.fn(async () => []),
    protectedAreas: vi.fn(async () => []),
    natura2000: vi.fn(async () => []),
    kpForecast: vi.fn(async () => null),
    gpsInterference: vi.fn(async () => null),
    reverseGeocode: vi.fn(async () => "Testby"),
  };
});

const { buildBriefing, computeStatus, windowWeather } = await import("@/lib/briefing");

const hour = (iso: string, data: Record<string, number>) => ({
  time: iso,
  data: { air_temperature: 10, wind_speed: 3, wind_speed_of_gust: 5, visibility_in_air: 20, thunderstorm_probability: 0, ...data },
});

const opts = (from: string, durationH = 3) => ({
  lat: 59.33, lon: 18.07, radius_m: 500, flightTime: new Date(from), durationH, drone: null, windYellow: 8, windRed: 12,
});

beforeEach(() => {
  failing.clear();
  smhiRows = [];
});

describe("computeStatus", () => {
  const lfv = (ok: boolean) => ({ key: "ctr", label: "CTR", group: "LFV" as const, ok });
  it("visar aldrig OK när en LFV-källa saknas", () => {
    expect(computeStatus([], [lfv(false)])).toBe("INCOMPLETE");
    expect(computeStatus([{ severity: "caution" }], [lfv(false)])).toBe("INCOMPLETE");
  });
  it("tillstånd krävs går före ofullständig", () => {
    expect(computeStatus([{ severity: "permission" }], [lfv(false)])).toBe("PERMISSION");
  });
  it("normala fall", () => {
    expect(computeStatus([], [lfv(true)])).toBe("OK");
    expect(computeStatus([{ severity: "info" }], [lfv(true)])).toBe("OK");
    expect(computeStatus([{ severity: "caution" }], [lfv(true)])).toBe("CAUTION");
  });
  it("fel i övriga källor påverkar inte luftrumsstatus", () => {
    expect(computeStatus([], [{ key: "kp", label: "Kp", group: "Övrigt", ok: false }])).toBe("OK");
  });
});

describe("windowWeather", () => {
  it("hittar värsta värdet i fönstret", () => {
    const rows = [
      { time: "2026-11-01T09:00:00Z", temp: 5, wind: 3, gust: 5, dir: 0, cloudBase: null, cloud: null, vis: 20, precip: 0, thunder: 0, pressure: null, symbol: null },
      { time: "2026-11-01T11:00:00Z", temp: -2, wind: 6, gust: 11, dir: 0, cloudBase: null, cloud: null, vis: 2, precip: 0, thunder: 40, pressure: null, symbol: null },
      { time: "2026-11-01T20:00:00Z", temp: -9, wind: 15, gust: 20, dir: 0, cloudBase: null, cloud: null, vis: 1, precip: 0, thunder: 90, pressure: null, symbol: null },
    ];
    const w = windowWeather(rows, new Date("2026-11-01T09:00:00Z"), new Date("2026-11-01T12:00:00Z"));
    expect(w.rows).toHaveLength(2);
    expect(w.maxThunder).toEqual({ v: 40, time: "2026-11-01T11:00:00Z" });
    expect(w.minVis?.v).toBe(2);
    expect(w.minTemp?.v).toBe(-2);
    expect(w.maxGust?.v).toBe(11);
  });
});

describe("buildBriefing", () => {
  it("ger status INCOMPLETE och en tydlig varning när LFV inte svarar", async () => {
    failing.add("mais:CTR");
    failing.add("dynais:NOTAM");
    const r = await buildBriefing(opts("2026-11-01T09:00:00Z"));
    expect(r.status).toBe("INCOMPLETE");
    const n = r.notices.find((x) => x.title === "Luftrumsdata ofullständig");
    expect(n?.level).toBe("danger");
    expect(n?.text).toContain("Kontrollzoner (CTR)");
    expect(n?.text).toContain("NOTAM");
  });

  it("ger OK när alla källor svarar och inget berörs", async () => {
    const r = await buildBriefing(opts("2026-11-01T09:00:00Z"));
    expect(r.status).toBe("OK");
    expect(r.notices.some((x) => x.title === "Luftrumsdata ofullständig")).toBe(false);
  });

  it("varnar för åska senare i flygfönstret, inte bara vid start", async () => {
    smhiRows = [
      hour("2026-11-01T09:00:00Z", {}),
      hour("2026-11-01T10:00:00Z", {}),
      hour("2026-11-01T11:00:00Z", { thunderstorm_probability: 60, visibility_in_air: 1.5, air_temperature: -3, wind_speed_of_gust: 14 }),
      hour("2026-11-01T18:00:00Z", { thunderstorm_probability: 99 }),
    ];
    const r = await buildBriefing(opts("2026-11-01T09:00:00Z"));
    const titles = r.notices.map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(["Åskrisk", "Nedsatt sikt", "Kyla", "Hård vind"]));
    expect(r.notices.find((n) => n.title === "Åskrisk")?.text).toContain("60 %");
  });

  it("varnar inte för åska som ligger efter flygfönstret", async () => {
    smhiRows = [hour("2026-11-01T09:00:00Z", {}), hour("2026-11-01T18:00:00Z", { thunderstorm_probability: 99 })];
    const r = await buildBriefing(opts("2026-11-01T09:00:00Z", 2));
    expect(r.notices.some((n) => n.title === "Åskrisk")).toBe(false);
  });
});
