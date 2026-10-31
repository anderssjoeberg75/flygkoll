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

/** "2026-10-31T14:30" tolkat som svensk lokal tid → Date */
export function parseLocalStockholm(s: string): Date {
  const [d, t] = s.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = (t || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asLocal - guess));
}

export function toLocalInput(d: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return parts.replace(" ", "T");
}
