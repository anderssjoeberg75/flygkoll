import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const DB_PATH = process.env.FLYGKOLL_DB || path.join(process.cwd(), "data", "flygkoll.db");

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  wind_yellow REAL NOT NULL DEFAULT 8,
  wind_red REAL NOT NULL DEFAULT 12,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'pilot', -- admin | pilot | viewer
  photo TEXT,
  default_drone_id TEXT,
  theme TEXT NOT NULL DEFAULT 'system',
  license_number TEXT,
  license_expiry TEXT,
  license_classes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drones (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  serial TEXT NOT NULL DEFAULT '',
  mtom_g INTEGER NOT NULL DEFAULT 0,
  class_mark TEXT NOT NULL DEFAULT 'none', -- none|C0|C1|C2|C3|C4|C5|C6
  char_dim_m REAL NOT NULL DEFAULT 0.35,
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  radius_m INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  radius_m INTEGER NOT NULL,
  flight_time TEXT NOT NULL,
  duration_h REAL NOT NULL DEFAULT 3,
  drone_id TEXT,
  status TEXT NOT NULL DEFAULT 'OK',
  shared INTEGER NOT NULL DEFAULT 1,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  pilot_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drone_id TEXT REFERENCES drones(id) ON DELETE SET NULL,
  briefing_id TEXT,
  type TEXT NOT NULL DEFAULT 'standard', -- standard|instruction|simulator
  started_at TEXT NOT NULL,
  duration_min REAL NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  lat REAL,
  lon REAL,
  max_alt_m REAL,
  distance_m REAL,
  battery_start INTEGER,
  battery_end INTEGER,
  track TEXT, -- JSON [{t,lat,lon,alt,bat}]
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flight_crew (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_types (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS maint_schedules (
  id TEXT PRIMARY KEY,
  drone_id TEXT NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  interval_days INTEGER,
  interval_hours REAL,
  last_done_at TEXT,
  last_done_hours REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS maint_logs (
  id TEXT PRIMARY KEY,
  drone_id TEXT NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
  schedule_id TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  work_type TEXT NOT NULL,
  done_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'preflight', -- preflight|postflight|daily|custom
  drone_id TEXT REFERENCES drones(id) ON DELETE CASCADE,
  items TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drone_id TEXT,
  checked TEXT NOT NULL,
  completed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

declare global {
  var __flygkollDb: Database.Database | undefined;
}

/**
 * Versionerade migreringar. SCHEMA ovan är version 0 (ursprungligt schema) och ändras aldrig;
 * alla ändringar läggs till här och körs i ordning. PRAGMA user_version håller reda på nivån.
 */
export const MIGRATIONS: string[] = [
  // 1: index för vanliga frågor
  `
  CREATE INDEX IF NOT EXISTS idx_flights_org_started ON flights(org_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_flights_pilot ON flights(pilot_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_flights_drone ON flights(drone_id);
  CREATE INDEX IF NOT EXISTS idx_flight_crew_flight ON flight_crew(flight_id);
  CREATE INDEX IF NOT EXISTS idx_briefings_org_created ON briefings(org_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_briefings_user ON briefings(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
  CREATE INDEX IF NOT EXISTS idx_drones_org ON drones(org_id);
  CREATE INDEX IF NOT EXISTS idx_maint_schedules_drone ON maint_schedules(drone_id);
  CREATE INDEX IF NOT EXISTS idx_maint_logs_drone ON maint_logs(drone_id, done_at);
  CREATE INDEX IF NOT EXISTS idx_checklists_org ON checklists(org_id);
  CREATE INDEX IF NOT EXISTS idx_checklist_runs_checklist ON checklist_runs(checklist_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_zones_org ON zones(org_id);
  CREATE INDEX IF NOT EXISTS idx_work_types_org ON work_types(org_id);
  `,
  // 2: inaktivering av användare, tvingat lösenordsbyte och skydd mot att loggbok raderas
  `
  ALTER TABLE users ADD COLUMN disabled_at TEXT;
  ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
  CREATE TRIGGER IF NOT EXISTS users_no_delete_with_history
  BEFORE DELETE ON users
  WHEN EXISTS (SELECT 1 FROM flights WHERE pilot_id = OLD.id)
    OR EXISTS (SELECT 1 FROM briefings WHERE user_id = OLD.id)
    OR EXISTS (SELECT 1 FROM checklist_runs WHERE user_id = OLD.id)
  BEGIN
    SELECT RAISE(ABORT, 'Användaren har loggade flygningar, briefingar eller checklistor – inaktivera i stället för att radera.');
  END;
  `,
  // 3: koppla checklistgenomgångar till briefing och flygning
  `
  ALTER TABLE checklist_runs ADD COLUMN briefing_id TEXT;
  ALTER TABLE checklist_runs ADD COLUMN flight_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_checklist_runs_briefing ON checklist_runs(briefing_id);
  CREATE INDEX IF NOT EXISTS idx_checklist_runs_flight ON checklist_runs(flight_id);
  `,
];

export function migrate(db: Database.Database) {
  db.exec(SCHEMA);
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  migrate(db);
  return db;
}

export const db: Database.Database = globalThis.__flygkollDb ?? (globalThis.__flygkollDb = open());

export const newId = () => crypto.randomBytes(9).toString("base64url");

export const DEFAULT_CHECKLISTS: { name: string; kind: string; items: string[] }[] = [
  {
    name: "Före flygning",
    kind: "preflight",
    items: [
      "Briefing skapad för plats och tid",
      "Luftrum, NOTAM och UAS-zoner kontrollerade",
      "Väder och vind inom drönarens gränser",
      "Operatörs-ID synligt på drönaren och laddat i Remote ID",
      "Batterier fulladdade och utan skador",
      "Propellrar hela och ordentligt fastsatta",
      "Kompass/IMU kalibrerad vid behov",
      "Return-to-home-höjd satt över hinder",
      "Start- och landningsplats fri från människor",
      "Minnekort isatt och kamera fungerar",
    ],
  },
  {
    name: "Efter flygning",
    kind: "postflight",
    items: [
      "Drönaren avstängd innan batteri tas ur",
      "Kontroll av propellrar och motorer",
      "Batterier till förvaring (laddning ~50–60 % vid lång förvaring)",
      "Flygningen loggad i loggboken",
      "Eventuella händelser/avvikelser rapporterade",
    ],
  },
  {
    name: "Daglig kontroll",
    kind: "daily",
    items: [
      "Firmware uppdaterad på drönare och kontroll",
      "Fjärrkontroll laddad",
      "Visuell inspektion av ram och landningsställ",
      "Serviceintervall kontrollerade i flottan",
    ],
  },
];

export function seedOrg(orgId: string) {
  const insert = db.prepare("INSERT INTO checklists (id, org_id, name, kind, items) VALUES (?, ?, ?, ?, ?)");
  for (const c of DEFAULT_CHECKLISTS) insert.run(newId(), orgId, c.name, c.kind, JSON.stringify(c.items));
  const wt = db.prepare("INSERT INTO work_types (id, org_id, name) VALUES (?, ?, ?)");
  for (const n of ["Batteribyte", "Propellerbyte", "Firmwareuppdatering", "Kalibrering", "Allmän service"]) wt.run(newId(), orgId, n);
}
