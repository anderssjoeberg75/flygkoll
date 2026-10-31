import { saveChecklist } from "@/app/(app)/checklists/actions";

export function ChecklistEditor({ c, drones }: { c?: { id: string; name: string; kind: string; drone_id: string | null; items: string[] }; drones: { id: string; name: string }[] }) {
  return (
    <form action={saveChecklist} className="card stack" style={{ maxWidth: 760 }}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid g3">
        <div><label>Namn</label><input name="name" defaultValue={c?.name} required /></div>
        <div>
          <label>Typ</label>
          <select name="kind" defaultValue={c?.kind ?? "preflight"}>
            <option value="preflight">Före flygning</option>
            <option value="postflight">Efter flygning</option>
            <option value="daily">Daglig kontroll</option>
            <option value="custom">Övrigt</option>
          </select>
        </div>
        <div>
          <label>Gäller drönare</label>
          <select name="drone_id" defaultValue={c?.drone_id ?? ""}>
            <option value="">Alla drönare</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label>Punkter (en per rad)</label>
        <textarea name="items" rows={14} defaultValue={c?.items.join("\n")} />
      </div>
      <div><button className="btn">Spara</button></div>
    </form>
  );
}
