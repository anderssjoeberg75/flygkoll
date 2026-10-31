import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, displayName } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDrone, droneHours, scheduleStatus, type Schedule } from "@/lib/fleet";
import { droneRules } from "@/lib/rules";
import { fmtDate, fmtDateTime, fmtMinutes, toLocalInput } from "@/lib/format";
import { DroneFields } from "@/components/DroneFields";
import { updateDrone, archiveDrone, addSchedule, removeSchedule, logMaintenance } from "../actions";

const PAGE = 25;

export default async function DronePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const user = await requireUser();
  const d = getDrone(user.org_id, id);
  if (!d) notFound();
  const hours = droneHours(d.id);
  const schedules = db.prepare("SELECT * FROM maint_schedules WHERE drone_id = ? AND active = 1").all(d.id) as Schedule[];
  const logs = db.prepare("SELECT m.*, u.first_name, u.last_name, u.email FROM maint_logs m LEFT JOIN users u ON u.id = m.user_id WHERE m.drone_id = ? ORDER BY m.done_at DESC").all(d.id) as {
    id: string; work_type: string; done_at: string; notes: string; first_name: string | null; last_name: string | null; email: string | null;
  }[];
  const workTypes = db.prepare("SELECT name FROM work_types WHERE org_id = ? ORDER BY name").all(user.org_id) as { name: string }[];
  const total = (db.prepare("SELECT COUNT(*) n FROM flights WHERE drone_id = ?").get(d.id) as { n: number }).n;
  const flights = db
    .prepare(
      `SELECT f.id, f.started_at, f.duration_min, f.location, u.first_name, u.last_name, u.email FROM flights f JOIN users u ON u.id = f.pilot_id
       WHERE f.drone_id = ? ORDER BY f.started_at DESC LIMIT ? OFFSET ?`
    )
    .all(d.id, PAGE, (page - 1) * PAGE) as { id: string; started_at: string; duration_min: number; location: string; first_name: string; last_name: string; email: string }[];
  const rules = droneRules(d);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{d.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{d.model} · {hours.toFixed(1)} flygtimmar · {total} flygningar · <span className="badge b-info">{rules.subcategory}</span></p>
        </div>
        <form action={archiveDrone.bind(null, d.id)}><button className="btn secondary small">{d.archived ? "Återaktivera" : "Arkivera"}</button></form>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card stack">
          <h2>Serviceintervall</h2>
          {schedules.length === 0 && <p className="small muted">Inga scheman. Lägg till datum- eller timbaserade intervall.</p>}
          {schedules.map((s) => {
            const st = scheduleStatus(s, hours);
            return (
              <div key={s.id} className="spread" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                <div>
                  <strong>{s.name}</strong>{" "}
                  <span className={`badge ${st.overdue ? "b-danger" : st.soon ? "b-warn" : "b-ok"}`}>{st.overdue ? "Förfallen" : st.soon ? "Snart" : "OK"}</span>
                  <div className="small muted">
                    {s.interval_days ? `Var ${s.interval_days}:e dag (${Math.round(st.daysLeft!)} d kvar)` : ""}
                    {s.interval_days && s.interval_hours ? " · " : ""}
                    {s.interval_hours ? `Var ${s.interval_hours}:e flygtimme (${st.hoursLeft!.toFixed(1)} h kvar)` : ""}
                    {" · Senast "}{fmtDate(s.last_done_at)}
                  </div>
                </div>
                <form action={removeSchedule.bind(null, d.id, s.id)}><button className="btn danger small" title="Historiken finns kvar">Ta bort</button></form>
              </div>
            );
          })}
          <form action={addSchedule.bind(null, d.id)} className="grid g4" style={{ alignItems: "end" }}>
            <div style={{ gridColumn: "span 2" }}><label>Nytt schema</label><input name="name" placeholder="T.ex. Propellerbyte" required /></div>
            <div><label>Dagar</label><input type="number" name="interval_days" min={1} /></div>
            <div><label>Flygtimmar</label><input type="number" name="interval_hours" min={0.5} step={0.5} /></div>
            <div><button className="btn secondary small">Lägg till</button></div>
          </form>
        </div>

        <div className="card stack">
          <h2>Logga utfört arbete</h2>
          <form action={logMaintenance.bind(null, d.id)} className="stack">
            <div className="grid g2">
              <div>
                <label>Arbetstyp</label>
                <select name="work_type">{workTypes.map((w) => <option key={w.name}>{w.name}</option>)}</select>
              </div>
              <div><label>…eller fritext</label><input name="work_type_free" /></div>
            </div>
            <div className="grid g2">
              <div>
                <label>Uppfyller schema</label>
                <select name="schedule_id"><option value="">– Inget –</option>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <div><label>Datum</label><input type="date" name="done_at" defaultValue={toLocalInput(new Date()).slice(0, 10)} /></div>
            </div>
            <div><label>Anteckning</label><input name="notes" /></div>
            <div><button className="btn">Spara</button></div>
          </form>
          <h3>Historik</h3>
          {logs.length === 0 ? <p className="small muted">Inget loggat underhåll.</p> : (
            <table><tbody>{logs.map((l) => (
              <tr key={l.id}><td>{fmtDate(l.done_at)}</td><td><strong>{l.work_type}</strong><div className="small muted">{l.notes}</div></td><td className="small muted">{l.email ? displayName({ first_name: l.first_name ?? "", last_name: l.last_name ?? "", email: l.email }) : ""}</td></tr>
            ))}</tbody></table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Flygningar med {d.name}</h2>
        {flights.length === 0 ? <p className="small muted">Inga flygningar loggade.</p> : (
          <>
            <table>
              <thead><tr><th>Start</th><th>Längd</th><th>Plats</th><th>Pilot</th></tr></thead>
              <tbody>{flights.map((f) => (
                <tr key={f.id}><td><Link href={`/logbook/${f.id}`}>{fmtDateTime(f.started_at)}</Link></td><td>{fmtMinutes(f.duration_min)}</td><td>{f.location || "–"}</td><td>{displayName(f)}</td></tr>
              ))}</tbody>
            </table>
            <div className="row" style={{ marginTop: 10 }}>
              {page > 1 && <Link className="btn secondary small" href={`?page=${page - 1}`}>← Föregående</Link>}
              <span className="small muted">Sida {page} av {Math.max(1, Math.ceil(total / PAGE))}</span>
              {page * PAGE < total && <Link className="btn secondary small" href={`?page=${page + 1}`}>Nästa →</Link>}
            </div>
          </>
        )}
      </div>

      <form action={updateDrone.bind(null, d.id)} className="card stack" style={{ marginTop: 16 }}>
        <h2>Uppgifter</h2>
        <DroneFields d={d} />
        <div><button className="btn secondary">Spara ändringar</button></div>
      </form>
    </>
  );
}
