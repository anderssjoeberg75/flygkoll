import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, SCHEMA, migrate } from "@/lib/db";

function fresh() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("migreringar", () => {
  it("når senaste versionen och kan köras igen utan fel", () => {
    const db = fresh();
    expect(db.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    expect(() => migrate(db)).not.toThrow();
    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["disabled_at", "must_change_password"]));
  });

  it("uppgraderar en databas med det gamla schemat utan att tappa data", () => {
    const legacy = new Database(":memory:");
    legacy.exec(SCHEMA); // version 0, som en befintlig installation
    legacy.exec(`
      INSERT INTO orgs (id, name) VALUES ('o', 'Org');
      INSERT INTO users (id, org_id, email, password_hash) VALUES ('u', 'o', 'a@b.se', 'x');
    `);
    expect(legacy.pragma("user_version", { simple: true })).toBe(0);
    migrate(legacy);
    expect(legacy.pragma("user_version", { simple: true })).toBe(MIGRATIONS.length);
    expect(legacy.prepare("SELECT email, disabled_at, must_change_password FROM users").get()).toEqual({ email: "a@b.se", disabled_at: null, must_change_password: 0 });
  });

  it("hindrar att en användare med loggade flygningar raderas", () => {
    const db = fresh();
    db.exec(`
      INSERT INTO orgs (id, name) VALUES ('o', 'Org');
      INSERT INTO users (id, org_id, email, password_hash) VALUES ('u1', 'o', 'a@b.se', 'x'), ('u2', 'o', 'c@d.se', 'x');
      INSERT INTO flights (id, org_id, pilot_id, started_at) VALUES ('f', 'o', 'u1', '2026-01-01T00:00:00Z');
    `);
    expect(() => db.prepare("DELETE FROM users WHERE id = 'u1'").run()).toThrow(/inaktivera/);
    expect(db.prepare("SELECT COUNT(*) n FROM flights").get()).toEqual({ n: 1 });
    // användare utan historik går fortfarande att ta bort
    expect(db.prepare("DELETE FROM users WHERE id = 'u2'").run().changes).toBe(1);
  });
});
