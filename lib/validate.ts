/** Små hjälpare för att validera formulärdata från server actions. */

export const isValidLatLon = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

/** Briefingradie 100 m – 10 km. */
export const clampRadius = (r: number, fallback = 500) => Math.min(10_000, Math.max(100, Math.round(Number.isFinite(r) && r > 0 ? r : fallback)));

/** Värdet om det finns i listan, annars standardvärdet. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Tal eller null för valfria numeriska fält ("" → null, ogiltigt → null). */
export function optNumber(v: FormDataEntryValue | null, min = -Infinity, max = Infinity): number | null {
  if (v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export const FLIGHT_TYPES = ["standard", "instruction", "simulator"] as const;
export const CHECKLIST_KINDS = ["preflight", "postflight", "daily", "custom"] as const;
export const CLASS_MARKS = ["none", "C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const;

/** Högsta antal spårpunkter som skickas till servern vid import – klienten gallrar innan. */
export const MAX_TRACK_POINTS = 5000;

/** Gallrar ett spår till högst max punkter men behåller första, sista och högsta punkten. */
export function thinTrack<T extends { alt: number | null }>(pts: T[], max = MAX_TRACK_POINTS): T[] {
  if (pts.length <= max) return pts;
  let hi = -1;
  pts.forEach((p, i) => {
    if (p.alt !== null && (hi < 0 || p.alt > (pts[hi].alt as number))) hi = i;
  });
  const step = Math.ceil(pts.length / (max - 2));
  const keep = new Set<number>([0, pts.length - 1]);
  if (hi >= 0) keep.add(hi);
  for (let i = 0; i < pts.length; i += step) keep.add(i);
  return [...keep].sort((a, b) => a - b).slice(0, max).map((i) => pts[i]);
}
