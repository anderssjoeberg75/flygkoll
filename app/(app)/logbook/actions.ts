"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriter, displayName } from "@/lib/auth";
import { orgDroneId } from "@/lib/fleet";
import { FLIGHT_TYPES, MAX_TRACK_POINTS, oneOf, optNumber } from "@/lib/validate";
import { db, newId } from "@/lib/db";
import { parseLocalStockholm } from "@/lib/format";
import { reverseGeocode } from "@/lib/sources";

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
  const requestedId = String(fd.get("id") || "");
  const existing = requestedId
    ? (db.prepare("SELECT id, pilot_id FROM flights WHERE id = ? AND org_id = ?").get(requestedId, user.org_id) as { id: string; pilot_id: string } | undefined)
    : undefined;
  // samma regel som för borttagning: bara piloten själv eller admin får ändra
  if (existing && existing.pilot_id !== user.id && user.role !== "admin") redirect(`/logbook/${existing.id}`);
  // okänt id → ny flygning med nytt id (aldrig ett id som klienten hittat på)
  const id = existing?.id ?? newId();
  const started = parseLocalStockholm(String(fd.get("started_at") || ""));
  if (isNaN(started.getTime())) redirect(existing ? `/logbook/${id}/edit` : "/logbook/new");
  const duration = optNumber(fd.get("duration_min"), 0, 24 * 60) ?? 0;
  const lat = optNumber(fd.get("lat"), -90, 90), lon = optNumber(fd.get("lon"), -180, 180);
  const briefingId = String(fd.get("briefing_id") || "");
  const vals = {
    drone_id: orgDroneId(user.org_id, String(fd.get("drone_id") || "")),
    type: oneOf(fd.get("type"), FLIGHT_TYPES, "standard"),
    location: String(fd.get("location") || "").slice(0, 300),
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    max_alt_m: optNumber(fd.get("max_alt_m"), 0, 10_000),
    notes: String(fd.get("notes") || "").slice(0, 10_000),
    briefing_id: briefingId && db.prepare("SELECT 1 FROM briefings WHERE id = ? AND org_id = ?").get(briefingId, user.org_id) ? briefingId : null,
  };
  db.transaction(() => {
    if (existing) {
      db.prepare(
        "UPDATE flights SET drone_id=?, type=?, started_at=?, duration_min=?, location=?, lat=?, lon=?, max_alt_m=?, notes=? WHERE id=? AND org_id=?"
      ).run(vals.drone_id, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes, id, user.org_id);
      db.prepare("DELETE FROM flight_crew WHERE flight_id = ?").run(id);
    } else {
      db.prepare(
        `INSERT INTO flights (id, org_id, pilot_id, drone_id, briefing_id, type, started_at, duration_min, location, lat, lon, max_alt_m, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, user.org_id, user.id, vals.drone_id, vals.briefing_id, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes);
      // koppla checklistor som gjorts för samma briefing till flygningen
      if (vals.briefing_id) linkBriefingRuns(vals.briefing_id, id, user.org_id);
    }
    const crew: CrewIn[] = [0, 1, 2, 3].map((i) => ({
      role: String(fd.get(`crew_role_${i}`) || "").slice(0, 100),
      userId: String(fd.get(`crew_user_${i}`) || ""),
      name: String(fd.get(`crew_name_${i}`) || "").slice(0, 200),
    }));
    saveCrew(id, user.org_id, crew);
  })();
  revalidatePath("/logbook");
  redirect(`/logbook/${id}`);
}

/** Kopplar checklistgenomgångar som gjorts för en briefing (och ännu inte hör till en flygning) till flygningen. */
function linkBriefingRuns(briefingId: string, flightId: string, orgId: string) {
  db.prepare(
    `UPDATE checklist_runs SET flight_id = ?
     WHERE briefing_id = ? AND flight_id IS NULL
       AND checklist_id IN (SELECT id FROM checklists WHERE org_id = ?)`
  ).run(flightId, briefingId, orgId);
}

export async function deleteFlight(id: string) {
  const user = await requireWriter();
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
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Filen saknar rader." };
  if (lines.length > 20_001) return { error: "Max 20 000 rader per import." };
  const sep = lines[0].includes(";") ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
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
    for (const line of lines.slice(1)) {
      const c = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
      const raw = c[cDate];
      if (!raw) continue;
      const when = /T|\d{2}:\d{2}/.test(raw) ? parseLocalStockholm(raw.replace(" ", "T").slice(0, 16)) : parseLocalStockholm(`${raw}T12:00`);
      if (isNaN(when.getTime())) continue;
      const dn = cDrone >= 0 ? c[cDrone]?.toLowerCase() : "";
      const drone = dn ? drones.find((d) => d.name.toLowerCase() === dn) : undefined;
      const tRaw = (cType >= 0 ? c[cType] : "").toLowerCase();
      const type = tRaw.startsWith("sim") ? "simulator" : tRaw.startsWith("ut") || tRaw.startsWith("instr") ? "instruction" : "standard";
      const minutes = Math.min(24 * 60, Math.max(0, Number((c[cDur] ?? "").replace(",", ".")) || 0));
      ins.run(newId(), user.org_id, user.id, drone?.id ?? null, type, when.toISOString(), minutes, (cLoc >= 0 ? c[cLoc] ?? "" : "").slice(0, 300), (cNotes >= 0 ? c[cNotes] ?? "" : "").slice(0, 10_000));
      n++;
    }
  })();
  revalidatePath("/logbook");
  return { ok: `${n} flygningar importerade.` };
}

export type TrackPoint = { t: number; lat: number; lon: number; alt: number | null; bat: number | null };

const MAX_CSV_BYTES = 3_000_000;
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function importTrack(payload: { points: TrackPoint[]; droneId: string | null; fileName: string; startedAt: string | null }) {
  const user = await requireWriter();
  if (!Array.isArray(payload?.points) || payload.points.length > MAX_TRACK_POINTS) return { error: `Loggen har för många punkter (max ${MAX_TRACK_POINTS}).` };
  const pts = payload.points
    .filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0))
    .map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, alt: numOrNull(p.alt), bat: numOrNull(p.bat) }));
  if (pts.length < 2) return { error: "Hittade inga giltiga GPS-punkter i loggen." };
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
  const startedRaw = payload.startedAt ? new Date(payload.startedAt) : new Date(pts[0].t);
  const started = isNaN(startedRaw.getTime()) ? new Date() : startedRaw;
  const id = newId();
  const place = await reverseGeocode(pts[0].lat, pts[0].lon).catch(() => "");
  db.prepare(
    `INSERT INTO flights (id, org_id, pilot_id, drone_id, type, started_at, duration_min, location, lat, lon, max_alt_m, distance_m, battery_start, battery_end, track, source, notes)
     VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'log', ?)`
  ).run(
    id, user.org_id, user.id, orgDroneId(user.org_id, payload.droneId), started.toISOString(), Math.round(durationMin * 10) / 10, place,
    pts[0].lat, pts[0].lon, alts.length ? Math.max(...alts) : null, Math.round(dist),
    bats.length ? bats[0] : null, bats.length ? bats[bats.length - 1] : null, JSON.stringify(track), `Importerad från ${String(payload.fileName).slice(0, 200)}`
  );
  revalidatePath("/logbook");
  return { id };
}
