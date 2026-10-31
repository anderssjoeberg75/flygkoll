"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, displayName } from "@/lib/auth";
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
  const user = await requireUser();
  const id = String(fd.get("id") || "") || newId();
  const existing = db.prepare("SELECT id FROM flights WHERE id = ? AND org_id = ?").get(id, user.org_id);
  const started = parseLocalStockholm(String(fd.get("started_at")));
  const duration = Math.max(0, Number(fd.get("duration_min")) || 0);
  const droneId = String(fd.get("drone_id") || "") || null;
  const vals = {
    type: String(fd.get("type") || "standard"),
    location: String(fd.get("location") || ""),
    lat: fd.get("lat") ? Number(fd.get("lat")) : null,
    lon: fd.get("lon") ? Number(fd.get("lon")) : null,
    max_alt_m: fd.get("max_alt_m") ? Number(fd.get("max_alt_m")) : null,
    notes: String(fd.get("notes") || ""),
    briefing_id: String(fd.get("briefing_id") || "") || null,
  };
  if (existing) {
    db.prepare(
      "UPDATE flights SET drone_id=?, type=?, started_at=?, duration_min=?, location=?, lat=?, lon=?, max_alt_m=?, notes=? WHERE id=? AND org_id=?"
    ).run(droneId, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes, id, user.org_id);
    db.prepare("DELETE FROM flight_crew WHERE flight_id = ?").run(id);
  } else {
    db.prepare(
      `INSERT INTO flights (id, org_id, pilot_id, drone_id, briefing_id, type, started_at, duration_min, location, lat, lon, max_alt_m, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user.org_id, user.id, droneId, vals.briefing_id, vals.type, started.toISOString(), duration, vals.location, vals.lat, vals.lon, vals.max_alt_m, vals.notes);
  }
  const crew: CrewIn[] = [0, 1, 2, 3].map((i) => ({
    role: String(fd.get(`crew_role_${i}`) || ""),
    userId: String(fd.get(`crew_user_${i}`) || ""),
    name: String(fd.get(`crew_name_${i}`) || ""),
  }));
  saveCrew(id, user.org_id, crew);
  revalidatePath("/logbook");
  redirect(`/logbook/${id}`);
}

export async function deleteFlight(id: string) {
  const user = await requireUser();
  db.prepare("DELETE FROM flights WHERE id = ? AND org_id = ? AND (pilot_id = ? OR ? = 'admin')").run(id, user.org_id, user.id, user.role);
  revalidatePath("/logbook");
  redirect("/logbook");
}

export type ImportState = { ok?: string; error?: string };

/** CSV: datum;minuter;plats;drönare;typ;anteckning  (komma eller semikolon) */
export async function importCsv(_: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Välj en CSV-fil." };
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Filen saknar rader." };
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
      ins.run(newId(), user.org_id, user.id, drone?.id ?? null, type, when.toISOString(), Number(c[cDur].replace(",", ".")) || 0, cLoc >= 0 ? c[cLoc] : "", cNotes >= 0 ? c[cNotes] : "");
      n++;
    }
  })();
  revalidatePath("/logbook");
  return { ok: `${n} flygningar importerade.` };
}

export type TrackPoint = { t: number; lat: number; lon: number; alt: number | null; bat: number | null };

export async function importTrack(payload: { points: TrackPoint[]; droneId: string | null; fileName: string; startedAt: string | null }) {
  const user = await requireUser();
  const pts = payload.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
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
  const started = payload.startedAt ? new Date(payload.startedAt) : new Date(pts[0].t);
  const id = newId();
  const place = await reverseGeocode(pts[0].lat, pts[0].lon).catch(() => "");
  db.prepare(
    `INSERT INTO flights (id, org_id, pilot_id, drone_id, type, started_at, duration_min, location, lat, lon, max_alt_m, distance_m, battery_start, battery_end, track, source, notes)
     VALUES (?, ?, ?, ?, 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'log', ?)`
  ).run(
    id, user.org_id, user.id, payload.droneId, started.toISOString(), Math.round(durationMin * 10) / 10, place,
    pts[0].lat, pts[0].lon, alts.length ? Math.max(...alts) : null, Math.round(dist),
    bats.length ? bats[0] : null, bats.length ? bats[bats.length - 1] : null, JSON.stringify(track), `Importerad från ${payload.fileName}`
  );
  revalidatePath("/logbook");
  return { id };
}
