import { saveFlight } from "@/app/(app)/logbook/actions";

const ROLES = ["Observatör", "Uppdragsledare", "Sensoroperatör", "Instruktör", "Elev"];

export type FlightDefaults = {
  id?: string;
  started_at: string; // local input value
  duration_min: number;
  location: string;
  lat?: number | null;
  lon?: number | null;
  drone_id?: string | null;
  type: string;
  max_alt_m?: number | null;
  notes: string;
  briefing_id?: string | null;
  crew: { role: string; user_id: string | null; name: string }[];
};

export function FlightForm({
  defaults,
  drones,
  members,
}: {
  defaults: FlightDefaults;
  drones: { id: string; name: string }[];
  members: { id: string; name: string }[];
}) {
  const crew = [...defaults.crew, ...Array(Math.max(0, 4 - defaults.crew.length)).fill({ role: "", user_id: null, name: "" })].slice(0, 4);
  return (
    <form action={saveFlight} className="card stack" style={{ maxWidth: 860 }}>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.briefing_id && <input type="hidden" name="briefing_id" value={defaults.briefing_id} />}
      {defaults.lat != null && <input type="hidden" name="lat" value={defaults.lat} />}
      {defaults.lon != null && <input type="hidden" name="lon" value={defaults.lon} />}
      <div className="grid g3">
        <div><label>Start (svensk tid)</label><input type="datetime-local" name="started_at" defaultValue={defaults.started_at} required /></div>
        <div><label>Flygtid (minuter)</label><input type="number" name="duration_min" min={0} step={0.1} defaultValue={defaults.duration_min} required /></div>
        <div>
          <label>Typ</label>
          <select name="type" defaultValue={defaults.type}>
            <option value="standard">Standard</option>
            <option value="instruction">Utbildning</option>
            <option value="simulator">Simulator</option>
          </select>
        </div>
      </div>
      <div className="grid g3">
        <div><label>Plats</label><input name="location" defaultValue={defaults.location} /></div>
        <div>
          <label>Drönare</label>
          <select name="drone_id" defaultValue={defaults.drone_id ?? ""}>
            <option value="">– Ingen –</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div><label>Max höjd (m)</label><input type="number" name="max_alt_m" min={0} defaultValue={defaults.max_alt_m ?? ""} /></div>
      </div>
      <div>
        <h3>Besättning</h3>
        {crew.map((c, i) => (
          <div key={i} className="grid g3" style={{ marginBottom: 8 }}>
            <select name={`crew_role_${i}`} defaultValue={c.role}>
              <option value="">– Roll –</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              {c.role && !ROLES.includes(c.role) && <option value={c.role}>{c.role}</option>}
            </select>
            <select name={`crew_user_${i}`} defaultValue={c.user_id ?? ""}>
              <option value="">– Kollega –</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input name={`crew_name_${i}`} placeholder="…eller namn på extern person" defaultValue={c.user_id ? "" : c.name} />
          </div>
        ))}
      </div>
      <div><label>Anteckningar</label><textarea name="notes" rows={4} defaultValue={defaults.notes} /></div>
      <div className="row"><button className="btn">Spara flygning</button></div>
    </form>
  );
}
