import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const COOKIE = "flygkoll_session";
const SESSION_DAYS = 30;

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
};

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

export async function createSession(userId: string) {
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
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.*, o.name AS org_name, o.wind_yellow, o.wind_red, o.logo_url
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN orgs o ON o.id = u.org_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

export const displayName = (u: { first_name: string; last_name: string; email: string }) =>
  `${u.first_name} ${u.last_name}`.trim() || u.email;
