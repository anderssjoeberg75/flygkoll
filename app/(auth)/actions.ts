"use server";

import { redirect } from "next/navigation";
import { db, newId, seedOrg } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword, checkLoginRateLimit, recordLoginAttempt } from "@/lib/auth";

export type AuthState = { error?: string };

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");

  const rateKey = email || "unknown";
  const limit = checkLoginRateLimit(rateKey);
  if (!limit.allowed) {
    const mins = Math.ceil(limit.resetMs / 60000);
    return { error: `För många misslyckade inloggningsförsök. Kontot är tillfälligt spärrat. Försök igen om ${mins} minuter.` };
  }

  const u = db.prepare("SELECT id, password_hash, disabled_at FROM users WHERE email = ?").get(email) as
    | { id: string; password_hash: string; disabled_at?: string | null }
    | undefined;

  if (!u) {
    recordLoginAttempt(rateKey, false);
    return { error: "Fel e-post eller lösenord." };
  }

  if (u.disabled_at) {
    return { error: "Detta konto har inaktiverats. Kontakta administratören för din organisation." };
  }

  const valid = await verifyPassword(password, u.password_hash);
  if (!valid) {
    recordLoginAttempt(rateKey, false);
    return { error: "Fel e-post eller lösenord." };
  }

  recordLoginAttempt(rateKey, true);
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
  const pwHash = await hashPassword(password);
  db.transaction(() => {
    db.prepare("INSERT INTO orgs (id, name) VALUES (?, ?)").run(orgId, orgName);
    db.prepare("INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?, 'admin')").run(
      userId, orgId, email, pwHash, firstName, lastName
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
