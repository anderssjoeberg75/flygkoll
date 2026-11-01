import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canWrite, displayName } from "@/lib/auth";
import { db } from "@/lib/db";
import type { BriefingResult } from "@/lib/briefing";
import { fmtDateTime, fmtTime, STATUS_LABEL, compass } from "@/lib/format";
import { GeoMap } from "@/components/GeoMap";
import { WindProfile } from "@/components/WindProfile";
import { PrintButton } from "@/components/PrintButton";
import { AffectedAreasTable } from "@/components/AffectedAreasTable";
import { NatureRefresher } from "@/components/NatureRefresher";
import { rerunBriefing, toggleShare, renameBriefing } from "../actions";
import { zoneFromBriefing } from "../../settings/actions";

export default async function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const row = db
    .prepare("SELECT * FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR shared = 1)")
    .get(id, user.org_id, user.id) as { id: string; name: string; user_id: string; shared: number; result: string; created_at: string } | undefined;
  if (!row) notFound();
  const r = JSON.parse(row.result) as BriefingResult;
  const st = STATUS_LABEL[r.status];
  const w = r.weather.atStart;
  const wp0 = r.weather.windProfile[0];
  const windVal = wp0?.w10 ?? w?.wind ?? null;
  const windCls = windVal === null ? "" : windVal >= user.wind_red ? "danger" : windVal >= user.wind_yellow ? "warn" : "ok";
  const permission = r.hits.filter((h) => h.severity !== "info");
  const lfvSources = r.sources.filter((s) => s.group === "LFV");
  const otherSources = r.sources.filter((s) => s.group !== "LFV");
  const isOwner = row.user_id === user.id;
  const failedLfv = lfvSources.filter((s) => !s.ok);
  // checklistor före flygning – drönarspecifika först – och genomgångar som gjorts för briefingen
  const preflight = db
    .prepare("SELECT id, name, drone_id FROM checklists WHERE org_id = ? AND kind = 'preflight' AND (drone_id IS NULL OR drone_id = ?) ORDER BY drone_id IS NULL, name")
    .all(user.org_id, r.drone?.id ?? null) as { id: string; name: string; drone_id: string | null }[];
  const runs = db
    .prepare(
      `SELECT r.id, r.created_at, r.completed, r.flight_id, c.name, u.first_name, u.last_name, u.email
       FROM checklist_runs r JOIN checklists c ON c.id = r.checklist_id JOIN users u ON u.id = r.user_id
       WHERE r.briefing_id = ? AND c.org_id = ? ORDER BY r.created_at`
    )
    .all(row.id, user.org_id) as { id: string; created_at: string; completed: number; flight_id: string | null; name: string; first_name: string; last_name: string; email: string }[];
  const flights = db.prepare("SELECT id, started_at FROM flights WHERE briefing_id = ? AND org_id = ? ORDER BY started_at").all(row.id, user.org_id) as { id: string; started_at: string }[];
  const writer = canWrite(user);
  const naturePending = r.sources.some((s) => (s.key === "nr" || s.key === "n2k") && !s.ok && (s.pending || s.error?.startsWith("Stort område")));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row small muted"><span className="badge b-info">Briefing</span> <span className="mono">{row.id}</span> · Skapad {fmtDateTime(r.generatedAt)}</div>
          <h1>{row.name}</h1>
          <div className="row">
            <span className={`badge ${st.cls}`}>{st.text}</span>
            <span className="muted">Giltig {fmtDateTime(r.from)} – {fmtTime(r.to)} · radie {r.radius_m} m · {r.center[1].toFixed(5)}, {r.center[0].toFixed(5)}</span>
          </div>
        </div>
        <div className="row no-print">
          <a className="btn secondary small" href={`/api/briefings/${row.id}/kml`}>Exportera KML</a>
          <PrintButton />
          {writer && <form action={rerunBriefing.bind(null, row.id, true)}><button className="btn secondary small">Uppdatera</button></form>}
          {writer && <form action={rerunBriefing.bind(null, row.id, false)}><button className="btn small">Ny briefing nu</button></form>}
        </div>
      </div>

      {failedLfv.length > 0 && (
        <div className="notice n-danger" role="alert" style={{ marginBottom: 16 }}>
          <strong>Luftrumsdata ofullständig – statusen kan inte bedömas säkert</strong>
          Kunde inte hämta: {failedLfv.map((s) => s.label).join(", ")}. Klicka på <em>Uppdatera</em> eller kontrollera Drönarkartan och NOTAM direkt innan flygning.
        </div>
      )}
      {naturePending && <NatureRefresher briefingId={row.id} />}

      <div className="grid g4">
        <div className={`card stat ${r.status === "OK" ? "ok" : r.status === "CAUTION" ? "warn" : "danger"}`}>
          <span className="label">Luftrumsstatus</span><span className="value">{st.text}</span>
          <span className="small muted">{failedLfv.length ? `${failedLfv.length} LFV-källa(or) saknas` : permission.length ? `${permission.length} område(n) berör flygningen` : "Inga överlappande zoner"}</span>
        </div>
        <div className={`card stat ${windCls}`}>
          <span className="label">Vind (10 m)</span>
          <span className="value">{windVal !== null ? `${windVal.toFixed(1)} m/s` : "Saknas"}</span>
          <span className="small muted">{w ? `Byar ${w.gust ?? "–"} m/s ${compass(w.dir)}` : "Prognos ej tillgänglig"}</span>
        </div>
        <div className="card stat"><span className="label">Max flyghöjd</span><span className="value">{r.maxHeight.m} m</span><span className="small muted">{r.maxHeight.reason}</span></div>
        <div className="card stat">
          <span className="label">Molnbas</span>
          <span className="value">{w?.cloudBase !== null && w?.cloudBase !== undefined ? `${Math.round(w.cloudBase)} m` : "–"}</span>
          <span className="small muted">{w ? `${w.temp.toFixed(0)} °C · sikt ${w.vis ?? "–"} km` : ""}</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(260px,1fr)", marginTop: 16, alignItems: "start" }}>
        <div className="card">
          <div className="row small muted" style={{ marginBottom: 8 }}>
            <span>☀ Soluppgång {fmtTime(r.sun.sunrise)}</span>
            <span>☾ Solnedgång {fmtTime(r.sun.sunset)}</span>
            <span>Borgerlig skymning {fmtTime(r.sun.dusk)}</span>
          </div>
          <GeoMap data={r.map} center={r.center} radius={r.radius_m} />
          <p className="small muted">Växla lager med ikonen uppe till höger. TIZ och Natura 2000 är dolda som standard.</p>
        </div>
        <div className="stack">
          <div className="card stack">
            <h2>Driftmeddelanden</h2>
            {r.notices.map((n, i) => (
              <div key={i} className={`notice n-${n.level}`}><strong>{n.title}</strong>{n.text}</div>
            ))}
            <div className="small muted">
              Kp-index: {r.kp ? `${r.kp.kp} (${r.kp.kind === "observed" ? "observerat" : "prognos"})` : "ej tillgängligt"}<br />
              GPS-störning: {r.gnss ? `${r.gnss.level} (${r.gnss.pct} %, ${r.gnss.aircraft} flygplan, ${r.gnss.date})` : "ej tillgänglig"}
            </div>
          </div>
          <div className="card">
            <h2>Vädervarningar (SMHI)</h2>
            {r.warnings.length === 0 ? <p className="small muted">Inga aktiva varningar för platsen under flygfönstret +6 h.</p> : r.warnings.map((wa, i) => (
              <details key={i} className={`notice ${wa.levelCode === "MESSAGE" ? "n-info" : wa.levelCode === "YELLOW" ? "n-warn" : "n-danger"}`} style={{ marginBottom: 8 }}>
                <summary><strong style={{ display: "inline" }}>{wa.area}: {wa.level}</strong> – {wa.description}</summary>
                {wa.details.map((d, j) => <p key={j} className="small"><strong>{d.title}</strong>{d.text}</p>)}
              </details>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2>Berörda områden</h2>
          <span className="small muted">Skyddsobjekt ingår inte – kontrollera separat.</span>
        </div>
        <AffectedAreasTable hits={r.hits} />
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <div className="card">
          <h2>Drönare & regler</h2>
          {r.drone ? (
            <p style={{ marginTop: 0 }}>
              <strong>{r.drone.name}</strong> {r.drone.model && <span className="muted">({r.drone.model})</span>}<br />
              <span className="small muted">{r.drone.mtom_g} g MTOM · klass {r.drone.class_mark === "none" ? "ingen" : r.drone.class_mark}</span>
            </p>
          ) : <p className="small muted">Ingen drönare vald.</p>}
          <div className="row"><span className="badge b-info">{r.droneRules.subcategory}</span><span className="small muted">{r.droneRules.license}</span></div>
          <ul className="small">{r.droneRules.rules.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="card">
          <h2>NOTAM i närheten</h2>
          {r.notams.length === 0 ? <p className="small muted">Inga NOTAM inom ca 10 km under flygfönstret.</p> : (
            <div className="stack" style={{ maxHeight: 360, overflowY: "auto" }}>
              {r.notams.map((n) => (
                <details key={n.id} className={`notice ${n.isArea ? "n-warn" : "n-info"}`}>
                  <summary>
                    <strong style={{ display: "inline" }}>{n.id}</strong> {n.location}{" "}
                    <span className="small muted">{n.distanceKm !== null ? `${n.distanceKm} km` : ""}</span>
                  </summary>
                  <p className="small" style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
                  <p className="small muted">{fmtDateTime(n.from)} – {fmtDateTime(n.to)}</p>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Vindprofil</h2>
        <WindProfile rows={r.weather.windProfile} yellow={user.wind_yellow} red={user.wind_red} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Väderprognos (SMHI)</h2>
        {r.weather.hours.length === 0 ? <p className="small muted">Ingen prognos för vald tid.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tid</th><th>Temp</th><th>Vind</th><th>Byar</th><th>Molnbas</th><th>Moln</th><th>Sikt</th><th>Nederbörd</th><th>Åska</th></tr></thead>
              <tbody>
                {r.weather.hours.slice(0, 24).map((h) => (
                  <tr key={h.time}>
                    <td>{fmtDateTime(h.time)}</td>
                    <td>{h.temp.toFixed(1)} °C</td>
                    <td>{h.wind ?? "–"} m/s {compass(h.dir)}</td>
                    <td>{h.gust ?? "–"}</td>
                    <td>{h.cloudBase !== null ? `${Math.round(h.cloudBase)} m` : "–"}</td>
                    <td>{h.cloud !== null ? `${h.cloud}/8` : "–"}</td>
                    <td>{h.vis ?? "–"} km</td>
                    <td>{h.precip ?? 0} mm</td>
                    <td>{h.thunder ?? 0} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <div className="card">
          <h2>Datakällor</h2>
          <div className="grid g2 small">
            {[{ t: "LFV", s: lfvSources }, { t: "Övrigt", s: otherSources }].map((grp) => (
              <div key={grp.t}>
                <h3>{grp.t}</h3>
                {grp.s.map((s) => (
                  <div key={s.key} className="spread" title={s.error}>
                    <span>{s.label}</span>
                    <span className={`badge ${s.ok ? "b-ok" : s.pending ? "b-warn" : "b-danger"}`}>{s.ok ? "OK" : s.pending ? "Laddar" : "Fel"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="card no-print stack">
          <h2>Hantera</h2>
          {isOwner && writer && (
            <form action={renameBriefing.bind(null, row.id)} className="row">
              <input name="name" defaultValue={row.name} style={{ flex: 1 }} />
              <button className="btn secondary small">Byt namn</button>
            </form>
          )}
          {isOwner && writer && (
            <form action={toggleShare.bind(null, row.id)} className="spread">
              <span className="small">{row.shared ? "Delad med organisationen" : "Privat"}</span>
              <button className="btn secondary small">{row.shared ? "Gör privat" : "Dela med org"}</button>
            </form>
          )}
          <h3 style={{ margin: 0 }}>Inför flygningen</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Checklista före flygning:{" "}
              {runs.length ? (
                runs.map((x) => (
                  <span key={x.id} className={`badge ${x.completed ? "b-ok" : "b-warn"}`} title={`${displayName(x)} ${fmtDateTime(x.created_at.replace(" ", "T") + "Z")}`}>
                    {x.name}: {x.completed ? "klar" : "delvis"}
                  </span>
                ))
              ) : (
                <span className="muted">ingen genomförd än</span>
              )}
            </li>
            <li>
              Loggad flygning:{" "}
              {flights.length ? flights.map((f) => <Link key={f.id} href={`/logbook/${f.id}`}>{fmtDateTime(f.started_at)} </Link>) : <span className="muted">ingen än</span>}
            </li>
          </ol>
          {writer && preflight.map((c) => (
            <Link key={c.id} className="btn secondary small" href={`/checklists/${c.id}?briefing=${row.id}`}>Kör checklista: {c.name}</Link>
          ))}
          {writer && <Link className="btn secondary small" href={`/logbook/new?briefing=${row.id}`}>Logga flygning från briefingen</Link>}
          {writer && <form action={zoneFromBriefing.bind(null, row.id)}><button className="btn secondary small" style={{ width: "100%" }}>Spara som standardzon</button></form>}
        </div>
      </div>

      <div className="card small muted" style={{ marginTop: 16 }}>
        <strong>Ansvarsfriskrivning.</strong> Briefingen är ett beslutsstöd och ersätter inte officiella källor eller tillstånd. Fjärrpiloten ansvarar
        för att flygningen följer gällande regler, behörighet (A1/A3, A2, STS) och eventuella tillstånd. Data hämtas från LFV, SMHI, Naturvårdsverket,
        NOAA SWPC, GPSJam och Open-Meteo och kan vara fördröjd. Kontrollera alltid AROWeb/Drönarkartan före flygning.
      </div>
    </>
  );
}
