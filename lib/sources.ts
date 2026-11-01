import "server-only";
import * as turf from "@turf/turf";
import { latLngToCell, gridDisk } from "h3-js";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { LruCache } from "./lru";

// Nominatim kräver identifierbar User-Agent; sätt FLYGKOLL_CONTACT till e-post eller URL för din instans
const UA = `Flygkoll/0.1 (self-hosted drone briefing${process.env.FLYGKOLL_CONTACT ? `; ${process.env.FLYGKOLL_CONTACT}` : ""})`;

/* ---------- fetch helpers ---------- */

// begränsad cache: nycklar innehåller koordinater och skulle annars växa så länge processen lever
const cache = new LruCache<unknown>(400);

async function fetchWithTimeout(url: string, ms = 15000, init: RequestInit = {}, retries = 1): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers || {}) }, cache: "no-store" });
    if (res.status >= 500 && retries > 0) return fetchWithTimeout(url, ms, init, retries - 1);
    if (!res.ok) throw new Error(`HTTP ${res.status} från ${new URL(url).host}`);
    return res;
  } catch (e) {
    // nätverksfel (inte timeout) – försök en gång till
    if (retries > 0 && !(e instanceof Error && e.name === "AbortError") && !(e instanceof Error && e.message.startsWith("HTTP"))) {
      return fetchWithTimeout(url, ms, init, retries - 1);
    }
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Timeout från ${new URL(url).host}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Diskcache för långsamma, sällan ändrade datamängder (Naturvårdsverket). */
const DISK_DIR = path.join(process.cwd(), "data", "cache");
const inflight = new Map<string, Promise<unknown>>();

async function diskCachedJson<T>(key: string, url: string, ttlMs: number, timeoutMs: number): Promise<T> {
  const file = path.join(DISK_DIR, crypto.createHash("sha1").update(key).digest("hex") + ".json");
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtimeMs < ttlMs) return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    /* ingen cache */
  }
  if (!inflight.has(key)) {
    const p = (async () => {
      const data = await (await fetchWithTimeout(url, timeoutMs)).json();
      await fs.mkdir(DISK_DIR, { recursive: true });
      await fs.writeFile(file, JSON.stringify(data));
      return data;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return inflight.get(key) as Promise<T>;
}

/** Låter en långsam hämtning fortsätta i bakgrunden men ger upp väntan efter ms. */
export function within<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

const inflightMem = new Map<string, Promise<unknown>>();

/** Hämtar och cachar ett värde; samtidiga anrop med samma nyckel delar på en hämtning. */
async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key, ttlMs);
  if (hit !== undefined) return hit as T;
  let p = inflightMem.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load()
      .then((v) => {
        cache.set(key, v);
        return v;
      })
      .finally(() => inflightMem.delete(key));
    inflightMem.set(key, p);
  }
  return p;
}

async function cachedJson<T>(url: string, ttlMs: number, timeoutMs = 15000, init: RequestInit = {}): Promise<T> {
  return memo(url, ttlMs, async () => (await (await fetchWithTimeout(url, timeoutMs, init)).json()) as T);
}

async function cachedText(url: string, ttlMs: number): Promise<string> {
  return memo(url, ttlMs, async () => (await fetchWithTimeout(url, 30000)).text());
}

const HOUR = 3600e3;

/* ---------- LFV DAIM (öppen WFS, samma som Drönarkartan) ---------- */

const LFV_WFS = "https://daim.lfv.se/geoserver/wfs";

export async function lfvLayer(typename: string, cql?: string, ttl = 6 * HOUR): Promise<FeatureCollection> {
  const p = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typename,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });
  if (cql) p.set("CQL_FILTER", cql);
  return cachedJson<FeatureCollection>(`${LFV_WFS}?${p}`, ttl);
}

/** NOTAM-koordinat "5641N01617E" → [lon, lat] */
export function parseNotamCoord(s: string | null | undefined): [number, number] | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})(\d{2})(\d{2})?([NS])(\d{3})(\d{2})(\d{2})?([EW])$/);
  if (!m) return null;
  let lat = +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0);
  let lon = +m[5] + +m[6] / 60 + (m[7] ? +m[7] / 3600 : 0);
  if (m[4] === "S") lat = -lat;
  if (m[8] === "W") lon = -lon;
  return [lon, lat];
}

