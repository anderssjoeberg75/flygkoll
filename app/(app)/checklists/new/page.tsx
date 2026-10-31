import { requireAdmin } from "@/lib/auth";
import { listDrones } from "@/lib/fleet";
import { ChecklistEditor } from "@/components/ChecklistEditor";

export default async function NewChecklist() {
  const user = await requireAdmin();
  return (
    <>
      <div className="page-head"><h1>Ny checklista</h1></div>
      <ChecklistEditor drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
