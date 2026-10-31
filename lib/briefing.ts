import "server-only";
import * as turf from "@turf/turf";
import * as SunCalc from "suncalc";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import {
  lfvLayer,
  uasZones,
  smhiForecast,
  smhiWarnings,
  windProfile,
  protectedAreas,
  natura2000,
  kpForecast,
  gpsInterference,
  reverseGeocode,
  parseNotamCoord,
  within,
  type SmhiPoint,
} from "./sources";
import { droneRules, type DroneLike } from "./rules";

export type Severity = "permission" | "caution" | "info";
export type AreaHit = {
  layer: string;
  layerLabel: string;
  name: string;
  severity: Severity;
  lower?: string;
  upper?: string;
  validity?: string;
  rule: string;
  props: Record<string, unknown>;
};
export type SourceStatus = { key: string; label: string; group: "LFV" | "Övrigt"; ok: boolean; error?: string; count?: number };

export type BriefingResult = {
  version: 1;
  place: string;
  center: [number, number]; // lon, lat
  radius_m: number;
  from: string;
  to: string;
  generatedAt: string;
  status: "OK" | "CAUTION" | "PERMISSION";
  maxHeight: { m: number; reason: string };
  hits: AreaHit[];
  notams: { id: string; text: string; from: string; to: string; location: string; distanceKm: number | null; isArea: boolean }[];
  weather: {
    atStart: WeatherRow | null;
    hours: WeatherRow[];
    windProfile: { time: string; w10: number; w80: number; w120: number; d10: number; d120: number; gust: number }[];
  };
  warnings: Awaited<ReturnType<typeof smhiWarnings>>;
  sun: { sunrise: string | null; sunset: string | null; dawn: string | null; dusk: string | null };
  kp: { kp: number; kind: string } | null;
  gnss: Awaited<ReturnType<typeof gpsInterference>> | null;
  notices: { level: "info" | "warn" | "danger"; title: string; text: string }[];
  drone: (DroneLike & { id: string }) | null;
  droneRules: ReturnType<typeof droneRules>;
  sources: SourceStatus[];
  map: FeatureCollection; // relevanta lager för kartan
};

export type WeatherRow = {
  time: string;
  temp: number;
  wind: number | null;
  gust: number | null;
  dir: number | null;
  cloudBase: number | null;
  cloud: number | null;
  vis: number | null;
  precip: number | null;
  thunder: number | null;
  pressure: number | null;
  symbol: number | null;
};

const LAYER_LABEL: Record<string, string> = {
  RSTA: "R-område (restriktion)",
  DNGA: "D-område (farligt)",
  CTR: "Kontrollzon (CTR)",
  TIZ: "Trafikinformationszon (TIZ)",
  ATZ: "Flygplatstrafikzon (ATZ)",
  RWY5K: "5 km-zon runt bana",
  HKP1K: "Helikopterplats (1 km)",
  SUP: "Tillfälligt område (AIP SUP)",
  NOTAM: "NOTAM-område",
  UAS: "Geografisk UAS-zon",
  NP: "Nationalpark",
  NR: "Naturreservat / naturvårdsområde",
  N2000: "Natura 2000",
};

function str(v: unknown) {
  return v === null || v === undefined ? "" : String(v);
}

