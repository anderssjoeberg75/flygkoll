import "server-only";
import { db } from "./db";

export type Drone = {
  id: string; org_id: string; name: string; model: string; serial: string; mtom_g: number; class_mark: string;
  char_dim_m: number; notes: string; archived: number; created_at: string;
};
export type Schedule = {
  id: string; drone_id: string; name: string; interval_days: number | null; interval_hours: number | null;
  last_done_at: string | null; last_done_hours: number; active: number;
};

export function droneHours(droneId: string): number {
  const r = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM flights WHERE drone_id = ? AND type != 'simulator'").get(droneId) as { m: number };
  return r.m / 60;
}

export function listDrones(orgId: string, includeArchived = false): Drone[] {
  return db.prepare(`SELECT * FROM drones WHERE org_id = ? ${includeArchived ? "" : "AND archived = 0"} ORDER BY name`).all(orgId) as Drone[];
}

export function getDrone(orgId: string, id: string | null | undefined): Drone | null {
  if (!id) return null;
  return (db.prepare("SELECT * FROM drones WHERE org_id = ? AND id = ?").get(orgId, id) as Drone) ?? null;
}

/** Drönar-id om drönaren tillhör organisationen, annars null (skyddar mot id:n från andra organisationer). */
export function orgDroneId(orgId: string, id: string | null | undefined): string | null {
  return getDrone(orgId, id)?.id ?? null;
}

export function scheduleStatus(s: Schedule, hoursNow: number, now = new Date()) {
  const since = s.last_done_at ? new Date(s.last_done_at) : null;
  let daysLeft: number | null = null;
  let hoursLeft: number | null = null;
  if (s.interval_days) {
    const base = since ?? now;
    daysLeft = s.interval_days - (now.getTime() - base.getTime()) / 864e5;
  }
  if (s.interval_hours) hoursLeft = s.interval_hours - (hoursNow - s.last_done_hours);
  const overdue = (daysLeft !== null && daysLeft < 0) || (hoursLeft !== null && hoursLeft < 0);
  const soon = !overdue && ((daysLeft !== null && daysLeft < 14) || (hoursLeft !== null && hoursLeft < 2));
  return { daysLeft, hoursLeft, overdue, soon };
}

export function dueMaintenance(orgId: string) {
  const drones = listDrones(orgId);
  if (drones.length === 0) return [];
  const byId = new Map(drones.map((d) => [d.id, d]));
  // flygtimmar per drönare och aktiva scheman i två frågor i stället för två per drönare
  const hours = new Map(
    (
      db
        .prepare(
          `SELECT f.drone_id AS id, COALESCE(SUM(f.duration_min), 0) / 60.0 AS h
           FROM flights f JOIN drones d ON d.id = f.drone_id
           WHERE d.org_id = ? AND d.archived = 0 AND f.type != 'simulator' GROUP BY f.drone_id`
        )
        .all(orgId) as { id: string; h: number }[]
    ).map((r) => [r.id, r.h])
  );
  const schedules = db
    .prepare(
      `SELECT s.* FROM maint_schedules s JOIN drones d ON d.id = s.drone_id
       WHERE d.org_id = ? AND d.archived = 0 AND s.active = 1`
    )
    .all(orgId) as Schedule[];
  const out: { drone: Drone; schedule: Schedule; status: ReturnType<typeof scheduleStatus> }[] = [];
  for (const s of schedules) {
    const drone = byId.get(s.drone_id);
    if (!drone) continue;
    const st = scheduleStatus(s, hours.get(s.drone_id) ?? 0);
    if (st.overdue || st.soon) out.push({ drone, schedule: s, status: st });
  }
  return out;
}
