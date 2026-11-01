"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWriter } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { buildBriefing } from "@/lib/briefing";
import { getDrone } from "@/lib/fleet";
import { parseLocalStockholm } from "@/lib/format";

export type CreateState = { error?: string };

async function generate(params: { lat: number; lon: number; radius: number; when: Date; durationH: number; droneId: string | null; name?: string }) {
  const user = await requireWriter();
  const drone = getDrone(user.org_id, params.droneId);
  const result = await buildBriefing({
    lat: params.lat,
    lon: params.lon,
    radius_m: params.radius,
    flightTime: params.when,
    durationH: params.durationH,
    drone: drone ? { id: drone.id, name: drone.name, model: drone.model, mtom_g: drone.mtom_g, class_mark: drone.class_mark, char_dim_m: drone.char_dim_m } : null,
    windYellow: user.wind_yellow,
    windRed: user.wind_red,
  });
  const id = newId();
  db.prepare(
    `INSERT INTO briefings (id, org_id, user_id, name, lat, lon, radius_m, flight_time, duration_h, drone_id, status, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, user.org_id, user.id, params.name || result.place, params.lat, params.lon, params.radius, params.when.toISOString(), params.durationH, drone?.id ?? null, result.status, JSON.stringify(result));
  return id;
}

import { isInSweden } from "@/lib/boundary";

export async function createBriefing(_: CreateState, fd: FormData): Promise<CreateState> {
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  const radius = Math.round(Number(fd.get("radius")) || 500);
  const whenStr = String(fd.get("when") || "");
  const durationH = Math.min(12, Math.max(0.5, Number(fd.get("duration")) || 3));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !fd.get("lat")) return { error: "Välj en plats på kartan." };
  if (!isInSweden(lat, lon)) return { error: "Platsen ligger utanför Sverige – datakällorna täcker svenskt luftrum." };
  if (!whenStr) return { error: "Ange datum och tid." };
  const when = parseLocalStockholm(whenStr);
  if (isNaN(when.getTime())) return { error: "Ogiltigt datum eller tid." };
  const id = await generate({ lat, lon, radius, when, durationH, droneId: String(fd.get("drone") || "") || null, name: String(fd.get("name") || "").trim() || undefined });
  redirect(`/briefings/${id}`);
}

export async function rerunBriefing(id: string, keepTime: boolean) {
  const user = await requireWriter();
  const b = db.prepare("SELECT * FROM briefings WHERE id = ? AND org_id = ?").get(id, user.org_id) as
    | { lat: number; lon: number; radius_m: number; flight_time: string; duration_h: number; drone_id: string | null; name: string }
    | undefined;
  if (!b) redirect("/briefings");
  const when = keepTime && new Date(b.flight_time) > new Date() ? new Date(b.flight_time) : new Date(Math.ceil(Date.now() / 9e5) * 9e5);
  const nid = await generate({ lat: b.lat, lon: b.lon, radius: b.radius_m, when, durationH: b.duration_h, droneId: b.drone_id, name: b.name });
  redirect(`/briefings/${nid}`);
}

export async function deleteBriefing(id: string) {
  const user = await requireWriter();
  db.prepare("DELETE FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR ? = 'admin')").run(id, user.org_id, user.id, user.role);
  revalidatePath("/briefings");
}

export async function renameBriefing(id: string, fd: FormData) {
  const user = await requireWriter();
  const name = String(fd.get("name") || "").trim();
  if (name) db.prepare("UPDATE briefings SET name = ? WHERE id = ? AND org_id = ?").run(name, id, user.org_id);
  revalidatePath(`/briefings/${id}`);
}

export async function toggleShare(id: string) {
  const user = await requireWriter();
  db.prepare("UPDATE briefings SET shared = 1 - shared WHERE id = ? AND org_id = ? AND user_id = ?").run(id, user.org_id, user.id);
  revalidatePath(`/briefings/${id}`);
}
