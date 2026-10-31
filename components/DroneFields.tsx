import { CLASS_OPTIONS } from "@/lib/rules";

export function DroneFields({ d }: { d?: { name: string; model: string; serial: string; mtom_g: number; class_mark: string; char_dim_m: number; notes: string } }) {
  return (
    <>
      <div className="grid g3">
        <div><label>Namn</label><input name="name" defaultValue={d?.name} required placeholder="T.ex. Mavic 3 #1" /></div>
        <div><label>Modell</label><input name="model" defaultValue={d?.model} placeholder="DJI Mavic 3 Pro" /></div>
        <div><label>Serienummer</label><input name="serial" defaultValue={d?.serial} /></div>
      </div>
      <div className="grid g3">
        <div><label>MTOM (gram)</label><input type="number" name="mtom_g" min={0} defaultValue={d?.mtom_g ?? ""} required /></div>
        <div>
          <label>Klassmärkning</label>
          <select name="class_mark" defaultValue={d?.class_mark ?? "none"}>
            {CLASS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </div>
        <div><label>Karakteristisk dimension (m)</label><input type="number" step="0.01" name="char_dim_m" defaultValue={d?.char_dim_m ?? 0.35} /></div>
      </div>
      <div><label>Anteckningar</label><textarea name="notes" rows={2} defaultValue={d?.notes} /></div>
    </>
  );
}
