const TZ = "Europe/Stockholm";

export const fmtDateTime = (iso: string | Date | null | undefined) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "–";
export const fmtDate = (iso: string | Date | null | undefined) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short" }).format(new Date(iso)) : "–";
export const fmtTime = (iso: string | Date | null | undefined) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–";

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  OK: { text: "OK", cls: "b-ok" },
  CAUTION: { text: "Försiktighet", cls: "b-warn" },
  PERMISSION: { text: "Tillstånd krävs", cls: "b-danger" },
  INCOMPLETE: { text: "Ofullständig", cls: "b-danger" },
};

export const SEVERITY_LABEL: Record<string, { text: string; cls: string }> = {
  permission: { text: "Tillstånd krävs", cls: "b-danger" },
  caution: { text: "Försiktighet", cls: "b-warn" },
  info: { text: "Info", cls: "b-info" },
};

export function compass(deg: number | null | undefined) {
  if (deg === null || deg === undefined) return "";
  const d = ["N", "NO", "O", "SO", "S", "SV", "V", "NV"];
  return d[Math.round(((deg % 360) / 45)) % 8];
}

const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Stockholms UTC-offset (ms) vid en given tidpunkt. */
function stockholmOffset(ms: number): number {
  const parts = offsetFmt.formatToParts(new Date(ms));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(ms / 60e3) * 60e3;
}

/**
 * "2026-10-31T14:30" tolkat som svensk lokal tid → Date. Ogiltig indata ger ett ogiltigt Date (kastar inte).
 * Offseten räknas om vid det framräknade ögonblicket, så tider natten då sommar-/vintertid börjar blir rätt.
 */
export function parseLocalStockholm(s: string): Date {
  // hela strängen måste följa formatet – en trasig tid får inte falla tillbaka till bara datumet
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(String(s ?? "").trim());
  if (!m) return new Date(NaN);
  const [y, mo, da, h, mi] = [m[1], m[2], m[3], m[4] ?? "00", m[5] ?? "00"].map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  // Date.UTC rullar över (månad 13, 31 april, 25:00) – avvisa i stället för att byta datum
  const w = new Date(wall);
  if (isNaN(wall) || w.getUTCFullYear() !== y || w.getUTCMonth() !== mo - 1 || w.getUTCDate() !== da || w.getUTCHours() !== h || w.getUTCMinutes() !== mi) {
    return new Date(NaN);
  }
  const first = wall - stockholmOffset(wall);
  return new Date(wall - stockholmOffset(first));
}

export function toLocalInput(d: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return parts.replace(" ", "T");
}
