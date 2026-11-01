"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin, requireWriter, hashPassword, verifyPassword, revokeOtherSessions, isRole } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { orgDroneId } from "@/lib/fleet";
import { clampRadius, isValidLatLon } from "@/lib/validate";

// SVG tillåts inte: bilderna serveras från egen origin och SVG kan innehålla skript
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;

async function fileToDataUrl(f: File | null, maxBytes: number) {
  if (!f || f.size === 0) return null;
  if (f.size > maxBytes) throw new Error(`Filen är för stor (max ${Math.round(maxBytes / 1000)} kB).`);
  if (!IMAGE_TYPES.test(f.type)) throw new Error("Endast PNG, JPEG, WebP eller GIF.");
  return `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}

export type FormState = { ok?: string; error?: string };

const LICENSE_CLASSES = ["A1/A3", "A2", "STS-01", "STS-02"];
const THEMES = ["system", "light", "dark"];

export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const photo = await fileToDataUrl(fd.get("photo") as File | null, 400_000);
    const classes = LICENSE_CLASSES.filter((c) => fd.get(`lic_${c}`));
    const theme = String(fd.get("theme") || "system");
    const expiry = String(fd.get("license_expiry") || "");
    db.prepare(
      `UPDATE users SET first_name=?, last_name=?, default_drone_id=?, theme=?, license_number=?, license_expiry=?, license_classes=?${photo ? ", photo=?" : ""} WHERE id=?`
    ).run(
      ...[
        String(fd.get("first_name") || "").trim().slice(0, 100),
        String(fd.get("last_name") || "").trim().slice(0, 100),
        orgDroneId(user.org_id, String(fd.get("default_drone_id") || "")),
        THEMES.includes(theme) ? theme : "system",
        String(fd.get("license_number") || "").trim().slice(0, 100) || null,
        /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
        JSON.stringify(classes),
        ...(photo ? [photo] : []),
        user.id,
      ]
    );
    if (fd.get("remove_photo")) db.prepare("UPDATE users SET photo = NULL WHERE id = ?").run(user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kunde inte spara." };
  }
  revalidatePath("/", "layout");
  return { ok: "Sparat." };
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!(await verifyPassword(String(fd.get("current") || ""), row.password_hash))) return { error: "Nuvarande lösenord stämmer inte." };
  const pw = String(fd.get("new") || "");
  if (pw.length < 8) return { error: "Minst 8 tecken." };
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(pw), user.id);
  // logga ut andra enheter men behåll den här sessionen
  await revokeOtherSessions(user.id);
  return { ok: "Lösenordet är ändrat. Andra enheter har loggats ut." };
}

/* ---------- organisation ---------- */

export async function saveOrg(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  try {
    const logo = await fileToDataUrl(fd.get("logo") as File | null, 300_000);
    const y = Math.min(40, Math.max(1, Number(fd.get("wind_yellow")) || 8));
    const r = Math.min(50, Math.max(y + 0.5, Number(fd.get("wind_red")) || 12));
    db.prepare(`UPDATE orgs SET name=?, wind_yellow=?, wind_red=?${logo ? ", logo_url=?" : ""} WHERE id=?`).run(
      ...[String(fd.get("name") || "").trim().slice(0, 200) || user.org_name, y, r, ...(logo ? [logo] : []), user.org_id]
    );
    if (fd.get("remove_logo")) db.prepare("UPDATE orgs SET logo_url = NULL WHERE id = ?").run(user.org_id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kunde inte spara." };
  }
  revalidatePath("/", "layout");
  return { ok: "Sparat." };
}

export async function addMember(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const pw = String(fd.get("password") || "");
  const role = String(fd.get("role") || "pilot");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Ogiltig e-post." };
  if (pw.length < 8) return { error: "Tillfälligt lösenord måste vara minst 8 tecken." };
  if (!isRole(role)) return { error: "Ogiltig roll." };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "E-postadressen finns redan." };
  db.prepare(
    "INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
  ).run(newId(), user.org_id, email, await hashPassword(pw), String(fd.get("first_name") || "").trim(), String(fd.get("last_name") || "").trim(), role);
  revalidatePath("/org");
  return { ok: `${email} har lagts till. Dela det tillfälliga lösenordet – personen får välja ett eget vid första inloggningen.` };
}

export async function setRole(userId: string, fd: FormData) {
  const admin = await requireAdmin();
  const role = String(fd.get("role"));
  if (userId === admin.id || !isRole(role)) return;
  db.prepare("UPDATE users SET role = ? WHERE id = ? AND org_id = ?").run(role, userId, admin.org_id);
  revalidatePath("/org");
}

/**
 * Inaktiverar en medlem. Användaren raderas inte – loggade flygningar, briefingar och
 * checklistor ligger kvar i loggboken. Alla sessioner avslutas.
 */
export async function removeMember(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return;
  db.transaction(() => {
    const r = db.prepare("UPDATE users SET disabled_at = ? WHERE id = ? AND org_id = ? AND disabled_at IS NULL").run(new Date().toISOString(), userId, admin.org_id);
    if (r.changes) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
  revalidatePath("/org");
}

export async function enableMember(userId: string) {
  const admin = await requireAdmin();
  db.prepare("UPDATE users SET disabled_at = NULL WHERE id = ? AND org_id = ?").run(userId, admin.org_id);
  revalidatePath("/org");
}

/** Ger en medlem ett nytt tillfälligt lösenord som måste bytas vid nästa inloggning. */
export async function resetMemberPassword(userId: string, _: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const pw = String(fd.get("password") || "");
  if (pw.length < 8) return { error: "Minst 8 tecken." };
  const r = db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ? AND org_id = ?").run(await hashPassword(pw), userId, admin.org_id);
  if (!r.changes) return { error: "Hittar inte medlemmen." };
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return { ok: "Nytt tillfälligt lösenord satt." };
}

export async function addZone(fd: FormData) {
  const user = await requireWriter();
  const lat = Number(String(fd.get("lat") || "").replace(",", ".")), lon = Number(String(fd.get("lon") || "").replace(",", "."));
  if (!isValidLatLon(lat, lon)) return;
  db.prepare("INSERT INTO zones (id, org_id, name, lat, lon, radius_m) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId(), user.org_id, String(fd.get("name") || "Zon").trim().slice(0, 200) || "Zon", lat, lon, clampRadius(Number(fd.get("radius")))
  );
  revalidatePath("/org");
  revalidatePath("/briefings/new");
}

export async function zoneFromBriefing(briefingId: string) {
  const user = await requireWriter();
  const b = db.prepare("SELECT name, lat, lon, radius_m FROM briefings WHERE id = ? AND org_id = ?").get(briefingId, user.org_id) as
    | { name: string; lat: number; lon: number; radius_m: number }
    | undefined;
  if (!b) return;
  db.prepare("INSERT INTO zones (id, org_id, name, lat, lon, radius_m) VALUES (?, ?, ?, ?, ?, ?)").run(newId(), user.org_id, b.name, b.lat, b.lon, b.radius_m);
  revalidatePath("/org");
  revalidatePath(`/briefings/${briefingId}`);
}

export async function removeZone(id: string) {
  const user = await requireWriter();
  db.prepare("DELETE FROM zones WHERE id = ? AND org_id = ?").run(id, user.org_id);
  revalidatePath("/org");
}
