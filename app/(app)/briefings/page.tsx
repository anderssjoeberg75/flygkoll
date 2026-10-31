import Link from "next/link";
import { requireUser, displayName } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime, STATUS_LABEL } from "@/lib/format";
import { deleteBriefing } from "./actions";

type Row = { id: string; name: string; flight_time: string; status: string; radius_m: number; user_id: string; shared: number; first_name: string; last_name: string; email: string; created_at: string };

export default async function Briefings({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const user = await requireUser();
  const { q = "", scope = "mine" } = await searchParams;
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.flight_time, b.status, b.radius_m, b.user_id, b.shared, b.created_at, u.first_name, u.last_name, u.email
       FROM briefings b JOIN users u ON u.id = b.user_id
       WHERE b.org_id = ? AND ${scope === "org" ? "(b.user_id = ? OR b.shared = 1)" : "b.user_id = ?"}
       AND (b.name LIKE ? OR b.status LIKE ? OR b.id LIKE ?)
       ORDER BY b.created_at DESC LIMIT 300`
    )
    .all(user.org_id, user.id, like, like, like) as Row[];
  return (
    <>
      <div className="page-head">
        <div><h1>Briefingar</h1><p className="muted" style={{ margin: 0 }}>Sparade briefingar. Öppna, uppdatera eller ta bort.</p></div>
        <Link href="/briefings/new" className="btn">＋ Ny briefing</Link>
      </div>
      <div className="card">
        <form className="row" style={{ marginBottom: 12 }}>
          <input name="q" defaultValue={q} placeholder="Sök på plats, status eller ID…" style={{ flex: 1, minWidth: 220 }} />
          <select name="scope" defaultValue={scope} style={{ width: "auto" }}>
            <option value="mine">Mina</option>
            <option value="org">Hela organisationen</option>
          </select>
          <button className="btn secondary">Filtrera</button>
        </form>
        {rows.length === 0 ? <div className="empty">Inga briefingar hittades.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Plats</th><th>Flygtid</th><th>Radie</th><th>Status</th>{scope === "org" && <th>Pilot</th>}<th></th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/briefings/${b.id}`}><strong>{b.name}</strong></Link><div className="small muted mono">{b.id}</div></td>
                    <td>{fmtDateTime(b.flight_time)}</td>
                    <td>{b.radius_m} m</td>
                    <td><span className={`badge ${STATUS_LABEL[b.status]?.cls}`}>{STATUS_LABEL[b.status]?.text}</span></td>
                    {scope === "org" && <td className="small">{displayName(b)}</td>}
                    <td>
                      {(b.user_id === user.id || user.role === "admin") && (
                        <form action={deleteBriefing.bind(null, b.id)}><button className="btn danger small">Ta bort</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
