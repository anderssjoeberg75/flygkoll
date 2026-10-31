"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db, newId } from "@/lib/db";

function items(fd: FormData) {
  return String(fd.get("items") || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveChecklist(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("id") || "");
  const name = String(fd.get("name") || "").trim() || "Checklista";
  const kind = String(fd.get("kind") || "custom");
  const drone = String(fd.get("drone_id") || "") || null;
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
  const user = await requireUser();
  const c = db.prepare("SELECT * FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id) as { name: string; kind: string; items: string } | undefined;
  if (!c) return;
  const nid = newId();
  db.prepare("INSERT INTO checklists (id, org_id, name, kind, items) VALUES (?, ?, ?, ?, ?)").run(nid, user.org_id, `${c.name} (kopia)`, c.kind, c.items);
  redirect(`/checklists/${nid}/edit`);
}

export async function deleteChecklist(id: string) {
  const user = await requireUser();
  db.prepare("DELETE FROM checklists WHERE id = ? AND org_id = ?").run(id, user.org_id);
  redirect("/checklists");
}

export async function saveRun(checklistId: string, droneId: string | null, checked: number[]) {
  const user = await requireUser();
  const c = db.prepare("SELECT items FROM checklists WHERE id = ? AND org_id = ?").get(checklistId, user.org_id) as { items: string } | undefined;
  if (!c) return { error: "Checklistan finns inte." };
  const n = (JSON.parse(c.items) as string[]).length;
  db.prepare("INSERT INTO checklist_runs (id, checklist_id, user_id, drone_id, checked, completed) VALUES (?, ?, ?, ?, ?, ?)").run(
    newId(), checklistId, user.id, droneId, JSON.stringify(checked), checked.length >= n ? 1 : 0
  );
  revalidatePath(`/checklists/${checklistId}`);
  return { ok: true };
}
