import "server-only";
import { db } from "./db";

/**
 * Räknare för misslyckade försök per nyckel inom ett tidsfönster, lagrade i SQLite så att de
 * överlever omstarter och delas mellan processer.
 */
export type Limit = { key: string; max: number; windowMs: number };

let lastPurge = 0;
function purge(now: number) {
  if (now - lastPurge < 10 * 60e3) return;
  lastPurge = now;
  // fönster är som längst ett dygn
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - 24 * 3600e3);
}

function current(l: Limit, now: number) {
  const row = db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(l.key) as { count: number; window_start: number } | undefined;
  if (!row || now - row.window_start >= l.windowMs) return { count: 0, windowStart: now };
  return { count: row.count, windowStart: row.window_start };
}

/** Om någon av gränserna är nådd: millisekunder kvar tills den släpper, annars 0. */
export function blockedFor(limits: Limit[], now = Date.now()): number {
  purge(now);
  let wait = 0;
  for (const l of limits) {
    const c = current(l, now);
    if (c.count >= l.max) wait = Math.max(wait, c.windowStart + l.windowMs - now);
  }
  return wait;
}

/** Räknar ett försök mot varje gräns. */
export function hit(limits: Limit[], now = Date.now()) {
  const up = db.prepare(
    `INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`
  );
  db.transaction(() => {
    for (const l of limits) up.run(l.key, now, now, l.windowMs, now, l.windowMs, now);
  })();
}

export function reset(keys: string[]) {
  const del = db.prepare("DELETE FROM rate_limits WHERE key = ?");
  for (const k of keys) del.run(k);
}
