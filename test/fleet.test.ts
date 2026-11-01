import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { dueMaintenance, orgDroneId, scheduleStatus, type Schedule } from "@/lib/fleet";

const sched = (over: Partial<Schedule>): Schedule => ({
  id: "s", drone_id: "d", name: "Service", interval_days: null, interval_hours: null, last_done_at: null, last_done_hours: 0, active: 1, ...over,
});

describe("scheduleStatus", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  it("räknar dagar", () => {
    expect(scheduleStatus(sched({ interval_days: 30, last_done_at: "2026-10-01T12:00:00Z" }), 0, now)).toMatchObject({ overdue: true });
    expect(scheduleStatus(sched({ interval_days: 40, last_done_at: "2026-10-01T12:00:00Z" }), 0, now)).toMatchObject({ overdue: false, soon: true });
    expect(scheduleStatus(sched({ interval_days: 90, last_done_at: "2026-10-01T12:00:00Z" }), 0, now)).toMatchObject({ overdue: false, soon: false });
  });
  it("räknar flygtimmar", () => {
    expect(scheduleStatus(sched({ interval_hours: 10, last_done_hours: 5 }), 16, now).overdue).toBe(true);
    expect(scheduleStatus(sched({ interval_hours: 10, last_done_hours: 5 }), 14, now).soon).toBe(true);
  });
});

describe("dueMaintenance och orgDroneId (databas i minnet)", () => {
  beforeAll(() => {
    db.exec(`
      INSERT INTO orgs (id, name) VALUES ('o1', 'A'), ('o2', 'B');
      INSERT INTO users (id, org_id, email, password_hash) VALUES ('u', 'o1', 'u@x.se', 'x');
      INSERT INTO drones (id, org_id, name) VALUES ('d1', 'o1', 'Ett'), ('d2', 'o1', 'Två'), ('dx', 'o2', 'Annan');
      INSERT INTO flights (id, org_id, pilot_id, drone_id, started_at, duration_min, type) VALUES
        ('f1', 'o1', 'u', 'd1', '2026-10-01T10:00:00Z', 600, 'standard'),
        ('f2', 'o1', 'u', 'd1', '2026-10-02T10:00:00Z', 600, 'simulator');
      INSERT INTO maint_schedules (id, drone_id, name, interval_hours, last_done_hours) VALUES ('s1', 'd1', 'Propellrar', 8, 0);
      INSERT INTO maint_schedules (id, drone_id, name, interval_hours, last_done_hours) VALUES ('s2', 'd2', 'Motorer', 100, 0);
      INSERT INTO maint_schedules (id, drone_id, name, interval_hours, last_done_hours) VALUES ('s3', 'dx', 'Annan org', 1, 0);
    `);
  });

  it("hittar förfallet underhåll baserat på flygtid utan simulator", () => {
    const due = dueMaintenance("o1");
    expect(due.map((d) => d.schedule.id)).toEqual(["s1"]);
    expect(due[0].status.hoursLeft).toBeCloseTo(-2);
  });

  it("godtar bara drönare i den egna organisationen", () => {
    expect(orgDroneId("o1", "d1")).toBe("d1");
    expect(orgDroneId("o1", "dx")).toBeNull();
    expect(orgDroneId("o1", "")).toBeNull();
  });
});
