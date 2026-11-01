"use server";

import { redirect } from "next/navigation";
import { db, newId, seedOrg } from "@/lib/db";
import { clientIp, createSession, destroySession, getUser, hashPassword, revokeOtherSessions, verifyPassword } from "@/lib/auth";
import { hit, isLimited, reset } from "@/lib/ratelimit";

export type AuthState = { error?: string };

const WINDOW = 15 * 60e3;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;
// används när e-posten saknas så att svarstiden inte avslöjar vilka konton som finns
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const ip = await clientIp();
  const kEmail = `login:email:${email}`, kIp = `login:ip:${ip}`;
  if (isLimited(kEmail, MAX_PER_EMAIL) || isLimited(kIp, MAX_PER_IP)) {
    return { error: "För många inloggningsförsök. Vänta en stund och försök igen." };
  }
  const u = db.prepare("SELECT id, password_hash, disabled_at FROM users WHERE email = ?").get(email) as
    | { id: string; password_hash: string; disabled_at: string | null }
    | undefined;
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) {
    hit(kEmail, MAX_PER_EMAIL, WINDOW);
    hit(kIp, MAX_PER_IP, WINDOW);
    console.warn(`[flygkoll] misslyckad inloggning för ${email || "(tom)"} från ${ip}`);
    return { error: "Fel e-post eller lösenord." };
  }
  if (u.disabled_at) return { error: "Kontot är inaktiverat. Kontakta en administratör." };
  reset(kEmail);
  await createSession(u.id);
  redirect("/");
}

export async function register(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const firstName = String(fd.get("first_name") || "").trim();
  const lastName = String(fd.get("last_name") || "").trim();
  const orgName = String(fd.get("org") || "").trim() || `${firstName || email}s organisation`;
  if (!hit(`register:ip:${await clientIp()}`, 10, 60 * 60e3).allowed) return { error: "För många registreringar. Försök igen senare." };
  const userCount = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (userCount > 0 && process.env.FLYGKOLL_OPEN_SIGNUP !== "1") {
    return { error: "Registrering är stängd. Be en administratör lägga till dig under Organisation." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Ange en giltig e-postadress." };
  if (password.length < 8) return { error: "Lösenordet måste vara minst 8 tecken." };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "E-postadressen används redan." };
  const orgId = newId();
  const userId = newId();
  const hash = await hashPassword(password);
  db.transaction(() => {
    db.prepare("INSERT INTO orgs (id, name) VALUES (?, ?)").run(orgId, orgName);
    db.prepare("INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?, 'admin')").run(
      userId, orgId, email, hash, firstName, lastName
    );
    seedOrg(orgId);
  })();
  await createSession(userId);
  redirect("/");
}

/** Tvingat lösenordsbyte efter första inloggningen med ett tillfälligt lösenord. */
export async function forceChangePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const user = await getUser();
  if (!user) redirect("/login");
  const pw = String(fd.get("new") || "");
  if (pw.length < 8) return { error: "Lösenordet måste vara minst 8 tecken." };
  if (pw !== String(fd.get("confirm") || "")) return { error: "Lösenorden matchar inte." };
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (await verifyPassword(pw, row.password_hash)) return { error: "Välj ett annat lösenord än det tillfälliga." };
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(await hashPassword(pw), user.id);
  await revokeOtherSessions(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
