"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWriter } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { droneHours, getDrone } from "@/lib/fleet";
import { parseLocalStockholm } from "@/lib/format";
import { CLASS_MARKS, oneOf, optNumber, text } from "@/lib/validate";

function droneVals(fd: FormData) {
  return {
    name: text(fd.get("name"), 200) || "Namnlös drönare",
    model: text(fd.get("model"), 200),
    serial: text(fd.get("serial"), 200),
    mtom_g: Math.round(optNumber(fd.get("mtom_g"), 0, 1_000_000) ?? 0),
    class_mark: oneOf(fd.get("class_mark"), CLASS_MARKS, "none"),
    char_dim_m: optNumber(fd.get("char_dim_m"), 0.01, 50) ?? 0.35,
    notes: text(fd.get("notes"), 10_000),
  };
}

export async function addDrone(fd: FormData) {
  const user = await requireWriter();
  const v = droneVals(fd);
  const id = newId();
  db.prepare("INSERT INTO drones (id, org_id, name, model, serial, mtom_g, class_mark, char_dim_m, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id, user.org_id, v.name, v.model, v.serial, v.mtom_g, v.class_mark, v.char_dim_m, v.notes
  );
  if (!user.default_drone_id) db.prepare("UPDATE users SET default_drone_id = ? WHERE id = ?").run(id, user.id);
  redirect(`/fleet/${id}`);
}

export async function updateDrone(id: string, fd: FormData) {
  const user = await requireWriter();
  const v = droneVals(fd);
  db.prepare("UPDATE drones SET name=?, model=?, serial=?, mtom_g=?, class_mark=?, char_dim_m=?, notes=? WHERE id=? AND org_id=?").run(
    v.name, v.model, v.serial, v.mtom_g, v.class_mark, v.char_dim_m, v.notes, id, user.org_id
  );
  revalidatePath(`/fleet/${id}`);
}

export async function archiveDrone(id: string) {
  const user = await requireWriter();
  db.prepare("UPDATE drones SET archived = 1 - archived WHERE id = ? AND org_id = ?").run(id, user.org_id);
  revalidatePath("/fleet");
  redirect("/fleet");
}

export async function addSchedule(droneId: string, fd: FormData) {
  const user = await requireWriter();
  if (!getDrone(user.org_id, droneId)) return;
  const days = Number(fd.get("interval_days")) || null;
  const hours = Number(fd.get("interval_hours")) || null;
  if (!days && !hours) return;
  db.prepare("INSERT INTO maint_schedules (id, drone_id, name, interval_days, interval_hours, last_done_at, last_done_hours) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(), droneId, String(fd.get("name") || "Service"), days, hours, new Date().toISOString(), droneHours(droneId)
  );
  revalidatePath(`/fleet/${droneId}`);
}

export async function removeSchedule(droneId: string, scheduleId: string) {
  const user = await requireWriter();
  if (!getDrone(user.org_id, droneId)) return;
  // schemat tas bort men utfört arbete finns kvar i historiken
  db.prepare("DELETE FROM maint_schedules WHERE id = ? AND drone_id = ?").run(scheduleId, droneId);
  revalidatePath(`/fleet/${droneId}`);
}

export async function logMaintenance(droneId: string, fd: FormData) {
  const user = await requireWriter();
  if (!getDrone(user.org_id, droneId)) return;
  const scheduleId = String(fd.get("schedule_id") || "") || null;
  const wt = String(fd.get("work_type_free") || "").trim() || String(fd.get("work_type") || "").trim() || "Service";
  const rawDone = fd.get("done_at") ? String(fd.get("done_at")) : "";
  const parsedDone = rawDone ? parseLocalStockholm(rawDone.includes("T") ? rawDone : `${rawDone}T12:00`) : new Date();
  const done = isNaN(parsedDone.getTime()) ? new Date() : parsedDone;
  db.prepare("INSERT INTO maint_logs (id, drone_id, schedule_id, user_id, work_type, done_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    newId(), droneId, scheduleId, user.id, wt, done.toISOString(), String(fd.get("notes") || "")
  );
  if (scheduleId) {
    db.prepare("UPDATE maint_schedules SET last_done_at = ?, last_done_hours = ? WHERE id = ? AND drone_id = ?").run(done.toISOString(), droneHours(droneId), scheduleId, droneId);
  }
  revalidatePath(`/fleet/${droneId}`);
}

export async function addWorkType(fd: FormData) {
  const user = await requireWriter();
  const name = String(fd.get("name") || "").trim();
  if (name) db.prepare("INSERT INTO work_types (id, org_id, name) VALUES (?, ?, ?)").run(newId(), user.org_id, name);
  revalidatePath("/fleet");
}

export async function removeWorkType(id: string) {
  const user = await requireWriter();
  db.prepare("DELETE FROM work_types WHERE id = ? AND org_id = ?").run(id, user.org_id);
  revalidatePath("/fleet");
}
