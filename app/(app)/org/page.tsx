import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import { disabledMembers, orgMembers } from "@/lib/members";
import { fmtMinutes } from "@/lib/format";
import { StateForm } from "@/components/StateForm";
import { saveOrg, addMember, setRole, removeMember, reactivateMember, addZone, removeZone } from "../settings/actions";

const ROLE: Record<string, string> = { admin: "Administratör", pilot: "Pilot", viewer: "Läsare" };

export default async function Org() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const members = orgMembers(user.org_id);
  const inactive = isAdmin ? disabledMembers(user.org_id) : [];
  const zones = db.prepare("SELECT * FROM zones WHERE org_id = ? ORDER BY name").all(user.org_id) as { id: string; name: string; lat: number; lon: number; radius_m: number }[];

  // analys
  const monthly = db
    .prepare("SELECT substr(created_at,1,7) m, COUNT(*) n FROM briefings WHERE org_id = ? AND created_at >= date('now','-12 months') GROUP BY m ORDER BY m")
    .all(user.org_id) as { m: string; n: number }[];
  // platsnamn visas bara från egna och delade briefingar – privata namn ska inte läcka (#36)
  const places = db
    .prepare("SELECT name, COUNT(*) n FROM briefings WHERE org_id = ? AND (user_id = ? OR shared = 1) GROUP BY name ORDER BY n DESC LIMIT 8")
    .all(user.org_id, user.id) as { name: string; n: number }[];
  const statusDist = db
    .prepare("SELECT status, COUNT(*) n FROM briefings WHERE org_id = ? GROUP BY status")
    .all(user.org_id) as { status: string; n: number }[];
  const pilotTime = db
    .prepare("SELECT u.first_name || ' ' || u.last_name AS name, u.email, COALESCE(SUM(f.duration_min),0) m, COUNT(f.id) n FROM users u LEFT JOIN flights f ON f.pilot_id = u.id AND f.type != 'simulator' WHERE u.org_id = ? GROUP BY u.id ORDER BY m DESC")
    .all(user.org_id) as { name: string; email: string; m: number; n: number }[];
  const hours = db
    .prepare("SELECT CAST(strftime('%H', flight_time) AS INTEGER) h, COUNT(*) n FROM briefings WHERE org_id = ? GROUP BY h")
    .all(user.org_id) as { h: number; n: number }[];
  const maxM = Math.max(1, ...monthly.map((x) => x.n));
  const maxH = Math.max(1, ...hours.map((x) => x.n));

  return (
    <>
      <div className="page-head"><div><h1>{user.org_name}</h1><p className="muted" style={{ margin: 0 }}>Organisation, medlemmar, standardzoner och statistik.</p></div></div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        {isAdmin ? (
          <StateForm action={saveOrg}>
            <h2>Inställningar</h2>
            <div><label>Namn</label><input name="name" defaultValue={user.org_name} /></div>
            <div className="row">
              {user.logo_url && <img src={user.logo_url} alt="" width={48} height={48} style={{ borderRadius: 8, objectFit: "contain", background: "var(--panel-2)" }} />}
              <div style={{ flex: 1 }}><label>Logotyp</label><input type="file" name="logo" accept="image/*" /></div>
              {user.logo_url && <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="remove_logo" /> Ta bort</label>}
            </div>
            <h3>Vindgränser (m/s)</h3>
            <div className="grid g2">
              <div><label>Gul från</label><input type="number" step="0.5" name="wind_yellow" defaultValue={user.wind_yellow} /></div>
              <div><label>Röd från</label><input type="number" step="0.5" name="wind_red" defaultValue={user.wind_red} /></div>
            </div>
          </StateForm>
        ) : (
          <div className="card"><h2>Vindgränser</h2><p>Gul från {user.wind_yellow} m/s, röd från {user.wind_red} m/s.</p></div>
        )}

        <div className="card stack">
          <h2>Standardzoner</h2>
          <p className="small muted" style={{ margin: 0 }}>Era vanligaste flygplatser – starta en briefing med ett klick.</p>
          {zones.map((z) => (
            <div key={z.id} className="spread">
              <span><strong>{z.name}</strong> <span className="small muted">{z.radius_m} m</span></span>
              <span className="row">
                <Link className="btn small" href={`/briefings/new?lat=${z.lat}&lon=${z.lon}&r=${z.radius_m}`}>Briefing</Link>
                <form action={removeZone.bind(null, z.id)}><button className="btn danger small">Ta bort</button></form>
              </span>
            </div>
          ))}
          <form action={addZone} className="grid g4" style={{ alignItems: "end" }}>
            <div><label>Namn</label><input name="name" required /></div>
            <div><label>Lat</label><input name="lat" required inputMode="decimal" /></div>
            <div><label>Lon</label><input name="lon" required inputMode="decimal" /></div>
            <div><label>Radie (m)</label><input name="radius" type="number" defaultValue={500} /></div>
            <div><button className="btn secondary small">Lägg till</button></div>
          </form>
          <p className="small muted" style={{ margin: 0 }}>Tips: du kan också spara en zon direkt från en briefing.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Medlemmar</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Namn</th><th>E-post</th><th>Roll</th><th>Drönarkort</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {members.map((m) => {
                const daysLeft = m.license_expiry ? Math.round((new Date(m.license_expiry).getTime() - Date.now()) / 864e5) : null;
                const licClasses = safeJson<string[]>(m.license_classes, []);
                return (
                  <tr key={m.id}>
                    <td className="row">
                      {m.photo ? <img src={m.photo} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} /> : null}
                      {m.name}
                    </td>
                    <td>{m.email}</td>
                    <td>
                      {isAdmin && m.id !== user.id ? (
                        <form action={setRole.bind(null, m.id)} className="row">
                          <select name="role" defaultValue={m.role} style={{ width: "auto" }}>
                            {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <button className="btn secondary small">Spara</button>
                        </form>
                      ) : ROLE[m.role]}
                    </td>
                    <td>
                      {m.license_expiry ? (
                        <div>
                          <span className={`badge ${daysLeft !== null && daysLeft < 0 ? "b-danger" : daysLeft !== null && daysLeft <= 60 ? "b-warn" : "b-ok"}`}>
                            {daysLeft !== null && daysLeft < 0 ? "Utgånget" : `${daysLeft} d`} ({m.license_expiry})
                          </span>
                          {licClasses.length > 0 && <span className="small muted"> {licClasses.join(", ")}</span>}
                        </div>
                      ) : (
                        <span className="muted small">Ej angivet</span>
                      )}
                    </td>
                    {isAdmin && <td>{m.id !== user.id && <form action={removeMember.bind(null, m.id)}><button className="btn danger small">Ta bort</button></form>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {inactive.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Inaktiverade medlemmar</h3>
            <p className="small muted" style={{ margin: 0 }}>Kan inte logga in. Loggbok och historik finns kvar och följer med vid återaktivering.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Namn</th><th>E-post</th><th>Roll</th><th>Inaktiverad</th><th></th></tr></thead>
                <tbody>
                  {inactive.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.email}</td>
                      <td>{ROLE[m.role]}</td>
                      <td className="small">{m.disabled_at.slice(0, 10)}</td>
                      <td><form action={reactivateMember.bind(null, m.id)}><button className="btn secondary small">Återaktivera</button></form></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {isAdmin && (
          <StateForm action={addMember} submit="Lägg till medlem" className="stack" >
            <h3 style={{ marginTop: 16 }}>Lägg till medlem</h3>
            <div className="grid g4">
              <div><label>Förnamn</label><input name="first_name" /></div>
              <div><label>Efternamn</label><input name="last_name" /></div>
              <div><label>E-post</label><input name="email" type="email" required /></div>
              <div><label>Tillfälligt lösenord (minst 10 tecken)</label><input name="password" minLength={10} required /></div>
            </div>
            <div style={{ maxWidth: 240 }}>
              <label>Roll</label>
              <select name="role" defaultValue="pilot">{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
          </StateForm>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <div className="card">
          <h2>Briefingar per månad</h2>
          {monthly.length === 0 ? <p className="small muted">Ingen data än.</p> : (
            <div className="stack">
              {monthly.map((x) => (
                <div key={x.m} className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="small mono" style={{ width: 64 }}>{x.m}</span>
                  <div style={{ flex: 1, background: "var(--panel-2)", borderRadius: 4 }}>
                    <div style={{ width: `${(x.n / maxM) * 100}%`, background: "var(--accent)", height: 14, borderRadius: 4 }} />
                  </div>
                  <span className="small" style={{ width: 28, textAlign: "right" }}>{x.n}</span>
                </div>
              ))}
            </div>
          )}
          <h3 style={{ marginTop: 16 }}>Flygtid på dygnet (UTC)</h3>
          <svg viewBox="0 0 240 60" width="100%" role="img" aria-label="Briefingar per timme">
            {Array.from({ length: 24 }, (_, h) => {
              const n = hours.find((x) => x.h === h)?.n ?? 0;
              const ht = (n / maxH) * 46;
              return <rect key={h} x={h * 10 + 1} y={50 - ht} width={8} height={ht} rx={1} fill="var(--accent)"><title>{`${h}:00 – ${n}`}</title></rect>;
            })}
            <text x={0} y={59} fontSize={7} fill="var(--muted)">00</text>
            <text x={115} y={59} fontSize={7} fill="var(--muted)">12</text>
            <text x={228} y={59} fontSize={7} fill="var(--muted)">23</text>
          </svg>
        </div>
        <div className="card">
          <h2>Vanligaste platser</h2>
          {places.length === 0 ? <p className="small muted">Ingen data än.</p> : (
            <table><tbody>{places.map((p) => <tr key={p.name}><td>{p.name}</td><td style={{ textAlign: "right" }}>{p.n}</td></tr>)}</tbody></table>
          )}
          <h3 style={{ marginTop: 16 }}>Status</h3>
          <div className="row">{statusDist.map((s) => <span key={s.status} className="badge b-muted">{s.status}: {s.n}</span>)}</div>
          <h3 style={{ marginTop: 16 }}>Flygtid per pilot</h3>
          <table><tbody>{pilotTime.map((p) => <tr key={p.email}><td>{p.name.trim() || p.email}</td><td>{p.n} flygningar</td><td style={{ textAlign: "right" }}>{fmtMinutes(p.m)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