/* ---------- Geografiska UAS-zoner (ED-318, Drönarkartan) ---------- */

type Ed318Feature = {
  type: "Feature";
  geometry: (Geometry & { extent?: { subType: string; radius: number }; layer?: { upper: number; upperReference: string; lower: number; lowerReference: string; uom: string } }) | null;
  properties: {
    identifier: string;
    name?: { text: string; lang: string }[];
    type?: string;
    restrictionConditions?: string;
    reason?: string[];
    message?: { text: string; lang: string }[];
    [k: string]: unknown;
  };
};

const UAS_URL = "https://daim.lfv.se/echarts/dronechart/data/uas_zones_ED318.json";

/** UAS-zoner som GeoJSON. Det bearbetade resultatet cachas, så cirklarna byggs bara när rådatan hämtas om. */
export function uasZones(): Promise<FeatureCollection> {
  return memo("uasZones:processed", 6 * HOUR, async () => convertUasZones(await (await fetchWithTimeout(UAS_URL, 15000)).json()));
}

export function convertUasZones(raw: { features?: Ed318Feature[] }): FeatureCollection {
  const features: Feature[] = [];
  for (const f of raw.features || []) {
    const g = f.geometry;
    if (!g) continue;
    const sv = (arr?: { text: string; lang: string }[]) => arr?.find((x) => x.lang.startsWith("sv"))?.text ?? arr?.[0]?.text ?? "";
    const props = {
      id: f.properties.identifier,
      name: sv(f.properties.name),
      zoneType: f.properties.type ?? "",
      message: sv(f.properties.message),
      reason: (f.properties.reason || []).join(", "),
      upper: g.layer ? `${g.layer.upper} ${g.layer.uom} ${g.layer.upperReference}` : "",
      lower: g.layer ? `${g.layer.lower} ${g.layer.uom} ${g.layer.lowerReference}` : "",
    };
    let geom: Geometry | null = null;
    if (g.type === "Point" && g.extent?.subType === "Circle") {
      geom = turf.circle(g.coordinates as [number, number], g.extent.radius / 1000, { steps: 48, units: "kilometers" }).geometry;
    } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      geom = { type: g.type, coordinates: (g as Polygon).coordinates } as Geometry;
    }
    if (geom) features.push({ type: "Feature", geometry: geom, properties: props });
  }
  return { type: "FeatureCollection", features };
}

/* ---------- SMHI ---------- */

export type SmhiPoint = {
  time: string;
  data: Record<string, number>;
};

export async function smhiForecast(lat: number, lon: number): Promise<SmhiPoint[]> {
  const url = `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`;
  const j = await cachedJson<{ timeSeries: SmhiPoint[] }>(url, HOUR / 2);
  return j.timeSeries;
}

type SmhiWarning = {
  id: number;
  event: { sv: string; en: string; code: string };
  warningAreas: {
    id: number;
    approximateStart?: string;
    approximateEnd?: string;
    areaName: { sv: string };
    warningLevel: { sv: string; code: string };
    eventDescription: { sv: string };
    descriptions?: { title: { sv: string }; text: { sv: string } }[];
    area?: Feature | FeatureCollection;
  }[];
};

