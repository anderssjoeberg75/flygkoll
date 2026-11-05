"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriter, displayName } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { parseLocalStockholm } from "@/lib/format";
import { FLIGHT_TYPES, normalizeTrackTimes, oneOf, optNumber, parseCsv, text, validTrackTime } from "@/lib/validate";
import { reverseGeocode, within } from "@/lib/sources";
import { getAccessibleBriefing } from "@/lib/access";

type CrewIn = { role: string; userId?: string; name?: string };

function saveCrew(flightId: string, orgId: string, crew: CrewIn[]) {
  const ins = db.prepare("INSERT INTO flight_crew (flight_id, user_id, name, role) VALUES (?, ?, ?, ?)");
  for (const c of crew) {
    if (!c.role) continue;
    let name = (c.name || "").trim();
    let uid: string | null = null;
    if (c.userId) {
      const u = db.prepare("SELECT id, first_name, last_name, email FROM users WHERE id = ? AND org_id = ?").get(c.userId, orgId) as
        | { id: string; first_name: string; last_name: string; email: string }
        | undefined;
      if (u) {
        uid = u.id;
        name = displayName(u);
      }
    }
    if (name) ins.run(flightId, uid, name, c.role);
  }
}

export async function saveFlight(fd: FormData) {
  const user = await requireWriter();
  const rawId = String(fd.get("id") || "").trim();

  // Kontrollera om flygningen redan finns och tillhör organisationen (#7)
  const existing = rawId
    ? (db.prepare("SELECT id, pilot_id, briefing_id FROM flights WHERE id = ? AND org_id = ?").get(rawId, user.org_id) as
        | { id: string; pilot_id: string; briefing_id: string | null }
        | undefined)
    : undefined;

  // Endast piloten själv eller admin får redigera (#7)
  if (existing && existing.pilot_id !== user.id && user.role !== "admin") {
    redirect("/logbook");
  }

  // Om flygningen inte finns: generera ALLTID ett nytt id för att undvika PK-kollisioner (#7)
  const id = existing ? existing.id : newId();
  const started = parseLocalStockholm(String(fd.get("started_at") || ""));
  if (isNaN(started.getTime())) redirect(existing ? `/logbook/${existing.id}/edit` : "/logbook/new");
  const duration = optNumber(fd.get("duration_min"), 0, 24 * 60) ?? 0;

  // Validera att drönaren tillhör organisationen (#7)
  let droneId = String(fd.get("drone_id") || "").trim() || null;
  if (droneId) {
    const valid = db.prepare("SELECT id FROM drones WHERE id = ? AND org_id = ?").get(droneId, user.org_id);
    if (!valid) droneId = null;
  }

  // Briefingen måste tillhöra organisationen och vara egen eller delad (#7, #33)
  const rawBriefing = String(fd.get("briefing_id") || "").trim() || null;
  // En befintlig koppling behålls även om briefingen är någon annans privata (t.ex. när admin redigerar).
  const keepsLink = !!existing && rawBriefing !== null && rawBriefing === existing.briefing_id;
  const briefingId = keepsLink || getAccessibleBriefing(user, rawBriefing) ? rawBriefing : null;

  const lat = optNumber(fd.get("lat"), -90, 90), lon = optNumber(fd.get("lon"), -180, 180);
  const vals = {
    type: oneOf(fd.get("type"), FLIGHT_TYPES, "standard"),
    location: text(fd.get("location"), 300),
    // koordinater sparas bara som par
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    max_alt_m: optNumber(fd.get("max_alt_m"), 0, 10_000),
    notes: text(fd.get("notes"), 10_000),
  };

  if (existing) {
    db.prepare(
      "UPDATE flights SET drone_id=?, briefing_id=?, type=?, started_at=?, duration_min=?, location=?, lat=?, lon=?, max_alt_m=?, notes=? WHERE id=? AND org_id=?"
    ).run(droneId, briefingId, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes, id, user.org_id);
    db.prepare("DELETE FROM flight_crew WHERE flight_id = ?").run(id);
  } else {
    db.prepare(
      `INSERT INTO flights (id, org_id, pilot_id, drone_id, briefing_id, type, started_at, duration_min, location, lat, lon, max_alt_m, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user.org_id, user.id, droneId, briefingId, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes);
  }

  const crew: CrewIn[] = [0, 1, 2, 3].map((i) => ({
    role: text(fd.get(`crew_role_${i}`), 100),
    userId: text(fd.get(`crew_user_${i}`), 64),
    name: text(fd.get(`crew_name_${i}`), 200),
  }));
  saveCrew(id, user.org_id, crew);
  revalidatePath("/logbook");
  redirect(`/logbook/${id}`);
}

export async function deleteFlight(id: string) {
  const user = await requireWriter();
  // Samma regel för borttagning som redigering: ägare eller admin (#7)
  db.prepare("DELETE FROM flights WHERE id = ? AND org_id = ? AND (pilot_id = ? OR ? = 'admin')").run(id, user.org_id, user.id, user.role);
  revalidatePath("/logbook");
  redirect("/logbook");
}

export type ImportState = { ok?: string; error?: string };

/** CSV: datum;minuter;plats;drönare;typ;anteckning  (komma eller semikolon) */
export async function importCsv(_: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireWriter();
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Välj en CSV-fil." };
  if (file.size > MAX_CSV_BYTES) return { error: "Filen är för stor (max 3 MB)." };
  // riktig CSV-tolkning: citerade fält får innehålla separator och radbrytning (#28)
  const rows = parseCsv(await file.text(), MAX_CSV_ROWS + 2);
  if (rows.length < 2) return { error: "Filen saknar rader." };
  if (rows.length > MAX_CSV_ROWS + 1) return { error: `Max ${MAX_CSV_ROWS} rader per import.` };
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const cDate = col("datum", "date", "start"), cDur = col("minut", "duration", "längd", "tid (min)"), cLoc = col("plats", "location");
  const cDrone = col("drönare", "drone", "aircraft"), cType = col("typ", "type"), cNotes = col("anteckning", "notes", "kommentar");
  if (cDate < 0 || cDur < 0) return { error: "Hittar inte kolumnerna för datum och minuter." };
  const drones = db.prepare("SELECT id, name FROM drones WHERE org_id = ?").all(user.org_id) as { id: string; name: string }[];
  const ins = db.prepare(
    "INSERT INTO flights (id, org_id, pilot_id, drone_id, type, started_at, duration_min, location, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv')"
  );
  let n = 0;
  db.transaction(() => {
    for (const c of rows.slice(1)) {
      const raw = c[cDate];
      if (!raw) continue;
      const when = /T|\d{2}:\d{2}/.test(raw) ? parseLocalStockholm(raw.replace(" ", "T").slice(0, 16)) : parseLocalStockholm(`${raw}T12:00`);
      if (isNaN(when.getTime())) continue;
      const dn = cDrone >= 0 ? c[cDrone]?.toLowerCase() : "";
      const drone = dn ? drones.find((d) => d.name.toLowerCase() === dn) : undefined;
      const tRaw = (cType >= 0 ? c[cType] : "").toLowerCase();
      const type = tRaw.startsWith("sim") ? "simulator" : tRaw.startsWith("ut") || tRaw.startsWith("instr") ? "instruction" : "standard";
      ins.run(
        newId(), user.org_id, user.id, drone?.id ?? null, type, when.toISOString(),
        optNumber(c[cDur], 0, 24 * 60) ?? 0, unescapeCell(text(cLoc >= 0 ? c[cLoc] : "", 300)), unescapeCell(text(cNotes >= 0 ? c[cNotes] : "", 10_000))
      );
      n++;
    }
  })();
  revalidatePath("/logbook");
  return { ok: `${n} flygningar importerade.` };
}

export type TrackPoint = { t: number; lat: number; lon: number; alt: number | null; bat: number | null };

const MAX_CSV_BYTES = 3_000_000;
const MAX_CSV_ROWS = 20_000;
const MAX_TRACK_POINTS = 50_000;
// exporten skyddar fält som börjar med = + - @ med ett apostroftecken – ta bort det vid återimport
const unescapeCell = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function importTrack(payload: { points: TrackPoint[]; droneId: string | null; fileName: string; startedAt: string | null }) {
  const user = await requireWriter();
  // payloaden kommer från klienten: kontrollera form och storlek (#28)
  if (!payload || !Array.isArray(payload.points)) return { error: "Ogiltig logg." };
  if (payload.points.length > MAX_TRACK_POINTS) return { error: `Loggen har för många punkter (max ${MAX_TRACK_POINTS}).` };
  const startedRaw = typeof payload.startedAt === "string" ? new Date(payload.startedAt).getTime() : NaN;
  // relativa tider (ms från start) görs absoluta; orimliga tidsstämplar tas bort (#37)
  const timed = normalizeTrackTimes(payload.points.filter((p) => p && typeof p.t === "number"), startedRaw);
  const pts = timed
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0))
    .map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, alt: numOrNull(p.alt), bat: numOrNull(p.bat) }));
  if (pts.length < 2) return { error: "Hittade inga giltiga GPS-punkter i loggen." };
  // punkterna ska komma i tidsordning för att varaktighet och spår ska bli rätt
  pts.sort((a, b) => a.t - b.t);

  let validDrone = typeof payload.droneId === "string" ? payload.droneId : null;
  if (validDrone) {
    const vd = db.prepare("SELECT id FROM drones WHERE id = ? AND org_id = ?").get(validDrone, user.org_id);
    if (!vd) validDrone = null;
  }

  const durationMin = (pts[pts.length - 1].t - pts[0].t) / 60000;
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const R = 6371e3, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    dist += 2 * R * Math.asin(Math.sqrt(h));
  }
  const alts = pts.map((p) => p.alt).filter((a): a is number => a !== null);
  const bats = pts.map((p) => p.bat).filter((a): a is number => a !== null);
  // gallra spåret till max ~1500 punkter
  const step = Math.max(1, Math.ceil(pts.length / 1500));
  const track = pts.filter((_, i) => i % step === 0);
  const started = new Date(validTrackTime(startedRaw) ? startedRaw : pts[0].t);
  const id = newId();
  // platsnamnet är bara en bekvämlighet – vänta inte på en full Nominatim-kö (#35)
  const place = await within(reverseGeocode(pts[0].lat, pts[0].lon), 4000, "Platsnamn dröjer").catch(() => "");
  db.prepare(
    `INSERT INTO flights (id, org_id, pilot_id, drone_id, type, started_at, duration_min, location, lat, lon, max_alt_m, distance_m, battery_start, battery_end, track, source, notes)
     VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'log', ?)`
  ).run(
    id, user.org_id, user.id, validDrone, started.toISOString(), Math.min(24 * 60, Math.max(0, Math.round(durationMin * 10) / 10)), place,
    pts[0].lat, pts[0].lon, alts.length ? Math.max(...alts) : null, Math.round(dist),
    bats.length ? bats[0] : null, bats.length ? bats[bats.length - 1] : null, JSON.stringify(track), `Importerad från ${text(payload.fileName, 200)}`
  );
  revalidatePath("/logbook");
  return { id };
}
