import "server-only";
import crypto from "node:crypto";
import util from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "flygkoll_session";
const SESSION_DAYS = 30;

const scryptAsync = util.promisify(crypto.scrypt);

export type User = {
  id: string;
  org_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "pilot" | "viewer";
  photo: string | null;
  default_drone_id: string | null;
  theme: string;
  license_number: string | null;
  license_expiry: string | null;
  license_classes: string;
  org_name: string;
  wind_yellow: number;
  wind_red: number;
  logo_url: string | null;
  must_change_password?: number;
  disabled_at?: string | null;
};

/* ---------- Rate limiting på inloggning (#6) ---------- */
type RateLimitEntry = { count: number; firstAttempt: number };
const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minuter

export function checkLoginRateLimit(key: string): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    return { allowed: true, remaining: MAX_ATTEMPTS, resetMs: WINDOW_MS };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetMs: WINDOW_MS - (now - entry.firstAttempt) };
  }
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, resetMs: WINDOW_MS - (now - entry.firstAttempt) };
}

export function recordLoginAttempt(key: string, success: boolean) {
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    entry.count += 1;
  }
}

/* ---------- Asynkron Scrypt (#6) ---------- */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const hash = (await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

/* ---------- Sessioner (#5, #8) ---------- */
export async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

let lastCleanup = 0;
export function cleanupExpiredSessions() {
  const now = Date.now();
  if (now - lastCleanup > 3600e3) {
    lastCleanup = now;
    try {
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
    } catch {
      /* ignorera fel vid cleanup */
    }
  }
}

export async function createSession(userId: string) {
  cleanupExpiredSessions();
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.FLYGKOLL_INSECURE_COOKIE !== "1",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  cleanupExpiredSessions();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.org_id, u.email, u.first_name, u.last_name, u.role,
              (CASE WHEN u.photo IS NOT NULL AND u.photo != '' THEN ('/api/avatar/' || u.id) ELSE NULL END) AS photo,
              u.default_drone_id, u.theme, u.license_number, u.license_expiry, u.license_classes,
              u.must_change_password, u.disabled_at,
              o.name AS org_name, o.wind_yellow, o.wind_red,
              (CASE WHEN o.logo_url LIKE 'data:%' THEN ('/api/org/logo/' || o.id) ELSE o.logo_url END) AS logo_url
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN orgs o ON o.id = u.org_id
       WHERE s.token = ? AND s.expires_at > ? AND (u.disabled_at IS NULL OR u.disabled_at = '')`
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

/* ---------- Behörigheter (#4, #20) ---------- */
export async function requireUser(allowMustChange = false): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.must_change_password === 1 && !allowMustChange) {
    redirect("/settings?must_change=1");
  }
  return u;
}

/** Tillåter endast admin och pilot. Läsare (viewer) omdirigeras (#4). */
export async function requireWriter(): Promise<User> {
  const u = await requireUser();
  if (u.role === "viewer") {
    redirect("/");
  }
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export const displayName = (u: { first_name: string; last_name: string; email: string }) =>
  `${u.first_name} ${u.last_name}`.trim() || u.email;
