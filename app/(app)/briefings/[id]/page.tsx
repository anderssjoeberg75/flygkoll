import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import { assessSources, type BriefingResult } from "@/lib/briefing";
import { fmtDateTime, fmtTime, STATUS_LABEL, SEVERITY_LABEL, compass } from "@/lib/format";
import { GeoMap } from "@/components/GeoMap";
import { WindProfile } from "@/components/WindProfile";
import { PrintButton } from "@/components/PrintButton";
import { AffectedAreasTable } from "@/components/AffectedAreasTable";
import { StatusRing } from "@/components/StatusRing";
import { rerunBriefing, toggleShare, renameBriefing } from "../actions";
import { zoneFromBriefing } from "../../settings/actions";

export default async function BriefingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ limit?: string }> }) {
  const { id } = await params;
  const limited = (await searchParams)?.limit === "1";
  const user = await requireUser();
  const row = db
    .prepare("SELECT * FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR shared = 1)")
    .get(id, user.org_id, user.id) as { id: string; name: string; user_id: string; drone_id: string | null; shared: number; result: string; created_at: string } | undefined;
  if (!row) notFound();
  const r = safeJson<BriefingResult | null>(row.result, null);
  if (!r) throw new Error("Briefingens data är skadad och kan inte visas. Skapa en ny briefing för platsen.");
  const st = STATUS_LABEL[r.status];
  const w = r.weather.atStart;
  const wp0 = r.weather.windProfile[0];
  const windVal = wp0?.w10 ?? w?.wind ?? null;
  const windCls = windVal === null ? "" : windVal >= user.wind_red ? "danger" : windVal >= user.wind_yellow ? "warn" : "ok";
  const permission = r.hits.filter((h) => h.severity !== "info");
  const info = r.hits.filter((h) => h.severity === "info");
  const lfvSources = r.sources.filter((s) => s.group === "LFV");
  const otherSources = r.sources.filter((s) => s.group !== "LFV");
  const isOwner = row.user_id === user.id;
  const missingCritical = assessSources(r.sources).critical;
  const backgroundPending = r.sources.some((s) => (s.key === "nr" || s.key === "n2k") && !s.ok && s.error?.includes("bakgrunden"));

  return (
    <>
      <div className="page-head fk-rise">
        <div className="row" style={{ gap: 20, flexWrap: "nowrap", alignItems: "center" }}>
          <StatusRing status={r.status} label={st.text} />
          <div>
            <div className="eyebrow" style={{ color: `var(--${r.status === "OK" ? "ok" : r.status === "CAUTION" ? "warn" : "danger"})` }}>
              {st.text}{permission.length ? ` · ${permission.length} område(n) berör flygningen` : ""}
            </div>
            <h1>{row.name}</h1>
            <div className="muted small">
              Giltig {fmtDateTime(r.from)} – {fmtTime(r.to)} · radie {r.radius_m} m · {r.center[1].toFixed(5)}, {r.center[0].toFixed(5)} · <span className="mono">{row.id}</span>
            </div>
          </div>
        </div>
        <div className="row no-print" style={{ flexWrap: "wrap" }}>
          <Link href={`/checklists?briefing=${row.id}&drone=${row.drone_id || ""}`} className="btn secondary small">Kör checklista</Link>
          <Link href={`/logbook/new?briefing=${row.id}`} className="btn small">Logga flygning</Link>
          <a className="btn secondary small" href={`/api/briefings/${row.id}/kml`}>Exportera KML</a>
          <PrintButton />
          <form action={rerunBriefing.bind(null, row.id, true)}><button className="btn secondary small">Uppdatera</button></form>
          <form action={rerunBriefing.bind(null, row.id, false)}><button className="btn secondary small">Ny briefing nu</button></form>
        </div>
      </div>

      {backgroundPending && (
        <div className="banner" style={{ background: "var(--info-bg, #eff6ff)", color: "var(--info-fg, #1e40af)", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", border: "1px solid var(--info-border, #93c5fd)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span><strong>Naturvårdsdata hämtas i bakgrunden</strong> (Naturvårdsregistret / Natura 2000). När hämtningen är klar kan du uppdatera briefingen för att inkludera områdena.</span>
          <form action={rerunBriefing.bind(null, row.id, true)} style={{ margin: 0 }}>
            <button className="btn small">Uppdatera data nu</button>
          </form>
        </div>
      )}

      {limited && (
        <div className="notice n-warn" style={{ marginBottom: 16 }}>
          <strong>För många briefingar på kort tid</strong>
          Vänta en stund och försök sedan uppdatera igen.
        </div>
      )}

      {r.status === "INCOMPLETE" && (
        <div className="notice n-danger" style={{ marginBottom: 16 }}>
          <strong>Ofullständigt underlag</strong>
          En eller flera källor svarade inte ({missingCritical.map((s) => s.label).join(", ") || "LFV"}). Flygförbud, restriktioner, skyddade områden eller farligt väder kan föreligga som inte syns i briefingen. Kontrollera alltid AROWeb/Drönarkartan, Skyddad natur och väderprognosen manuellt innan flygning!
        </div>
      )}

      <div className="grid g4 fk-rise" style={{ ["--i" as string]: 1 }}>
        <div className={`card stat ${r.status === "OK" ? "ok" : r.status === "CAUTION" ? "warn" : "danger"}`}>
          <span className="label">Luftrumsstatus</span><span className="value">{st.text}</span>
          <span className="small muted">{permission.length ? `${permission.length} område(n) berör flygningen` : "Inga överlappande zoner"}</span>
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
        <div className="card" id="briefing-map">
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
            {r.warnings.length === 0 ? <p className="small muted">Inga aktiva varningar som påverkar drönarflygning (vind, nederbörd, åska, is, sikt, temperatur) för platsen under flygfönstret +6 h.</p> : r.warnings.map((wa, i) => (
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
                    <span className={`badge ${s.ok ? "b-ok" : "b-danger"}`}>{s.ok ? "OK" : "Fel"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="card no-print stack">
          <h2>Hantera</h2>
          {isOwner && (
            <form action={renameBriefing.bind(null, row.id)} className="row">
              <input name="name" defaultValue={row.name} style={{ flex: 1 }} />
              <button className="btn secondary small">Byt namn</button>
            </form>
          )}
          {isOwner && (
            <form action={toggleShare.bind(null, row.id)} className="spread">
              <span className="small">{row.shared ? "Delad med organisationen" : "Privat"}</span>
              <button className="btn secondary small">{row.shared ? "Gör privat" : "Dela med org"}</button>
            </form>
          )}
          <Link className="btn secondary small" href={`/logbook/new?briefing=${row.id}`}>Logga flygning från briefingen</Link>
          <form action={zoneFromBriefing.bind(null, row.id)}><button className="btn secondary small" style={{ width: "100%" }}>Spara som standardzon</button></form>
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
