import { describe, expect, it } from "vitest";
import { LruCache } from "@/lib/lru";
import { hit, isLimited, reset } from "@/lib/ratelimit";
import { clampRadius, oneOf, optNumber, thinTrack, isValidLatLon } from "@/lib/validate";
import { inSweden } from "@/lib/sweden";

describe("LruCache", () => {
  it("tar bort äldst använda när den är full", () => {
    const c = new LruCache<number>(2);
    c.set("a", 1, 0);
    c.set("b", 2, 0);
    c.get("a", 1000, 1); // a blir senast använd
    c.set("c", 3, 2);
    expect(c.get("b", 1000, 3)).toBeUndefined();
    expect(c.get("a", 1000, 3)).toBe(1);
    expect(c.size).toBe(2);
  });
  it("respekterar TTL", () => {
    const c = new LruCache<number>(5);
    c.set("a", 1, 0);
    expect(c.get("a", 100, 50)).toBe(1);
    expect(c.get("a", 100, 150)).toBeUndefined();
  });
});

describe("ratelimit", () => {
  it("spärrar efter max försök och släpper efter fönstret", () => {
    const k = "test:" + Math.random();
    for (let i = 0; i < 3; i++) expect(hit(k, 3, 1000, 0).allowed).toBe(true);
    expect(isLimited(k, 3, 10)).toBe(true);
    expect(hit(k, 3, 1000, 10).allowed).toBe(false);
    expect(isLimited(k, 3, 1001)).toBe(false);
    reset(k);
    expect(isLimited(k, 3, 20)).toBe(false);
  });
});

describe("validate", () => {
  it("begränsar radie", () => {
    expect(clampRadius(5)).toBe(100);
    expect(clampRadius(50_000)).toBe(10_000);
    expect(clampRadius(NaN)).toBe(500);
  });
  it("oneOf och optNumber", () => {
    expect(oneOf("pilot", ["admin", "pilot"] as const, "admin")).toBe("pilot");
    expect(oneOf("root", ["admin", "pilot"] as const, "admin")).toBe("admin");
    expect(optNumber("12,5")).toBe(12.5);
    expect(optNumber("")).toBeNull();
    expect(optNumber("5", 10)).toBeNull();
  });
  it("lat/lon", () => {
    expect(isValidLatLon(59, 18)).toBe(true);
    expect(isValidLatLon(91, 18)).toBe(false);
  });
  it("gallrar spår men behåller första, sista och högsta punkten", () => {
    const pts = Array.from({ length: 20_000 }, (_, i) => ({ t: i, alt: i === 12_345 ? 999 : i % 100 }));
    const out = thinTrack(pts, 1000);
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out[0].t).toBe(0);
    expect(out[out.length - 1].t).toBe(19_999);
    expect(out.some((p) => p.alt === 999)).toBe(true);
    expect(thinTrack(pts.slice(0, 10), 1000)).toHaveLength(10);
  });
});

describe("inSweden", () => {
  it.each([
    ["Stockholm", 59.33, 18.07, true],
    ["Kiruna", 67.86, 20.23, true],
    ["Visby", 57.64, 18.29, true],
    ["Malmö", 55.6, 13.0, true],
    ["Haparanda", 65.83, 24.1, true],
    ["Oslo", 59.91, 10.75, false],
    ["Köpenhamn", 55.68, 12.57, false],
    ["Mariehamn", 60.1, 19.94, false],
    ["Rønne", 55.1, 14.7, false],
    ["Narvik", 68.44, 17.43, false],
  ])("%s", (_, lat, lon, expected) => {
    expect(inSweden(lat as number, lon as number)).toBe(expected);
  });
});
