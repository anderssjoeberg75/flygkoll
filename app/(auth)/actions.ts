"use server";

import { redirect } from "next/navigation";
import { db, newId, seedOrg } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

export type AuthState = { error?: string };

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const u = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as { id: string; password_hash: string } | undefined;
  if (!u || !verifyPassword(password, u.password_hash)) return { error: "Fel e-post eller lösenord." };
  await createSession(u.id);
  redirect("/");
}

export async function register(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const firstName = String(fd.get("first_name") || "").trim();
  const lastName = String(fd.get("last_name") || "").trim();
  const orgName = String(fd.get("org") || "").trim() || `${firstName || email}s organisation`;
  const userCount = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (userCount > 0 && process.env.FLYGKOLL_OPEN_SIGNUP !== "1") {
    return { error: "Registrering är stängd. Be en administratör lägga till dig under Organisation." };
  }
  if (!email.includes("@")) return { error: "Ange en giltig e-postadress." };
  if (password.length < 8) return { error: "Lösenordet måste vara minst 8 tecken." };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "E-postadressen används redan." };
  const orgId = newId();
  const userId = newId();
  db.transaction(() => {
    db.prepare("INSERT INTO orgs (id, name) VALUES (?, ?)").run(orgId, orgName);
    db.prepare("INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?, 'admin')").run(
      userId, orgId, email, hashPassword(password), firstName, lastName
    );
    seedOrg(orgId);
  })();
  await createSession(userId);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
