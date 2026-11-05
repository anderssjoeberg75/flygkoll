/** Validering och tolkning av indata från formulär och filer. Rena funktioner – testbara utan databas. */

export const FLIGHT_TYPES = ["standard", "instruction", "simulator"] as const;
export const CLASS_MARKS = ["none", "C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const;
export const CHECKLIST_KINDS = ["preflight", "postflight", "daily", "custom"] as const;
export const THEMES = ["system", "light", "dark"] as const;

/** Värdet om det finns i listan, annars standardvärdet. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Tal inom [min, max] eller null för tomma/ogiltiga fält ("12,5" godtas). */
export function optNumber(v: unknown, min = -Infinity, max = Infinity): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function isEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** Text begränsad till max tecken. */
export const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Unika, sorterade punktindex i [0, n) från en (opålitlig) lista över avbockade punkter. */
export function checkedItems(v: unknown, n: number): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const x of v) if (Number.isInteger(x) && x >= 0 && x < n) set.add(x);
  return [...set].sort((a, b) => a - b);
}

/* ---------- flygloggar ---------- */

/** Tidigaste rimliga tidsstämpel i en flyglogg. */
export const MIN_TRACK_T = Date.UTC(2000, 0, 1);
/** Längsta tid från start som en relativ tidsstämpel får ha (ett dygn). */
const MAX_RELATIVE_T = 864e5;

/** Absolut tidsstämpel i ms inom [år 2000, nu + 1 dygn]. */
export const validTrackTime = (t: number, now = Date.now()) => Number.isFinite(t) && t >= MIN_TRACK_T && t <= now + 864e5;

/**
 * Gör loggens tider absoluta och kastar orimliga värden (#37).
 *
 * Loggar kan ha Unix-tid (ms) eller tid från start (`time(millisecond)`, eller radnummer × 1000
 * när tidskolumn saknas). Det som gäller för flest punkter avgör tolkningen. Relativa tider
 * räknas från `startedAt`, eller från nu om starttid saknas.
 */
export function normalizeTrackTimes<P extends { t: number }>(points: P[], startedAt: number, now = Date.now()): P[] {
  const finite = points.filter((p) => typeof p.t === "number" && Number.isFinite(p.t));
  const absolute = finite.filter((p) => p.t >= MIN_TRACK_T).length;
  if (absolute * 2 >= finite.length) return finite.filter((p) => validTrackTime(p.t, now));
  const base = validTrackTime(startedAt, now) ? startedAt : now;
  return finite.filter((p) => p.t >= 0 && p.t <= MAX_RELATIVE_T).map((p) => ({ ...p, t: base + p.t }));
}

/* ---------- lösenord ---------- */

export const MIN_PASSWORD = 10;
const COMMON = new Set([
  "password", "password1", "password123", "lösenord", "losenord", "lösenord123", "qwerty", "qwertyuiop", "123456789", "1234567890",
  "12345678910", "abcdefghij", "iloveyou12", "drönare123", "dronare123", "flygkoll", "flygkoll123", "sommar2026", "vinter2026", "hösten2026",
]);

/** Felmeddelande om lösenordet inte duger, annars null. */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < MIN_PASSWORD) return `Lösenordet måste vara minst ${MIN_PASSWORD} tecken.`;
  if (pw.length > 200) return "Lösenordet är för långt (max 200 tecken).";
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw) || /^(0123456789|1234567890|9876543210)/.test(pw)) return "Lösenordet är för vanligt – välj ett annat.";
  const local = email.toLowerCase().split("@")[0] ?? "";
  if (local.length >= 4 && lower.includes(local)) return "Lösenordet får inte innehålla din e-postadress.";
  return null;
}

/* ---------- CSV ---------- */

/**
 * Tolkar CSV med citerade fält (separator och radbrytning inuti citat, "" som citattecken).
 * Avgränsaren gissas från rubrikraden (; eller ,). Tomma rader hoppas över.
 */
export function parseCsv(input: string, maxRows = Infinity): string[][] {
  const textIn = input.replace(/^﻿/, "");
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) && firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const pushRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
    row = [];
    cell = "";
  };
  for (let i = 0; i < textIn.length; i++) {
    const ch = textIn[i];
    if (quoted) {
      if (ch === '"') {
        if (textIn[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && textIn[i + 1] === "\n") i++;
      pushRow();
      if (rows.length >= maxRows) return rows;
    } else cell += ch;
  }
  if (cell !== "" || row.length) pushRow();
  return rows;
}

/**
 * Ett CSV-fält för export, citerat. Text som börjar med = + - @ tab eller CR får ett inledande
 * apostroftecken så att Excel/LibreOffice inte tolkar den som formel (CSV-injektion).
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/* ---------- databasfel ---------- */

/** Sant om felet är en UNIQUE-konflikt från SQLite (t.ex. två samtidiga registreringar, #37). */
export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

/** Escapar % _ och \ för LIKE ... ESCAPE '\' så att sökord matchas bokstavligt (#37). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/* ---------- JSON från databasen ---------- */

/** JSON.parse som returnerar fallback i stället för att kasta vid trasig data. */
export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined || s === "") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    console.error("[flygkoll] kunde inte tolka JSON från databasen");
    return fallback;
  }
}
