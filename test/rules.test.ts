import { describe, expect, it } from "vitest";
import { droneRules, licenseNotice, licenseState, requiredLicense } from "@/lib/rules";

const drone = (class_mark: string, mtom_g = 900) => ({ name: "D", model: "", class_mark, mtom_g });

describe("droneRules", () => {
  it("klassar drönare enligt klassmärkning", () => {
    expect(droneRules(drone("C0", 249)).subcategory).toBe("A1");
    expect(droneRules(drone("C2")).subcategory).toBe("A2 (eller A3)");
    expect(droneRules(drone("none", 2000)).subcategory).toBe("A3");
    expect(droneRules(drone("none", 200)).subcategory).toBe("A1");
    expect(droneRules(null).subcategory).toBe("Okänd");
  });
});

describe("licenseState", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("skiljer på giltigt, snart och utgånget", () => {
    expect(licenseState("2027-06-01", now).level).toBe("ok");
    expect(licenseState("2026-12-01", now)).toMatchObject({ level: "soon", daysLeft: 30 });
    expect(licenseState("2026-10-31", now).level).toBe("expired");
    expect(licenseState(null, now).level).toBe("none");
    expect(licenseState("skräp", now).level).toBe("none");
  });
  it("är giltigt hela sista dagen", () => {
    expect(licenseState("2026-11-01", now).level).toBe("soon");
  });
});

describe("requiredLicense / licenseNotice", () => {
  const at = new Date("2026-11-01T12:00:00Z");
  it("kräver inget kort för C0 och lätta oklassade", () => {
    expect(requiredLicense(drone("C0", 249))).toBeNull();
    expect(requiredLicense(drone("none", 200))).toBeNull();
    expect(licenseNotice(drone("C0", 249), { license_classes: "[]", license_expiry: null }, at)).toBeNull();
  });
  it("kräver rätt kompetens för övriga", () => {
    expect(requiredLicense(drone("C1"))).toBe("A1/A3");
    expect(requiredLicense(drone("C5"))).toBe("STS-01");
    expect(requiredLicense(drone("C6"))).toBe("STS-02");
  });
  it("varnar när kompetensen saknas eller har gått ut", () => {
    expect(licenseNotice(drone("C2"), { license_classes: "[]", license_expiry: "2030-01-01" }, at)?.title).toBe("Kompetensbevis saknas");
    expect(licenseNotice(drone("C2"), { license_classes: '["A1/A3"]', license_expiry: "2026-01-01" }, at)?.level).toBe("danger");
    expect(licenseNotice(drone("C2"), { license_classes: '["A1/A3","A2"]', license_expiry: "2030-01-01" }, at)).toBeNull();
  });
});
