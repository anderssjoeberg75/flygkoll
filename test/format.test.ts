import { describe, expect, it } from "vitest";
import { compass, parseLocalStockholm, toLocalInput } from "@/lib/format";

describe("parseLocalStockholm", () => {
  it("tolkar vintertid som UTC+1", () => {
    expect(parseLocalStockholm("2026-01-15T12:00").toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });
  it("tolkar sommartid som UTC+2", () => {
    expect(parseLocalStockholm("2026-07-01T12:00").toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });
  it("hanterar dygnet då sommartid börjar", () => {
    // 29 mars 2026: klockan går från 02:00 till 03:00
    expect(parseLocalStockholm("2026-03-29T01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(parseLocalStockholm("2026-03-29T04:00").toISOString()).toBe("2026-03-29T02:00:00.000Z");
  });
  it("hanterar dygnet då vintertid börjar", () => {
    // 25 oktober 2026: klockan går från 03:00 till 02:00
    expect(parseLocalStockholm("2026-10-25T01:00").toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(parseLocalStockholm("2026-10-25T04:00").toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
  it("är invers till toLocalInput", () => {
    for (const iso of ["2026-01-15T11:00:00.000Z", "2026-07-01T10:45:00.000Z", "2026-12-31T23:30:00.000Z"]) {
      expect(parseLocalStockholm(toLocalInput(new Date(iso))).toISOString()).toBe(iso);
    }
  });
  it("ger ogiltigt datum för skräp", () => {
    expect(isNaN(parseLocalStockholm("hej").getTime())).toBe(true);
  });
});

describe("compass", () => {
  it("översätter grader till väderstreck", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("O");
    expect(compass(225)).toBe("SV");
    expect(compass(359)).toBe("N");
    expect(compass(null)).toBe("");
  });
});
