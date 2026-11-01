import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "flygkoll_session";
const SESSION_DAYS = 30;
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const ROLES = ["admin", "pilot", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

export type User = {
  id: string;
  org_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  has_photo: number;
  default_drone_id: string | null;
  theme: string;
  license_number: string | null;
  license_expiry: string | null;
  license_classes: string;
  must_change_password: number;
  org_name: string;
  wind_yellow: number;
  wind_red: number;
  has_logo: number;
};

/** Hashar asynkront så att inloggningar inte blockerar Node:s event loop. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const hash = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

let lastCleanup = 0;
/** Tar bort utgångna sessioner, högst en gång i timmen. */
export function cleanupSessions(now = Date.now()) {
  if (now - lastCleanup < 3600e3) return;
  lastCleanup = now;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
}

export async function createSession(userId: string) {
  cleanupSessions();
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

export async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/** Loggar ut alla andra enheter men behåller den session som gör anropet. */
export async function revokeOtherSessions(userId: string) {
  const token = await currentSessionToken();
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, token ?? "");
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = await currentSessionToken();
  if (!token) return null;
  cleanupSessions();
  // bilder (base64) hämtas inte här – de serveras via /api/img/* vid behov
  const row = db
    .prepare(
      `SELECT u.id, u.org_id, u.email, u.first_name, u.last_name, u.role, u.default_drone_id, u.theme,
              u.license_number, u.license_expiry, u.license_classes, u.must_change_password,
              (u.photo IS NOT NULL) AS has_photo,
              o.name AS org_name, o.wind_yellow, o.wind_red, (o.logo_url IS NOT NULL) AS has_logo
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN orgs o ON o.id = u.org_id
       WHERE s.token = ? AND s.expires_at > ? AND u.disabled_at IS NULL`
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

/** Inloggad användare. Skickar vidare till lösenordsbyte om det krävs. */
export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.must_change_password) redirect("/change-password");
  return u;
}

export const canWrite = (u: Pick<User, "role">) => u.role === "admin" || u.role === "pilot";

/** Användare som får ändra data (admin eller pilot). Läsare skickas till startsidan. */
export async function requireWriter(): Promise<User> {
  const u = await requireUser();
  if (!canWrite(u)) redirect("/?readonly=1");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

/** Klientens IP enligt reverse proxyn (första adressen i X-Forwarded-For). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "okänd";
}

export const displayName = (u: { first_name: string; last_name: string; email: string }) =>
  `${u.first_name} ${u.last_name}`.trim() || u.email;

export const userPhotoUrl = (u: { id: string; has_photo: number | boolean }) => (u.has_photo ? `/api/img/user/${u.id}` : null);
export const orgLogoUrl = (u: { org_id: string; has_logo: number | boolean }) => (u.has_logo ? `/api/img/org/${u.org_id}` : null);
