"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin, requireWriter, hashPassword, verifyPassword, currentSessionToken } from "@/lib/auth";
import { db, newId } from "@/lib/db";
import { THEMES, isEmail, oneOf, optNumber, passwordProblem, text } from "@/lib/validate";

async function fileToDataUrl(f: File | null, maxBytes: number) {
  if (!f || f.size === 0) return null;
  if (f.size > maxBytes) throw new Error("Filen är för stor.");
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) throw new Error("Endast bildfiler.");
  return `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}

export type FormState = { ok?: string; error?: string };

export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser(true);
  try {
    const photo = await fileToDataUrl(fd.get("photo") as File | null, 400_000);
    const classes = ["A1/A3", "A2", "STS-01", "STS-02"].filter((c) => fd.get(`lic_${c}`));

    let defaultDrone = String(fd.get("default_drone_id") || "").trim() || null;
    if (defaultDrone) {
      const valid = db.prepare("SELECT id FROM drones WHERE id = ? AND org_id = ?").get(defaultDrone, user.org_id);
      if (!valid) defaultDrone = null;
    }

    db.prepare(
      `UPDATE users SET first_name=?, last_name=?, default_drone_id=?, theme=?, license_number=?, license_expiry=?, license_classes=?${photo ? ", photo=?" : ""} WHERE id=?`
    ).run(
      ...[
        text(fd.get("first_name"), 100),
        text(fd.get("last_name"), 100),
        defaultDrone,
        oneOf(fd.get("theme"), THEMES, "system"),
        text(fd.get("license_number"), 100) || null,
        /^\d{4}-\d{2}-\d{2}$/.test(String(fd.get("license_expiry") || "")) ? String(fd.get("license_expiry")) : null,
        JSON.stringify(classes),
        ...(photo ? [photo] : []),
        user.id,
      ]
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kunde inte spara." };
  }
  revalidatePath("/", "layout");
  return { ok: "Sparat." };
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser(true);
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string } | undefined;
  if (!row) return { error: "Användare hittades inte." };
  const valid = await verifyPassword(String(fd.get("current") || ""), row.password_hash);
  if (!valid) return { error: "Nuvarande lösenord stämmer inte." };
  const pw = String(fd.get("new") || "");
  const pwErr = passwordProblem(pw, user.email);
  if (pwErr) return { error: pwErr };

  const pwHash = await hashPassword(pw);
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(pwHash, user.id);

  // Behåll endast den aktuella sessionen (#5)
  const currentToken = await currentSessionToken();
  if (currentToken) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, currentToken);
  }

  revalidatePath("/", "layout");
  return { ok: "Lösenordet är ändrat." };
}

/* ---------- organisation ---------- */

export async function saveOrg(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireAdmin();
  try {
    const logo = await fileToDataUrl(fd.get("logo") as File | null, 300_000);
    const y = optNumber(fd.get("wind_yellow"), 1, 40) ?? 8;
    const r = Math.max(y + 0.5, optNumber(fd.get("wind_red"), 1, 50) ?? 12);
    db.prepare(`UPDATE orgs SET name=?, wind_yellow=?, wind_red=?${logo ? ", logo_url=?" : ""} WHERE id=?`).run(
      ...[text(fd.get("name"), 200) || user.org_name, y, r, ...(logo ? [logo] : []), user.org_id]
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
  const roleRaw = String(fd.get("role") || "pilot");
  const role = roleRaw === "admin" || roleRaw === "viewer" ? roleRaw : "pilot";

  if (!isEmail(email)) return { error: "Ogiltig e-post." };
  const pwErr = passwordProblem(pw, email);
  if (pwErr) return { error: `Tillfälligt lösenord: ${pwErr}` };
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "E-postadressen finns redan." };

  const pwHash = await hashPassword(pw);
  db.prepare("INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1)").run(
    newId(), user.org_id, email, pwHash, text(fd.get("first_name"), 100), text(fd.get("last_name"), 100), role
  );
  revalidatePath("/org");
  return { ok: `${email} har lagts till. Dela det tillfälliga lösenordet med personen. Vid inloggning krävs lösenordsbyte.` };
}

export async function setRole(userId: string, fd: FormData) {
  const admin = await requireAdmin();
  if (userId === admin.id) return;
  const roleRaw = String(fd.get("role") || "");
  if (!["admin", "pilot", "viewer"].includes(roleRaw)) return;
  db.prepare("UPDATE users SET role = ? WHERE id = ? AND org_id = ?").run(roleRaw, userId, admin.org_id);
  revalidatePath("/org");
}

export async function removeMember(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return;
  // Inaktivera medlemmen så loggbok och historik bevaras intakt (#3)
  db.prepare("UPDATE users SET disabled_at = datetime('now') WHERE id = ? AND org_id = ?").run(userId, admin.org_id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  revalidatePath("/org");
}

export async function addZone(fd: FormData) {
  const user = await requireWriter();
  const lat = Number(fd.get("lat")), lon = Number(fd.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  db.prepare("INSERT INTO zones (id, org_id, name, lat, lon, radius_m) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId(), user.org_id, String(fd.get("name") || "Zon"), lat, lon, Math.round(Number(fd.get("radius")) || 500)
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
