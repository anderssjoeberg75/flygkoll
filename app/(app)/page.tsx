import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueMaintenance } from "@/lib/fleet";
import { fmtDateTime, fmtMinutes, fmtDate, STATUS_LABEL } from "@/lib/format";

export default async function Dashboard() {
  const user = await requireUser();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const nBrief = (db.prepare("SELECT COUNT(*) n FROM briefings WHERE org_id = ? AND user_id = ? AND created_at >= ?").get(user.org_id, user.id, since.replace("T", " ").slice(0, 19)) as { n: number }).n;
  const fl = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(duration_min),0) m FROM flights WHERE pilot_id = ? AND started_at >= ?").get(user.id, since) as { n: number; m: number };
  const recent = db
    .prepare("SELECT id, name, flight_time, status, radius_m FROM briefings WHERE org_id = ? AND (user_id = ? OR shared = 1) ORDER BY created_at DESC LIMIT 6")
    .all(user.org_id, user.id) as { id: string; name: string; flight_time: string; status: string; radius_m: number }[];
  const due = dueMaintenance(user.org_id);
  const classes: string[] = JSON.parse(user.license_classes || "[]");
  const daysLeft = user.license_expiry ? Math.round((new Date(user.license_expiry).getTime() - Date.now()) / 864e5) : null;
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "numeric" }).format(new Date()));
  const greet = hour < 10 ? "God morgon" : hour < 18 ? "Hej" : "God kväll";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greet}, {user.first_name || "pilot"}</h1>
          <p className="muted" style={{ margin: 0 }}>Översikt över de senaste 30 dagarna</p>
        </div>
        <Link href="/briefings/new" className="btn">＋ Ny briefing</Link>
      </div>

      <div className="grid g3">
        <div className="card stat"><span className="label">Briefingar</span><span className="value">{nBrief}</span></div>
        <div className="card stat"><span className="label">Flygtid</span><span className="value">{fmtMinutes(fl.m)}</span></div>
        <div className="card stat"><span className="label">Flygningar</span><span className="value">{fl.n}</span></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr", marginTop: 16 }}>
        <div className="card">
          <div className="spread"><h2>Senaste briefingar</h2><Link href="/briefings" className="small">Visa alla</Link></div>
          {recent.length === 0 ? (
            <div className="empty">Inga briefingar än. <Link href="/briefings/new">Skapa din första</Link>.</div>
          ) : (
            <div className="grid g2">
              {recent.map((b) => (
                <Link key={b.id} href={`/briefings/${b.id}`} className="card" style={{ padding: 12, color: "inherit" }}>
                  <div className="spread"><strong>{b.name}</strong><span className={`badge ${STATUS_LABEL[b.status]?.cls}`}>{STATUS_LABEL[b.status]?.text}</span></div>
                  <div className="small muted">{fmtDateTime(b.flight_time)} · {(b.radius_m / 1000).toFixed(1)} km</div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="card">
            <h2>Drönarkort</h2>
            {user.license_expiry ? (
              <>
                <div className={`badge ${daysLeft !== null && daysLeft < 60 ? "b-warn" : "b-ok"}`}>Giltigt till {fmtDate(user.license_expiry)}</div>
                <p className="small muted">{daysLeft} dagar kvar · {classes.join(", ") || "Inga behörigheter angivna"}</p>
              </>
            ) : (
              <p className="small muted">Inget drönarkort angivet. <Link href="/settings">Lägg till</Link></p>
            )}
          </div>
          <div className="card">
            <h2>Underhåll</h2>
            {due.length === 0 ? <p className="small muted">Inget förfallet eller nära förfall.</p> : (
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                {due.map((d) => (
                  <li key={d.schedule.id}>
                    <Link href={`/fleet/${d.drone.id}`}>{d.drone.name}</Link>: {d.schedule.name}{" "}
                    <span className={`badge ${d.status.overdue ? "b-danger" : "b-warn"}`}>{d.status.overdue ? "Förfallen" : "Snart"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
