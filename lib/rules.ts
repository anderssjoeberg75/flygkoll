export type DroneLike = { name: string; model: string; mtom_g: number; class_mark: string; char_dim_m?: number };

export const CLASS_OPTIONS = [
  { v: "none", label: "Ingen klassmärkning" },
  { v: "C0", label: "C0 (< 250 g)" },
  { v: "C1", label: "C1 (< 900 g)" },
  { v: "C2", label: "C2 (< 4 kg)" },
  { v: "C3", label: "C3 (< 25 kg)" },
  { v: "C4", label: "C4 (< 25 kg, utan automation)" },
  { v: "C5", label: "C5 (STS-01)" },
  { v: "C6", label: "C6 (STS-02)" },
];

/** Öppen kategori enligt (EU) 2019/947 – förenklad vägledning. */
export function droneRules(d: DroneLike | null) {
  if (!d) {
    return {
      subcategory: "Okänd",
      license: "Välj drönare för regler",
      rules: ["Max 120 m över marken", "Ingen flygning över folksamlingar", "Flyg alltid inom synhåll (VLOS)"],
    };
  }
  const c = d.class_mark;
  const g = d.mtom_g;
  const base = ["Max 120 m över marken", "Ingen flygning över folksamlingar", "Flyg alltid inom synhåll (VLOS)"];
  if (c === "C0" || (c === "none" && g > 0 && g < 250)) {
    return {
      subcategory: "A1",
      license: "Registrering krävs om drönaren har kamera (operatörs-ID)",
      rules: [...base, "Undvik att flyga över oinblandade personer", "Ingen flygning över folksamlingar"],
    };
  }
  if (c === "C1") {
    return {
      subcategory: "A1",
      license: "Drönarkort A1/A3",
      rules: [...base, "Får inte avsiktligt flyga över oinblandade personer", "Om det sker oavsiktligt: minimera tiden över dem"],
    };
  }
  if (c === "C2") {
    return {
      subcategory: "A2 (eller A3)",
      license: "Drönarkort A2 för A2-flygning",
      rules: [...base, "Minst 30 m horisontellt från oinblandade personer", "Minst 5 m med aktiverat lågfartsläge", "1:1-regeln rekommenderas (avstånd ≥ höjd)"],
    };
  }
  if (c === "C5" || c === "C6") {
    return { subcategory: "Specifik kategori (STS)", license: "STS-kompetensbevis + deklaration", rules: ["Följ deklarerat STS-scenario och driftmanual"] };
  }
  return {
    subcategory: "A3",
    license: "Drönarkort A1/A3",
    rules: [
      ...base,
      "Minst 150 m horisontellt från bostads-, industri-, handels- och rekreationsområden",
      "Inga oinblandade personer inom området där drönaren flyger",
      c === "none" ? "Oklassad drönare över 250 g – endast A3" : `Klass ${c}`,
    ],
  };
}

/** VLOS enligt EASA AMC1 Article 11 (SORA): ALOS för multirotor = 327·CD + 20 m, fastvinge = 490·CD + 30 m. */
export function vlosDistances(charDimM: number, kind: "multirotor" | "fixedwing", visibilityKm?: number) {
  const alos = kind === "multirotor" ? 327 * charDimM + 20 : 490 * charDimM + 30;
  const dlos = visibilityKm ? Math.min(visibilityKm * 1000 * 0.3, 0.3 * 1000 * visibilityKm) : null;
  return { alos: Math.round(alos), dlos: dlos ? Math.round(dlos) : null };
}

/* ---------- Drönarkort / kompetensbevis ---------- */

export type LicenseState = { level: "none" | "expired" | "soon" | "ok"; daysLeft: number | null };

/** Status för ett drönarkort med utgångsdatum (YYYY-MM-DD). "soon" = inom warnDays dagar. */
export function licenseState(expiry: string | null | undefined, now = new Date(), warnDays = 60): LicenseState {
  if (!expiry) return { level: "none", daysLeft: null };
  const end = new Date(`${expiry}T23:59:59`);
  if (isNaN(end.getTime())) return { level: "none", daysLeft: null };
  const daysLeft = Math.floor((end.getTime() - now.getTime()) / 864e5);
  return { level: daysLeft < 0 ? "expired" : daysLeft <= warnDays ? "soon" : "ok", daysLeft };
}

/** Vilket kompetensbevis drönaren kräver i öppen kategori/STS (förenklat). null = inget krav. */
export function requiredLicense(d: DroneLike | null): string | null {
  if (!d) return null;
  const c = d.class_mark;
  if (c === "C0" || (c === "none" && d.mtom_g > 0 && d.mtom_g < 250)) return null;
  if (c === "C5") return "STS-01";
  if (c === "C6") return "STS-02";
  return "A1/A3";
}

/** Varning om piloten saknar giltigt kompetensbevis för drönaren vid flygtillfället. */
export function licenseNotice(
  d: DroneLike | null,
  pilot: { license_classes: string; license_expiry: string | null },
  at: Date
): { level: "warn" | "danger"; title: string; text: string } | null {
  const need = requiredLicense(d);
  if (!need) return null;
  let classes: string[] = [];
  try {
    classes = JSON.parse(pilot.license_classes || "[]");
  } catch {
    /* ogiltig data */
  }
  const st = licenseState(pilot.license_expiry, at);
  if (!classes.includes(need)) {
    return { level: "warn", title: "Kompetensbevis saknas", text: `${d!.name} kräver ${need}, men det finns inte angivet i din profil. Uppdatera under Inställningar om du har det.` };
  }
  if (st.level === "expired") {
    return { level: "danger", title: "Drönarkortet har gått ut", text: `Ditt drönarkort gick ut ${pilot.license_expiry} – före flygtillfället. Förnya det innan du flyger.` };
  }
  return null;
}
