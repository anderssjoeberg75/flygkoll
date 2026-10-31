"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { db, newId } from "@/lib/db";

function items(fd: FormData) {
  return String(fd.get("items") || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveChecklist(fd: FormData) {
  const user = await requireWriter();
  const id = String(fd.get("id") || "").trim();
  const name = String(fd.get("name") || "").trim() || "Checklista";
  const kind = String(fd.get("kind") || "custom");

  let drone = String(fd.get("drone_id") || "").trim() || null;
  if (drone) {
    const valid = db.prepare("SELECT id FROM drones WHERE id = ? AND org_id = ?").get(drone, user.org_id);
    if (!valid) drone = null;
  }

  if (id) {
    const existing = db.prepare("SELECT id FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id);
    if (existing) {
      db.prepare("UPDATE checklists SET name=?, kind=?, drone_id=?, items=? WHERE id=? AND org_id=?").run(name, kind, drone, JSON.stringify(items(fd)), id, user.org_id);
      revalidatePath(`/checklists/${id}`);
      redirect(`/checklists/${id}`);
    }
  }
  const nid = newId();
  db.prepare("INSERT INTO checklists (id, org_id, name, kind, drone_id, items) VALUES (?, ?, ?, ?, ?, ?)").run(nid, user.org_id, name, kind, drone, JSON.stringify(items(fd)));
  redirect(`/checklists/${nid}`);
}

export async function duplicateChecklist(id: string) {
  const user = await requireWriter();
  const c = db.prepare("SELECT * FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id) as { name: string; kind: string; items: string } | undefined;
  if (!c) return;
  const nid = newId();
  db.prepare("INSERT INTO checklists (id, org_id, name, kind, items) VALUES (?, ?, ?, ?, ?)").run(nid, user.org_id, `${c.name} (kopia)`, c.kind, c.items);
  redirect(`/checklists/${nid}/edit`);
}

export async function deleteChecklist(id: string) {
  const user = await requireWriter();
  db.prepare("DELETE FROM checklists WHERE id = ? AND org_id = ?").run(id, user.org_id);
  redirect("/checklists");
}

export async function saveRun(checklistId: string, droneId: string | null, checked: number[], briefingId?: string | null) {
  const user = await requireWriter();
  const c = db.prepare("SELECT items FROM checklists WHERE id = ? AND org_id = ?").get(checklistId, user.org_id) as { items: string } | undefined;
  if (!c) return { error: "Checklistan finns inte." };

  let validDrone = droneId;
  if (validDrone) {
    const vd = db.prepare("SELECT id FROM drones WHERE id = ? AND org_id = ?").get(validDrone, user.org_id);
    if (!vd) validDrone = null;
  }

  let validBriefing = briefingId || null;
  if (validBriefing) {
    const vb = db.prepare("SELECT id FROM briefings WHERE id = ? AND org_id = ?").get(validBriefing, user.org_id);
    if (!vb) validBriefing = null;
  }

  const n = (JSON.parse(c.items) as string[]).length;
  const nid = newId();
  db.prepare("INSERT INTO checklist_runs (id, checklist_id, user_id, drone_id, briefing_id, checked, completed) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    nid, checklistId, user.id, validDrone, validBriefing, JSON.stringify(checked), checked.length >= n ? 1 : 0
  );
  revalidatePath(`/checklists/${checklistId}`);
  return { ok: true, id: nid };
}
