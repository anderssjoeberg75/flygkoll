"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWriter } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { buildBriefing } from "@/lib/briefing";
import { getDrone } from "@/lib/fleet";
import { parseLocalStockholm } from "@/lib/format";
import { getAccessibleBriefing } from "@/lib/access";
import { blockedFor, hit, type Limit } from "@/lib/ratelimit";
import { optNumber, text } from "@/lib/validate";
import { isInSweden } from "@/lib/boundary";

export type CreateState = { error?: string };

const RADIUS_MIN = 50;
const RADIUS_MAX = 10_000;

/** Varje briefing gör ett tjugotal anrop mot externa källor – begränsa per användare (#32). */
const briefingLimits = (userId: string): Limit[] => [
  { key: `briefing:${userId}`, max: 10, windowMs: 60e3 },
  { key: `briefing-hour:${userId}`, max: 120, windowMs: 3600e3 },
];

/** Väntetid i ms om användaren har skapat för många briefingar, annars 0 – och räknar försöket. */
function takeBriefingSlot(userId: string): number {
  const limits = briefingLimits(userId);
  const wait = blockedFor(limits);
  if (wait === 0) hit(limits);
  return wait;
}

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
  ).run(id, user.org_id, user.id, text(params.name || result.place, 200), params.lat, params.lon, params.radius, params.when.toISOString(), params.durationH, drone?.id ?? null, result.status, JSON.stringify(result));
  return id;
}

export async function createBriefing(_: CreateState, fd: FormData): Promise<CreateState> {
  const lat = Number(fd.get("lat"));
  const lon = Number(fd.get("lon"));
  const radiusIn = optNumber(fd.get("radius") || 500, RADIUS_MIN, RADIUS_MAX);
  const whenStr = String(fd.get("when") || "");
  const durationH = Math.min(12, Math.max(0.5, Number(fd.get("duration")) || 3));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !fd.get("lat")) return { error: "Välj en plats på kartan." };
  if (!isInSweden(lat, lon)) return { error: "Platsen ligger utanför Sverige – datakällorna täcker svenskt luftrum." };
  if (!whenStr) return { error: "Ange datum och tid." };
  const when = parseLocalStockholm(whenStr);
  if (isNaN(when.getTime())) return { error: "Ogiltigt datum eller tid." };
  if (radiusIn === null) return { error: `Radien måste vara mellan ${RADIUS_MIN} och ${RADIUS_MAX.toLocaleString("sv-SE")} m.` };
  const radius = Math.round(radiusIn);
  const user = await requireWriter();
  const wait = takeBriefingSlot(user.id);
  if (wait > 0) return { error: `Du har skapat många briefingar på kort tid. Försök igen om ${Math.ceil(wait / 1000)} sekunder.` };
  const id = await generate({ lat, lon, radius, when, durationH, droneId: String(fd.get("drone") || "") || null, name: text(fd.get("name"), 200) || undefined });
  redirect(`/briefings/${id}`);
}

export async function rerunBriefing(id: string, keepTime: boolean) {
  const user = await requireWriter();
  // privata briefingar (shared = 0) får bara ägaren köra om (#33)
  const b = getAccessibleBriefing<{ lat: number; lon: number; radius_m: number; flight_time: string; duration_h: number; drone_id: string | null; name: string }>(
    user, id, "lat, lon, radius_m, flight_time, duration_h, drone_id, name"
  );
  if (!b) redirect("/briefings");
  if (takeBriefingSlot(user.id) > 0) redirect(`/briefings/${id}?limit=1`);
  const when = keepTime && new Date(b.flight_time) > new Date() ? new Date(b.flight_time) : new Date(Math.ceil(Date.now() / 9e5) * 9e5);
  // äldre briefingar kan ha sparats innan radien begränsades
  const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, b.radius_m));
  const nid = await generate({ lat: b.lat, lon: b.lon, radius, when, durationH: b.duration_h, droneId: b.drone_id, name: b.name });
  redirect(`/briefings/${nid}`);
}

export async function deleteBriefing(id: string) {
  const user = await requireWriter();
  db.prepare("DELETE FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR ? = 'admin')").run(id, user.org_id, user.id, user.role);
  revalidatePath("/briefings");
}

export async function renameBriefing(id: string, fd: FormData) {
  const user = await requireWriter();
  const name = text(fd.get("name"), 200);
  if (name && getAccessibleBriefing(user, id)) db.prepare("UPDATE briefings SET name = ? WHERE id = ? AND org_id = ?").run(name, id, user.org_id);
  revalidatePath(`/briefings/${id}`);
}

export async function toggleShare(id: string) {
  const user = await requireWriter();
  db.prepare("UPDATE briefings SET shared = 1 - shared WHERE id = ? AND org_id = ? AND user_id = ?").run(id, user.org_id, user.id);
  revalidatePath(`/briefings/${id}`);
}
