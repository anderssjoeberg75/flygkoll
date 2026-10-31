import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, displayName } from "@/lib/auth";
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
  const track = f.track ? (JSON.parse(f.track) as TrackPoint[]) : [];
  const t0 = track[0]?.t ?? 0;
  const canEdit = f.pilot_id === user.id || user.role === "admin";

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
        <div className="card">
          <h2>Anteckningar</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{f.notes || <span className="muted">–</span>}</p>
          {f.briefing_id && <Link href={`/briefings/${f.briefing_id}`} className="small">Visa briefingen</Link>}
        </div>
      </div>
    </>
  );
}
