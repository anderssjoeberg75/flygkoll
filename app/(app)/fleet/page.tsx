import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDrones, droneHours, scheduleStatus, type Schedule } from "@/lib/fleet";
import { DroneFields } from "@/components/DroneFields";
import { addDrone, addWorkType, removeWorkType } from "./actions";

export default async function Fleet({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireUser();
  const { archived } = await searchParams;
  const drones = listDrones(user.org_id, archived === "1");
  const workTypes = db.prepare("SELECT id, name FROM work_types WHERE org_id = ? ORDER BY name").all(user.org_id) as { id: string; name: string }[];
  return (
    <>
      <div className="page-head">
        <div><h1>Flotta & underhåll</h1><p className="muted" style={{ margin: 0 }}>Luftfartyg, serviceintervall och flygtimmar.</p></div>
        <Link className="btn secondary small" href={archived === "1" ? "/fleet" : "/fleet?archived=1"}>{archived === "1" ? "Dölj arkiverade" : "Visa arkiverade"}</Link>
      </div>
      <div className="card">
        {drones.length === 0 ? <div className="empty">Inga drönare än – lägg till din första nedan.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Drönare</th><th>Klass / MTOM</th><th>Flygtid</th><th>Flygningar</th><th>Underhåll</th></tr></thead>
              <tbody>
                {drones.map((d) => {
                  const h = droneHours(d.id);
                  const n = (db.prepare("SELECT COUNT(*) n FROM flights WHERE drone_id = ?").get(d.id) as { n: number }).n;
                  const sch = db.prepare("SELECT * FROM maint_schedules WHERE drone_id = ? AND active = 1").all(d.id) as Schedule[];
                  const sts = sch.map((s) => scheduleStatus(s, h));
                  const over = sts.filter((s) => s.overdue).length, soon = sts.filter((s) => s.soon).length;
                  return (
                    <tr key={d.id}>
                      <td><Link href={`/fleet/${d.id}`}><strong>{d.name}</strong></Link> {d.archived ? <span className="badge b-muted">Arkiverad</span> : null}<div className="small muted">{d.model} {d.serial && `· ${d.serial}`}</div></td>
                      <td>{d.class_mark === "none" ? "Oklassad" : d.class_mark} · {d.mtom_g} g</td>
                      <td>{h.toFixed(1)} h</td>
                      <td>{n}</td>
                      <td>
                        {over > 0 ? <span className="badge b-danger">{over} förfallen</span> : soon > 0 ? <span className="badge b-warn">{soon} snart</span> : sch.length ? <span className="badge b-ok">OK</span> : <span className="muted small">Inga scheman</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginTop: 16, alignItems: "start" }}>
        <form action={addDrone} className="card stack">
          <h2>Lägg till drönare</h2>
          <DroneFields />
          <div><button className="btn">Lägg till</button></div>
        </form>
        <div className="card stack">
          <h2>Arbetstyper</h2>
          <p className="small muted" style={{ margin: 0 }}>Organisationens egna typer av underhållsarbete.</p>
          {workTypes.map((w) => (
            <form key={w.id} action={removeWorkType.bind(null, w.id)} className="spread">
              <span>{w.name}</span><button className="btn danger small">Ta bort</button>
            </form>
          ))}
          <form action={addWorkType} className="row">
            <input name="name" placeholder="Ny arbetstyp" style={{ flex: 1 }} required />
            <button className="btn secondary small">Lägg till</button>
          </form>
        </div>
      </div>
    </>
  );
}
