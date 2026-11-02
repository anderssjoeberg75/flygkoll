import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import { listDrones } from "@/lib/fleet";
import { ChecklistEditor } from "@/components/ChecklistEditor";

export default async function EditChecklist({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();
  const c = db.prepare("SELECT * FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id) as { id: string; name: string; kind: string; drone_id: string | null; items: string } | undefined;
  if (!c) notFound();
  return (
    <>
      <div className="page-head"><h1>Redigera checklista</h1></div>
      <ChecklistEditor c={{ ...c, items: safeJson<string[]>(c.items, []) }} drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
