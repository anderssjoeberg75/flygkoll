"use server";

import { redirect } from "next/navigation";
import { db, newId, seedOrg } from "@/lib/db";
import { clientIp, createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { blockedFor, hit, reset, type Limit } from "@/lib/ratelimit";
import { isEmail, passwordProblem, text } from "@/lib/validate";

export type AuthState = { error?: string };

const MIN = 60e3;
// en riktig hashsträng så att verifieringen tar lika lång tid när e-posten inte finns (#27)
const DUMMY_HASH = `scrypt$${"a1".repeat(16)}$${"b2".repeat(64)}`;

function loginLimits(email: string, ip: string): Limit[] {
  return [
    // per e-post OCH IP: en angripare kan inte låsa ut en användare från andra adresser
    { key: `login:${email}|${ip}`, max: 10, windowMs: 15 * MIN },
    // per IP: stoppar gissning mot många konton
    { key: `login-ip:${ip}`, max: 50, windowMs: 15 * MIN },
  ];
}

const waitText = (ms: number) => `Försök igen om ${Math.max(1, Math.ceil(ms / MIN))} minuter.`;

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase().slice(0, 254);
  const password = String(fd.get("password") || "").slice(0, 200);
  const ip = await clientIp();
  const limits = loginLimits(email || "-", ip);

  const wait = blockedFor(limits);
  if (wait > 0) return { error: `För många misslyckade inloggningsförsök. ${waitText(wait)}` };

  const u = db.prepare("SELECT id, password_hash, disabled_at FROM users WHERE email = ?").get(email) as
    | { id: string; password_hash: string; disabled_at?: string | null }
    | undefined;

  // lösenordet kontrolleras alltid – även för okända konton – så att svarstiden inte avslöjar vilka som finns
  const valid = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !valid) {
    hit(limits);
    return { error: "Fel e-post eller lösenord." };
  }
  // först efter rätt lösenord avslöjas att kontot är inaktiverat
  if (u.disabled_at) {
    hit(limits);
    return { error: "Detta konto har inaktiverats. Kontakta administratören för din organisation." };
  }

  reset([limits[0].key]);
  await createSession(u.id);
  redirect("/");
}

export async function register(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const firstName = text(fd.get("first_name"), 100);
  const lastName = text(fd.get("last_name"), 100);
  const orgName = text(fd.get("org"), 200) || `${firstName || email}s organisation`;
  const userCount = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (userCount > 0 && process.env.FLYGKOLL_OPEN_SIGNUP === "0") {
    return { error: "Registrering är stängd. Be en administratör lägga till dig under Organisation." };
  }
  const limits: Limit[] = [{ key: `register:${await clientIp()}`, max: 5, windowMs: 60 * MIN }];
  const wait = blockedFor(limits);
  if (wait > 0) return { error: `För många registreringar från din adress. ${waitText(wait)}` };
  if (!isEmail(email)) return { error: "Ange en giltig e-postadress." };
  const pwErr = passwordProblem(password, email);
  if (pwErr) return { error: pwErr };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "E-postadressen används redan." };
  hit(limits);
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
