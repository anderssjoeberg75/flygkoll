"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireWriter } from "@/lib/auth";
import { orgDroneId } from "@/lib/fleet";
import { CHECKLIST_KINDS, oneOf } from "@/lib/validate";
import { db, newId } from "@/lib/db";

function items(fd: FormData) {
  return String(fd.get("items") || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200)
    .map((s) => s.slice(0, 500));
}

export async function saveChecklist(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "").trim().slice(0, 200) || "Checklista";
  const kind = oneOf(fd.get("kind"), CHECKLIST_KINDS, "custom");
  const drone = orgDroneId(user.org_id, String(fd.get("drone_id") || ""));
  if (id) {
    db.prepare("UPDATE checklists SET name=?, kind=?, drone_id=?, items=? WHERE id=? AND org_id=?").run(name, kind, drone, JSON.stringify(items(fd)), id, user.org_id);
    revalidatePath(`/checklists/${id}`);
    redirect(`/checklists/${id}`);
  }
  const nid = newId();
  db.prepare("INSERT INTO checklists (id, org_id, name, kind, drone_id, items) VALUES (?, ?, ?, ?, ?, ?)").run(nid, user.org_id, name, kind, drone, JSON.stringify(items(fd)));
  redirect(`/checklists/${nid}`);
}

export async function duplicateChecklist(id: string) {
  const user = await requireAdmin();
  const c = db.prepare("SELECT * FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id) as { name: string; kind: string; items: string } | undefined;
  if (!c) return;
  const nid = newId();
  db.prepare("INSERT INTO checklists (id, org_id, name, kind, items) VALUES (?, ?, ?, ?, ?)").run(nid, user.org_id, `${c.name} (kopia)`, c.kind, c.items);
  redirect(`/checklists/${nid}/edit`);
}

export async function deleteChecklist(id: string) {
  const user = await requireAdmin();
  db.prepare("DELETE FROM checklists WHERE id = ? AND org_id = ?").run(id, user.org_id);
  redirect("/checklists");
}

export async function saveRun(checklistId: string, droneId: string | null, checked: number[], briefingId: string | null = null) {
  const user = await requireWriter();
  const c = db.prepare("SELECT items FROM checklists WHERE id = ? AND org_id = ?").get(checklistId, user.org_id) as { items: string } | undefined;
  if (!c) return { error: "Checklistan finns inte." };
  const n = (JSON.parse(c.items) as string[]).length;
  const valid = [...new Set(checked.filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);
  const briefing = briefingId && db.prepare("SELECT 1 FROM briefings WHERE id = ? AND org_id = ?").get(briefingId, user.org_id) ? briefingId : null;
  const id = newId();
  db.prepare("INSERT INTO checklist_runs (id, checklist_id, user_id, drone_id, checked, completed, briefing_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id, checklistId, user.id, orgDroneId(user.org_id, droneId), JSON.stringify(valid), valid.length >= n ? 1 : 0, briefing
  );
  revalidatePath(`/checklists/${checklistId}`);
  if (briefing) revalidatePath(`/briefings/${briefing}`);
  return { ok: true, id };
}