export async function smhiWarnings(lat: number, lon: number, from: Date, to: Date) {
  const all = await cachedJson<SmhiWarning[]>("https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json", HOUR / 4);
  const pt = turf.point([lon, lat]);
  const out: { event: string; level: string; levelCode: string; area: string; start?: string; end?: string; description: string; details: { title: string; text: string }[] }[] = [];
  for (const w of all) {
    for (const a of w.warningAreas) {
      const start = a.approximateStart ? new Date(a.approximateStart) : null;
      const end = a.approximateEnd ? new Date(a.approximateEnd) : null;
      if (start && start > to) continue;
      if (end && end < from) continue;
      let inside = false;
      const area = a.area;
      try {
        const feats = area ? ((area as FeatureCollection).features ?? [area as Feature]) : [];
        inside = feats.some((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") && turf.booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>));
      } catch {
        inside = false;
      }
      if (!inside) continue;
      out.push({
        event: w.event.sv,
        level: a.warningLevel.sv,
        levelCode: a.warningLevel.code,
        area: a.areaName.sv,
        start: a.approximateStart,
        end: a.approximateEnd,
        description: a.eventDescription.sv,
        details: (a.descriptions || []).map((d) => ({ title: d.title.sv, text: d.text.sv })),
      });
    }
  }
  return out;
}

/* ---------- Open-Meteo vindprofil (10/80/120 m) ---------- */

export async function windProfile(lat: number, lon: number) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: "wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_direction_10m,wind_direction_120m,wind_gusts_10m",
    wind_speed_unit: "ms",
    timezone: "UTC",
    forecast_days: "8",
  });
  const j = await cachedJson<{ hourly: Record<string, (number | string)[]> }>(`https://api.open-meteo.com/v1/forecast?${p}`, HOUR / 2);
  const h = j.hourly;
  return (h.time as string[]).map((t, i) => ({
    time: t + ":00Z",
    w10: h.wind_speed_10m[i] as number,
    w80: h.wind_speed_80m[i] as number,
    w120: h.wind_speed_120m[i] as number,
    d10: h.wind_direction_10m[i] as number,
    d120: h.wind_direction_120m[i] as number,
    gust: h.wind_gusts_10m[i] as number,
  }));
}

/* ---------- Naturvårdsverket ---------- */

async function nvWfs(service: "naturvardsregistret" | "n2000", typeName: string, bbox: [number, number, number, number]) {
  // fäst bbox mot ett 0,2°-rutnät så att cachen återanvänds mellan närliggande briefingar
  const g = 0.2;
  const minLon = Math.floor(bbox[0] / g) * g, minLat = Math.floor(bbox[1] / g) * g;
  const maxLon = Math.ceil(bbox[2] / g) * g, maxLat = Math.ceil(bbox[3] / g) * g;
  const p = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: typeName,
    outputFormat: "GEOJSON",
    srsName: "EPSG:4326",
    count: "500",
    bbox: `${minLat.toFixed(2)},${minLon.toFixed(2)},${maxLat.toFixed(2)},${maxLon.toFixed(2)},urn:ogc:def:crs:EPSG::4326`,
  });
  const url = `https://geodata.naturvardsverket.se/${service}/wfs?${p}`;
  return diskCachedJson<FeatureCollection>(`${service}|${typeName}|${minLon.toFixed(2)},${minLat.toFixed(2)},${maxLon.toFixed(2)},${maxLat.toFixed(2)}`, url, 7 * 24 * HOUR, 120000);
}

export async function protectedAreas(bbox: [number, number, number, number]) {
  const fc = await nvWfs("naturvardsregistret", "Naturvardsregistret_WFS:SkyddadeOmraden", bbox);
  return fc.features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      name: f.properties?.NAMN,
      kind: f.properties?.SKYDDSTYP,
      authority: f.properties?.FORVALTARE,
      nvrid: f.properties?.NVRID,
      status: f.properties?.BESLUTSSTATUS,
      county: f.properties?.LAN,
      municipality: f.properties?.KOMMUN,
      decisionAuthority: f.properties?.BESLUTSMYNDIGHET,
      iucn: f.properties?.IUCNKATEGORI,
    },
  })) as Feature[];
}

export async function natura2000(bbox: [number, number, number, number]) {
  const fc = await nvWfs("n2000", "N2000_WFS:N2000", bbox);
  return fc.features.map((f) => ({
    ...f,
    properties: { name: f.properties?.OMRADESNAMN, kind: `Natura 2000 (${f.properties?.OMRADESTYP})`, code: f.properties?.OMRADESKOD },
  })) as Feature[];
}

/* ---------- Kp-index (NOAA SWPC 3-dygnsprognos) ---------- */

/** Högsta Kp i de 3-timmarsblock som överlappar [from, to]. */
export async function kpForecast(from: Date, to: Date = from) {
  const j = await cachedJson<{ time_tag: string; kp: number; observed: string }[] | (string | number)[][]>(
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    HOUR
  );
  const rows = (Array.isArray(j[0]) ? (j as (string | number)[][]).slice(1).map((r) => ({ time_tag: String(r[0]), kp: Number(r[1]), observed: String(r[2]) })) : (j as { time_tag: string; kp: number; observed: string }[]));
  return maxKpInWindow(rows, from, to);
}

