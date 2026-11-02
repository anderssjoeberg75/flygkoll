import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, displayName } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import { fmtDateTime, fmtMinutes } from "@/lib/format";
import { GeoMap } from "@/components/GeoMap";
import { LineChart } from "@/components/LineChart";
import { deleteFlight } from "../actions";
import type { TrackPoint } from "../actions";

const TYPE_LABEL: Record<string, string> = { standard: "Standard", instruction: "Utbildning", simulator: "Simulator" };

type Flight = {
  id: string; pilot_id: string; started_at: string; duration_min: number; location: string; type: string; notes: string; source: string;
  lat: number | null; lon: number | null; max_alt_m: number | null; distance_m: number | null; battery_start: number | null; battery_end: number | null;
  track: string | null; briefing_id: string | null; drone_id: string | null; drone_name: string | null;
  first_name: string; last_name: string; email: string;
};

export default async function FlightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const f = db
    .prepare(
      `SELECT f.*, d.name AS drone_name, u.first_name, u.last_name, u.email FROM flights f
       LEFT JOIN drones d ON d.id = f.drone_id JOIN users u ON u.id = f.pilot_id WHERE f.id = ? AND f.org_id = ?`
    )
    .get(id, user.org_id) as Flight | undefined;
  if (!f) notFound();
  const crew = db.prepare("SELECT role, name FROM flight_crew WHERE flight_id = ?").all(id) as { role: string; name: string }[];
  const track = safeJson<TrackPoint[]>(f.track, []);
  const t0 = track[0]?.t ?? 0;
  const canEdit = f.pilot_id === user.id || user.role === "admin";

  const briefing = f.briefing_id
    ? (db.prepare("SELECT id, name, status, flight_time FROM briefings WHERE id = ?").get(f.briefing_id) as
        | { id: string; name: string; status: string; flight_time: string }
        | undefined)
    : null;
  const checklistRuns = db
    .prepare(
      `SELECT r.*, c.name AS checklist_name
       FROM checklist_runs r
       JOIN checklists c ON c.id = r.checklist_id
       WHERE r.flight_id = ? OR (r.briefing_id IS NOT NULL AND r.briefing_id = ?)
       ORDER BY r.created_at DESC`
    )
    .all(id, f.briefing_id ?? "") as { id: string; checklist_name: string; completed: number; checked: string; created_at: string }[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{f.location || "Flygning"} · {fmtDateTime(f.started_at)}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {displayName(f)} · {TYPE_LABEL[f.type]} · {f.drone_id ? <Link href={`/fleet/${f.drone_id}`}>{f.drone_name}</Link> : "ingen drönare"}
          </p>
        </div>
        {canEdit && (
          <div className="row">
            <Link className="btn secondary small" href={`/logbook/${f.id}/edit`}>Redigera</Link>
            <form action={deleteFlight.bind(null, f.id)}><button className="btn danger small">Ta bort</button></form>
          </div>
        )}
      </div>
      <div className="grid g4">
        <div className="card stat"><span className="label">Flygtid</span><span className="value">{fmtMinutes(f.duration_min)}</span></div>
        <div className="card stat"><span className="label">Max höjd</span><span className="value">{f.max_alt_m != null ? `${Math.round(f.max_alt_m)} m` : "–"}</span></div>
        <div className="card stat"><span className="label">Distans</span><span className="value">{f.distance_m != null ? `${(f.distance_m / 1000).toFixed(2)} km` : "–"}</span></div>
        <div className="card stat"><span className="label">Batteri</span><span className="value">{f.battery_start != null ? `${f.battery_start} → ${f.battery_end} %` : "–"}</span></div>
      </div>
      {track.length > 1 && (
        <>
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Flygspår</h2>
            <GeoMap track={track.map((p) => [p.lat, p.lon] as [number, number])} />
          </div>
          <div className="card">
            <h2>Höjd och batteri</h2>
            <LineChart
              x={track.map((p) => (p.t - t0) / 60000)}
              series={[
                { name: "Batteri", color: "#0f766e", unit: "%", values: track.map((p) => p.bat) },
                { name: "Höjd", color: "#e11d48", unit: " m", values: track.map((p) => (p.alt === null ? null : Math.round(p.alt))) },
              ]}
            />
          </div>
        </>
      )}
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Besättning</h2>
          {crew.length === 0 ? <p className="small muted">Ingen besättning angiven.</p> : (
            <ul>{crew.map((c, i) => <li key={i}><strong>{c.role}:</strong> {c.name}</li>)}</ul>
          )}
        </div>
        <div className="card stack">
          <h2>Underlag & Anteckningar</h2>
          {briefing && (
            <div className="card" style={{ padding: 12, background: "var(--panel-2)" }}>
              <div className="spread">
                <strong>Briefing: <Link href={`/briefings/${briefing.id}`}>{briefing.name}</Link></strong>
                <span className={`badge ${briefing.status === "OK" ? "b-ok" : briefing.status === "CAUTION" ? "b-warn" : "b-danger"}`}>
                  {briefing.status}
                </span>
              </div>
            </div>
          )}
          {checklistRuns.length > 0 && (
            <div>
              <label>Genomförda checklistor</label>
              <ul className="small" style={{ paddingLeft: 18, margin: "4px 0" }}>
                {checklistRuns.map((r) => (
                  <li key={r.id}>
                    {r.checklist_name}: <span className={`badge ${r.completed ? "b-ok" : "b-warn"}`}>{r.completed ? "Genomförd" : "Delvis"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ whiteSpace: "pre-wrap" }}>{f.notes || <span className="muted">Inga anteckningar.</span>}</p>
        </div>
      </div>
    </>
  );
}