/** Höjd i fot från LFV-sträng ("GND", "1500", "FL95") */
function lowerFt(v: unknown): number {
  const s = str(v).toUpperCase().trim();
  if (!s || s === "GND" || s === "SFC") return 0;
  if (s.startsWith("FL")) return Number(s.slice(2)) * 100;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pickName(p: Record<string, unknown>, fallback: string) {
  return str(p.NAMEOFAREA || p.NAME || p.LOCATION || p.DESIG || p.NAMN || p.name || p.id) || fallback;
}

function trimProps(p: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (v === null || v === "" || /^(SHAPE|CRC_|MI_STYLE|GmlID|OBJECTID)/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

async function settle<T>(sources: SourceStatus[], key: string, label: string, group: SourceStatus["group"], fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    const count = Array.isArray(r) ? r.length : (r as FeatureCollection | null)?.features?.length;
    sources.push({ key, label, group, ok: true, count });
    return r;
  } catch (e) {
    sources.push({ key, label, group, ok: false, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function nearest(points: SmhiPoint[], t: Date) {
  let best: SmhiPoint | null = null;
  let bd = Infinity;
  for (const p of points) {
    const d = Math.abs(new Date(p.time).getTime() - t.getTime());
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return bd <= 3 * 3600e3 ? best : null;
}

function toRow(p: SmhiPoint): WeatherRow {
  const d = p.data;
  const n = (v: number | undefined) => (v === undefined || v === -9 ? null : v);
  return {
    time: p.time,
    temp: d.air_temperature,
    wind: n(d.wind_speed),
    gust: n(d.wind_speed_of_gust),
    dir: n(d.wind_from_direction),
    cloudBase: d.cloud_base_altitude !== undefined && d.cloud_base_altitude >= 9000 ? null : n(d.cloud_base_altitude),
    cloud: n(d.cloud_area_fraction),
    vis: n(d.visibility_in_air),
    precip: n(d.precipitation_amount_mean),
    thunder: n(d.thunderstorm_probability),
    pressure: n(d.air_pressure_at_mean_sea_level),
    symbol: n(d.symbol_code),
  };
}

export async function buildBriefing(opts: {
  lat: number;
  lon: number;
  radius_m: number;
  flightTime: Date;
  durationH: number;
  drone: (DroneLike & { id: string }) | null;
  windYellow: number;
  windRed: number;
}): Promise<BriefingResult> {
  const { lat, lon, radius_m, flightTime, durationH } = opts;
  const from = flightTime;
  const to = new Date(flightTime.getTime() + durationH * 3600e3);
  const center = turf.point([lon, lat]);
  const opArea = turf.circle(center, radius_m / 1000, { steps: 64, units: "kilometers" });
  const viewBbox = turf.bbox(turf.buffer(opArea, 8, { units: "kilometers" })!) as [number, number, number, number];
  const sources: SourceStatus[] = [];
  const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, ".000Z");

  const [rsta, dnga, ctr, tiz, atz, rwy5k, hkp, sup, notam, uas, smhi, warnings, wind, nr, n2k, kp, gnss, place] = await Promise.all([
    settle(sources, "rsta", "R-områden", "LFV", () => lfvLayer("mais:RSTA")),
    settle(sources, "dnga", "D-områden", "LFV", () => lfvLayer("mais:DNGA")),
    settle(sources, "ctr", "Kontrollzoner (CTR)", "LFV", () => lfvLayer("mais:CTR")),
    settle(sources, "tiz", "TIZ", "LFV", () => lfvLayer("mais:TIZ")),
    settle(sources, "atz", "ATZ", "LFV", () => lfvLayer("mais:ATZ")),
    settle(sources, "rwy5k", "5 km-zoner runt banor", "LFV", () => lfvLayer("DAIM_TOPO:RWY5K")),
    settle(sources, "hkp", "Helikopterplatser", "LFV", () => lfvLayer("DAIM_TOPO:HKP1K")),
    settle(sources, "sup", "AIP SUP (tillfälliga områden)", "LFV", () =>
      lfvLayer("DAIM_TOPO:SUP", `TO>='${iso(from)}' AND FROM<='${iso(to)}'`, 3600e3)
    ),
    settle(sources, "notam", "NOTAM", "LFV", () =>
      lfvLayer("dynais:NOTAM", `ENDVALIDITY>='${iso(from)}' AND STARTVALIDITY<='${iso(to)}'`, 15 * 60e3)
    ),
    settle(sources, "uas", "Geografiska UAS-zoner (Drönarkartan)", "LFV", () => uasZones()),
    settle(sources, "smhi", "SMHI prognos", "Övrigt", () => smhiForecast(lat, lon)),
    settle(sources, "warnings", "SMHI vädervarningar", "Övrigt", () => smhiWarnings(lat, lon, from, new Date(to.getTime() + 6 * 3600e3))),
    settle(sources, "wind", "Vindprofil (Open-Meteo)", "Övrigt", () => windProfile(lat, lon)),
    settle(sources, "nr", "Naturvårdsregistret", "Övrigt", () => within(protectedAreas(viewBbox), 12000, "Stort område – laddas i bakgrunden. Uppdatera briefingen om en minut.")),
    settle(sources, "n2k", "Natura 2000", "Övrigt", () => within(natura2000(viewBbox), 12000, "Stort område – laddas i bakgrunden. Uppdatera briefingen om en minut.")),
    settle(sources, "kp", "Kp-index (NOAA SWPC)", "Övrigt", () => kpForecast(from)),
    settle(sources, "gnss", "GPS-störning (GPSJam)", "Övrigt", () => gpsInterference(lat, lon)),
    reverseGeocode(lat, lon).catch(() => `${lat.toFixed(4)}, ${lon.toFixed(4)}`),
  ]);

  const hits: AreaHit[] = [];
  const mapFeatures: Feature[] = [];
  const [vMinX, vMinY, vMaxX, vMaxY] = viewBbox;

  const inView = (f: Feature) => {
    try {
      const [a, b, c, d] = turf.bbox(f);
      return !(c < vMinX || a > vMaxX || d < vMinY || b > vMaxY);
    } catch {
      return false;
    }
  };
  /** Klipp mot kartutsnittet och förenkla (~20 m) så att stora naturområden inte blir megabyte-stora. */
  const forMap = (f: Feature): Geometry => {
    const g = f.geometry as Geometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") return g;
    try {
      const clipped = turf.bboxClip(f as Feature<Polygon | MultiPolygon>, viewBbox);
      return turf.simplify(clipped, { tolerance: 0.0002, highQuality: false }).geometry as Geometry;
    } catch {
      return g;
    }
  };
  const touches = (f: Feature) => {
    try {
      return turf.booleanIntersects(opArea, f as Feature<Geometry>);
    } catch {
      return false;
    }
  };

  function consider(
    fc: FeatureCollection | Feature[] | null,
    layer: string,
    classify: (p: Record<string, unknown>) => { severity: Severity; rule: string; relevant?: boolean; lower?: string; upper?: string; validity?: string; name?: string }
  ) {
    const feats = fc ? (Array.isArray(fc) ? fc : fc.features) : [];
    for (const f of feats) {
      if (!f.geometry || !inView(f)) continue;
      const p = (f.properties || {}) as Record<string, unknown>;
      const c = classify(p);
      if (c.relevant === false) continue;
      const name = c.name || pickName(p, LAYER_LABEL[layer]);
      mapFeatures.push({ type: "Feature", geometry: forMap(f), properties: { layer, name, severity: c.severity, lower: c.lower, upper: c.upper } });
      if (touches(f)) {
        hits.push({ layer, layerLabel: LAYER_LABEL[layer], name, severity: c.severity, lower: c.lower, upper: c.upper, validity: c.validity, rule: c.rule, props: trimProps(p) });
      }
    }
  }

  const lowRelevant = (p: Record<string, unknown>) => lowerFt(p.LOWER) < 400; // 120 m ≈ 394 ft

  consider(rsta, "RSTA", (p) => ({
    severity: "permission",
    relevant: lowRelevant(p),
    lower: str(p.LOWER),
    upper: str(p.UPPER),
    rule: "Flygning i R-område kräver tillstånd från den myndighet som anges för området.",
  }));
  consider(dnga, "DNGA", (p) => ({
    severity: "caution",
    relevant: lowRelevant(p),
    lower: str(p.LOWER),
    upper: str(p.UPPER),
    rule: "Farlig verksamhet kan pågå. Kontakta ansvarig för området innan flygning.",
  }));
  consider(ctr, "CTR", (p) => ({
    severity: "caution",
    lower: str(p.LOWER),
    upper: str(p.UPPER),
    rule: "Kontrollerat luftrum. Utanför 5 km-zonerna får du i öppen kategori flyga upp till 50 m utan tillstånd. Högre kräver tillstånd från flygtrafikledningen.",
  }));
  consider(tiz, "TIZ", () => ({ severity: "caution", rule: "Trafikinformationszon. Flyg lägre än 50 m och håll extra uppsikt efter bemannad trafik." }));
  consider(atz, "ATZ", () => ({ severity: "caution", rule: "Flygplatstrafikzon. Håll låg höjd och undvik in- och utflygningssektorer." }));
  consider(rwy5k, "RWY5K", () => ({
    severity: "permission",
    rule: "Inom 5 km från en start- och landningsbana krävs tillstånd (eller en tillåtande UAS-zon).",
  }));
  consider(hkp, "HKP1K", () => ({ severity: "caution", rule: "Helikopterplats inom 1 km. Var beredd att landa vid helikoptertrafik." }));
  consider(sup, "SUP", (p) => {
    const desig = str(p.DESIG || p.ID);
    const isR = /^ES\s?R|^ESR/i.test(desig);
    return {
      severity: isR ? "permission" : "caution",
      lower: str(p.LOWER),
      upper: str(p.UPPER),
      validity: `${str(p.FROM)} – ${str(p.TO)}`,
      name: `${str(p.NAME)} ${desig}`.trim(),
      relevant: lowRelevant(p),
      rule: isR ? "Tillfälligt restriktionsområde (AIP SUP). Tillstånd krävs." : "Tillfälligt område (AIP SUP). Kontrollera villkoren.",
    };
  });

  // NOTAM: bygg cirklar från koordinat + radie (NM)
  const notamList: BriefingResult["notams"] = [];
  const notamAreas: Feature[] = [];
  for (const f of notam?.features || []) {
    const p = (f.properties || {}) as Record<string, unknown>;
    const coord = parseNotamCoord(str(p.COORDINATES));
    const id = `${str(p.SERIES)}${str(p.NO)}/${str(p.YEAR)}`;
    const distanceKm = coord ? turf.distance(center, turf.point(coord), { units: "kilometers" }) : null;
    const lowFl = Number(p.LOWER ?? 0);
    const code23 = str(p.CODE23).toUpperCase();
    const isArea = (code23.startsWith("R") || code23.startsWith("W")) && str(p.CODE45).toUpperCase() !== "TT" && lowFl <= 4;
    const radiusNm = Number(p.RADIUS) || 0;
    let geom: Geometry | null = (f.geometry as Geometry) || null;
    if (!geom && coord && isArea && radiusNm > 0 && radiusNm < 100) geom = turf.circle(coord, radiusNm * 1.852, { steps: 48, units: "kilometers" }).geometry;
    const reach = (distanceKm ?? 999) - radiusNm * 1.852;
    if (isArea && geom) notamAreas.push({ type: "Feature", geometry: geom, properties: p });
    const near = distanceKm !== null && (distanceKm <= radius_m / 1000 + 15 || (radiusNm > 0 && radiusNm <= 50 && reach <= radius_m / 1000 + 5));
    if (near) {
      notamList.push({
        id: `${str(p.NOF)} ${id}`,
        text: str(p.ITEM_E),
        from: str(p.STARTVALIDITY),
        to: str(p.ENDVALIDITY),
        location: str(p.ITEM_A),
        distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
        isArea,
      });
    }
  }
  consider(notamAreas, "NOTAM", (p) => ({
    severity: str(p.CODE23).toUpperCase().startsWith("R") ? "permission" : "caution",
    name: `NOTAM ${str(p.SERIES)}${str(p.NO)}/${str(p.YEAR)} ${str(p.ITEM_A)}`,
    lower: `FL${str(p.LOWER)}`,
    upper: `FL${str(p.UPPER)}`,
    validity: `${str(p.STARTVALIDITY)} – ${str(p.ENDVALIDITY)}`,
    rule: str(p.ITEM_E).slice(0, 400),
  }));
  notamList.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));

  consider(uas, "UAS", (p) => {
    const t = str(p.zoneType);
    const severity: Severity = t === "PROHIBITED" || t === "REQ_AUTHORIZATION" ? "permission" : t === "CONDITIONAL" ? "caution" : "info";
    return { severity, lower: str(p.lower), upper: str(p.upper), rule: str(p.message) || `Zontyp: ${t}` };
  });

  consider(nr, "NR", (p) => {
    const kind = str(p.kind);
    const np = /nationalpark/i.test(kind);
    return {
      severity: np ? "permission" : "caution",
      name: `${str(p.name)} (${kind})`,
      rule: np
        ? "Nationalpark – drönarflygning är ofta förbjuden enligt föreskrifterna. Kontrollera och sök dispens hos förvaltaren."
        : "Skyddat område – kontrollera föreskrifterna. Vissa reservat förbjuder drönare; dispens söks hos Länsstyrelsen/kommunen.",
    };
  });
  // nationalparker ritas som eget lager
  for (const f of mapFeatures) if (f.properties?.layer === "NR" && /nationalpark/i.test(str(f.properties?.name))) f.properties!.layer = "NP";
  for (const h of hits) if (h.layer === "NR" && /nationalpark/i.test(h.name)) {
    h.layer = "NP";
    h.layerLabel = LAYER_LABEL.NP;
  }

  consider(n2k, "N2000", (p) => ({
    severity: "info",
    name: `${str(p.name)} (${str(p.code)})`,
    rule: "Natura 2000-område. Undvik störning av känsliga arter, särskilt under häckningstid.",
  }));

  const sevRank: Record<Severity, number> = { permission: 2, caution: 1, info: 0 };
  hits.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
  const worst = hits.reduce((m, h) => Math.max(m, sevRank[h.severity]), 0);
  const status: BriefingResult["status"] = worst === 2 ? "PERMISSION" : worst === 1 ? "CAUTION" : "OK";

  let maxHeight = { m: 120, reason: "Öppen kategori" };
  if (hits.some((h) => ["CTR", "TIZ", "ATZ"].includes(h.layer))) maxHeight = { m: 50, reason: "Inom kontrollerat luftrum/TIZ utan tillstånd" };
  for (const h of hits.filter((x) => x.layer === "UAS" && x.severity !== "info")) {
    const m = h.lower?.match(/^(\d+)\s*m/);
    if (m && +m[1] > 0 && +m[1] < maxHeight.m) maxHeight = { m: +m[1], reason: `Under UAS-zon ${h.name}` };
  }

  // väder
  const hoursAll = (smhi || []).map(toRow);
  const startPoint = smhi ? nearest(smhi, from) : null;
  const atStart = startPoint ? toRow(startPoint) : null;
  const hours = hoursAll.filter((h) => {
    const t = new Date(h.time).getTime();
    return t >= from.getTime() - 3600e3 && t <= from.getTime() + 24 * 3600e3;
  });
  const wp = (wind || []).filter((w) => {
    const t = new Date(w.time).getTime();
    return t >= from.getTime() - 3600e3 && t <= to.getTime() + 3600e3;
  });

  const day = new Date(from);
  const sc = SunCalc.getTimes(day, lat, lon);
  const safe = (d: Date | null | undefined) => (d && !isNaN(d.getTime()) ? d.toISOString() : null);
  const sun = { sunrise: safe(sc.sunrise), sunset: safe(sc.sunset), dawn: safe(sc.dawn), dusk: safe(sc.dusk) };
  const sunUpAt = (d: Date) => SunCalc.getPosition(d, lat, lon).altitude > -0.833 * (Math.PI / 180);

  const notices: BriefingResult["notices"] = [];
  const windNow = wp[0]?.w10 ?? atStart?.wind ?? null;
  const windMax = Math.max(...wp.map((w) => Math.max(w.w120, w.gust)), atStart?.gust ?? 0);
  if (windNow === null) notices.push({ level: "info", title: "Vinddata saknas", text: "Prognos saknas för vald tid. Skapa briefingen närmare flygtillfället." });
  else if (windMax >= opts.windRed) notices.push({ level: "danger", title: "Hård vind", text: `Vind/byar upp till ${windMax.toFixed(1)} m/s i flygfönstret överstiger röd gräns (${opts.windRed} m/s).` });
  else if (windMax >= opts.windYellow) notices.push({ level: "warn", title: "Byig vind", text: `Vind/byar upp till ${windMax.toFixed(1)} m/s – över gul gräns (${opts.windYellow} m/s).` });
  if (!sunUpAt(from) || !sunUpAt(to)) notices.push({ level: "warn", title: "Mörkerflygning", text: "Delar av flygfönstret ligger utanför dagsljus. Grönt blinkande ljus krävs på drönaren i öppen kategori." });
  if (atStart && atStart.vis !== null && atStart.vis < 3) notices.push({ level: "warn", title: "Nedsatt sikt", text: `Prognostiserad sikt ${atStart.vis} km. Säkerställ VLOS.` });
  if (atStart && (atStart.thunder ?? 0) >= 20) notices.push({ level: "danger", title: "Åskrisk", text: `Åsksannolikhet ${atStart.thunder} %.` });
  if (atStart && atStart.temp <= 0) notices.push({ level: "warn", title: "Kyla", text: "Minusgrader: förvärm batterierna och räkna med kortare flygtid. Se upp för isbildning." });
  if (kp && kp.kp >= 5) notices.push({ level: "warn", title: `Geomagnetisk storm (Kp ${kp.kp})`, text: "Försämrad GNSS-noggrannhet möjlig. Var beredd att flyga i ATTI/manuellt." });
  if (gnss && (gnss.level === "hög" || gnss.level === "medel")) notices.push({ level: gnss.level === "hög" ? "danger" : "warn", title: "GPS-störning rapporterad", text: `${gnss.pct} % av flygplanen i området rapporterade dålig GNSS-kvalitet (${gnss.date}).` });
  if (notamList.some((n) => n.isArea)) notices.push({ level: "warn", title: "NOTAM-områden i närheten", text: "Det finns aktiva NOTAM-områden nära operationsområdet. Läs dem nedan." });
  notices.push({ level: "info", title: "Skyddsobjekt ingår inte", text: "Kontrollera alltid om det finns skyddsobjekt (t.ex. militära anläggningar) i området – drönarflygning där kräver tillstånd." });

  return {
    version: 1,
    place: place as string,
    center: [lon, lat],
    radius_m,
    from: from.toISOString(),
    to: to.toISOString(),
    generatedAt: new Date().toISOString(),
    status,
    maxHeight,
    hits,
    notams: notamList.slice(0, 40),
    weather: { atStart, hours, windProfile: wp },
    warnings: warnings || [],
    sun,
    kp,
    gnss,
    notices,
    drone: opts.drone,
    droneRules: droneRules(opts.drone),
    sources,
    map: { type: "FeatureCollection", features: mapFeatures },
  };
}