export function maxKpInWindow(rows: { time_tag: string; kp: number; observed: string }[], from: Date, to: Date) {
  const a = from.getTime(), b = Math.max(a, to.getTime());
  let best: { kp: number; kind: string; at: string } | null = null;
  for (const r of rows) {
    const rt = new Date(r.time_tag.endsWith("Z") ? r.time_tag : r.time_tag.replace(" ", "T") + "Z").getTime();
    const overlaps = rt <= b && a < rt + 3 * HOUR;
    if (overlaps && Number.isFinite(r.kp) && (!best || r.kp > best.kp)) best = { kp: r.kp, kind: r.observed, at: new Date(Math.max(rt, a)).toISOString() };
  }
  return best;
}

/* ---------- GPS-störning (GPSJam, ADS-B-baserad, H3 res 4) ---------- */

export async function gpsInterference(lat: number, lon: number) {
  const manifest = await cachedText("https://gpsjam.org/data/manifest.csv", 6 * HOUR);
  const dates = manifest.trim().split("\n").slice(1).map((l) => l.split(",")[0]).filter(Boolean).sort();
  const last = dates[dates.length - 1];
  if (!last) throw new Error("Tom manifest");
  // tolka CSV:n en gång per fil till cell → [bra, dåliga] i stället för vid varje briefing
  const cells = await memo(`gpsjam:${last}`, 12 * HOUR, async () => parseGpsJam(await (await fetchWithTimeout(`https://gpsjam.org/data/${last}-h3_4.csv`, 30000)).text()));
  const cell = latLngToCell(lat, lon, 4);
  let good = 0, bad = 0, ownPct: number | null = null;
  for (const hex of gridDisk(cell, 1)) {
    const v = cells.get(hex);
    if (!v) continue;
    good += v[0];
    bad += v[1];
    if (hex === cell) ownPct = (v[1] / Math.max(1, v[0] + v[1])) * 100;
  }
  const pct = (bad / Math.max(1, good + bad)) * 100;
  const level = good + bad < 3 ? "okänd" : pct > 10 ? "hög" : pct >= 2 ? "medel" : "låg";
  return { date: last, pct: Math.round(pct * 10) / 10, ownPct, aircraft: good + bad, level };
}

export function parseGpsJam(csv: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const line of csv.split("\n")) {
    const [hex, g, b] = line.split(",");
    const good = Number(g), bad = Number(b);
    if (!hex || !Number.isFinite(good) || !Number.isFinite(bad)) continue;
    out.set(hex.trim(), [good, bad]);
  }
  return out;
}

/* ---------- Geokodning (OSM Nominatim) ---------- */

// Nominatims användarpolicy: högst ett anrop per sekund. Alla anrop köas och sprids ut.
const NOMINATIM_GAP_MS = 1100;
const NOMINATIM_MAX_QUEUE = 20;
let nominatimChain: Promise<unknown> = Promise.resolve();
let nominatimLast = 0;
let nominatimQueued = 0;

function nominatim<T>(url: string): Promise<T> {
  return memo(url, 24 * HOUR, () => {
    if (nominatimQueued >= NOMINATIM_MAX_QUEUE) return Promise.reject(new Error("Platssökningen är upptagen – försök igen om en stund."));
    nominatimQueued++;
    const run = nominatimChain.then(async () => {
      const wait = nominatimLast + NOMINATIM_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      nominatimLast = Date.now();
      return (await (await fetchWithTimeout(url, 10000, {}, 0)).json()) as T;
    });
    const settled = run.finally(() => nominatimQueued--);
    nominatimChain = settled.catch(() => undefined);
    return settled;
  });
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  // avrunda (~10 m) så att närliggande briefingar delar cache och inte belastar Nominatim
  const j = await nominatim<{ address?: Record<string, string>; display_name?: string }>(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&zoom=12&accept-language=sv`
  );
  const a = j.address || {};
  return a.city || a.town || a.village || a.municipality || a.county || j.display_name?.split(",")[0] || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

export async function searchPlace(q: string) {
  const query = q.trim().replace(/\s+/g, " ").slice(0, 200);
  const p = new URLSearchParams({ q: query, format: "json", countrycodes: "se", limit: "6", "accept-language": "sv" });
  return nominatim<{ display_name: string; lat: string; lon: string }[]>(`https://nominatim.openstreetmap.org/search?${p}`);
}
