import Link from "next/link";
import { requireUser, displayName } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDrones } from "@/lib/fleet";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import { ImportPanel } from "@/components/ImportPanel";

const TYPE_LABEL: Record<string, string> = { standard: "Standard", instruction: "Utbildning", simulator: "Simulator" };

type Row = { id: string; started_at: string; duration_min: number; location: string; type: string; drone_name: string | null; first_name: string; last_name: string; email: string; source: string };

export default async function Logbook({ searchParams }: { searchParams: Promise<{ type?: string; scope?: string; drone?: string }> }) {
  const user = await requireUser();
  const { type = "", scope = "mine", drone = "" } = await searchParams;
  const where = ["f.org_id = ?"];
  const args: unknown[] = [user.org_id];
  if (scope !== "org" || user.role !== "admin") { where.push("f.pilot_id = ?"); args.push(user.id); }
  if (type) { where.push("f.type = ?"); args.push(type); }
  if (drone) { where.push("f.drone_id = ?"); args.push(drone); }
  const rows = db
    .prepare(
      `SELECT f.id, f.started_at, f.duration_min, f.location, f.type, f.source, d.name AS drone_name, u.first_name, u.last_name, u.email
       FROM flights f LEFT JOIN drones d ON d.id = f.drone_id JOIN users u ON u.id = f.pilot_id
       WHERE ${where.join(" AND ")} ORDER BY f.started_at DESC LIMIT 500`
    )
    .all(...args) as Row[];

  const sum = (since: Date) =>
    (db.prepare("SELECT COALESCE(SUM(duration_min),0) m FROM flights WHERE pilot_id = ? AND type != 'simulator' AND started_at >= ?").get(user.id, since.toISOString()) as { m: number }).m;
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const week = new Date(today); week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const drones = listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }));

  return (
    <>
      <div className="page-head">
        <div><h1>Flygloggbok</h1><p className="muted" style={{ margin: 0 }}>Logga manuellt, importera CSV eller flygloggar med GPS-spår.</p></div>
        <div className="row">
          <a className="btn secondary" href="/api/logbook/csv">Exportera CSV</a>
          <Link className="btn" href="/logbook/new">＋ Ny flygning</Link>
        </div>
      </div>
      <div className="grid g4">
        <div className="card stat"><span className="label">Idag</span><span className="value">{fmtMinutes(sum(today))}</span></div>
        <div className="card stat"><span className="label">Denna vecka</span><span className="value">{fmtMinutes(sum(week))}</span></div>
        <div className="card stat"><span className="label">Denna månad</span><span className="value">{fmtMinutes(sum(month))}</span></div>
        <div className="card stat"><span className="label">Total flygtid</span><span className="value">{fmtMinutes(sum(new Date(0)))}</span></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <form className="row" style={{ marginBottom: 12 }}>
          <select name="type" defaultValue={type} style={{ width: "auto" }}>
            <option value="">Alla typer</option>
            <option value="standard">Standard</option>
            <option value="instruction">Utbildning</option>
            <option value="simulator">Simulator</option>
          </select>
          <select name="drone" defaultValue={drone} style={{ width: "auto" }}>
            <option value="">Alla drönare</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {user.role === "admin" && (
            <select name="scope" defaultValue={scope} style={{ width: "auto" }}>
              <option value="mine">Mina flygningar</option>
              <option value="org">Hela organisationen</option>
            </select>
          )}
          <button className="btn secondary">Filtrera</button>
          <span className="muted small">Visar {rows.length} flygningar</span>
        </form>
        {rows.length === 0 ? <div className="empty">Inga flygningar än. <Link href="/logbook/new">Logga din första flygning</Link>.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Start</th><th>Längd</th><th>Plats</th><th>Drönare</th><th>Typ</th>{scope === "org" && <th>Pilot</th>}<th>Källa</th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/logbook/${f.id}`}>{fmtDateTime(f.started_at)}</Link></td>
                    <td>{fmtMinutes(f.duration_min)}</td>
                    <td>{f.location || "–"}</td>
                    <td>{f.drone_name || "–"}</td>
                    <td><span className="badge b-muted">{TYPE_LABEL[f.type] ?? f.type}</span></td>
                    {scope === "org" && <td className="small">{displayName(f)}</td>}
                    <td className="small muted">{f.source === "log" ? "Flygloggs-import" : f.source === "csv" ? "CSV" : "Manuell"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportPanel drones={drones} />
    </>
  );
}
