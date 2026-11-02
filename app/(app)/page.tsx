import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import { dueMaintenance } from "@/lib/fleet";
import { fmtDateTime, fmtMinutes, fmtDate, fmtTime, STATUS_LABEL } from "@/lib/format";
import type { BriefingResult } from "@/lib/briefing";
import { Drone, ProgressRing } from "@/components/Drone";

const TONE: Record<string, string> = { OK: "tone-ok", CAUTION: "tone-warn", PERMISSION: "tone-danger", INCOMPLETE: "tone-danger" };
const HEADLINE: Record<string, string> = {
  OK: "Klart att flyga",
  CAUTION: "Flyg med försiktighet",
  PERMISSION: "Tillstånd krävs",
  INCOMPLETE: "Ofullständigt underlag",
};

export default async function Dashboard() {
  const user = await requireUser();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const sinceSql = since.replace("T", " ").slice(0, 19);
  const nBrief = (db.prepare("SELECT COUNT(*) n FROM briefings WHERE org_id = ? AND user_id = ? AND created_at >= ?").get(user.org_id, user.id, sinceSql) as { n: number }).n;
  const fl = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(duration_min),0) m FROM flights WHERE pilot_id = ? AND started_at >= ?").get(user.id, since) as { n: number; m: number };
  const recent = db
    .prepare("SELECT id, name, flight_time, status, radius_m FROM briefings WHERE org_id = ? AND (user_id = ? OR shared = 1) ORDER BY created_at DESC LIMIT 5")
    .all(user.org_id, user.id) as { id: string; name: string; flight_time: string; status: string; radius_m: number }[];
  const latestRow = recent[0]
    ? (db.prepare("SELECT result FROM briefings WHERE id = ?").get(recent[0].id) as { result: string } | undefined)
    : undefined;
  const latest = latestRow ? safeJson<BriefingResult | null>(latestRow.result, null) : null;

  // briefingar per vecka, fem veckor bakåt (äldst först)
  const weekly = [0, 0, 0, 0, 0];
  const created = db
    .prepare("SELECT created_at FROM briefings WHERE org_id = ? AND user_id = ? AND created_at >= ?")
    .all(user.org_id, user.id, new Date(Date.now() - 35 * 864e5).toISOString().replace("T", " ").slice(0, 19)) as { created_at: string }[];
  for (const c of created) {
    const age = Math.floor((Date.now() - new Date(c.created_at.replace(" ", "T") + "Z").getTime()) / (7 * 864e5));
    if (age >= 0 && age < 5) weekly[4 - age]++;
  }
  const maxWeek = Math.max(1, ...weekly);

  const due = dueMaintenance(user.org_id);
  const classes = safeJson<string[]>(user.license_classes, []);
  const daysLeft = user.license_expiry ? Math.round((new Date(user.license_expiry).getTime() - Date.now()) / 864e5) : null;
  const licTone = daysLeft === null ? "var(--muted)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 60 ? "var(--warn)" : "var(--accent)";
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "numeric" }).format(new Date()));
  const greet = hour < 10 ? "God morgon" : hour < 18 ? "Hej" : "God kväll";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());

  const windNow = latest ? (latest.weather.windProfile[0]?.w10 ?? latest.weather.atStart?.wind ?? null) : null;
  const affected = latest ? latest.hits.filter((h) => h.severity !== "info").length : 0;

  return (
    <>
      <div className="page-head fk-rise">
        <div>
          <div className="eyebrow">{today}</div>
          <h1>{greet}, {user.first_name || "pilot"}</h1>
        </div>
        <div className="row">
          <Link href="/logbook/new" className="btn secondary">Logga flygning</Link>
          <Link href="/briefings/new" className="btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle className="rotor" cx="12" cy="12" r="9" strokeDasharray="4 4" /><path d="M12 8v8M8 12h8" /></svg>
            Ny briefing
          </Link>
        </div>
      </div>

      {daysLeft !== null && daysLeft < 0 && (
        <div className="notice n-danger fk-rise" style={{ marginBottom: 16 }}>
          <strong>Ditt drönarkort har gått ut ({fmtDate(user.license_expiry!)})</strong>
          Förnya det hos Transportstyrelsen innan du flyger i öppen kategori.
        </div>
      )}
      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 && (
        <div className="notice n-warn fk-rise" style={{ marginBottom: 16 }}>
          <strong>Ditt drönarkort går ut om {daysLeft} dagar</strong>
          Utgångsdatum {fmtDate(user.license_expiry!)}. Kom ihåg att förnya i tid.
        </div>
      )}

      <section aria-label="Senaste briefingen" className="hero fk-rise" style={{ ["--i" as string]: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginBottom: 20 }}>
        <div className="grid-bg hero-art" style={{ position: "relative", minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="100%" height="100%" viewBox="0 0 520 300" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            <path className="fk-path" d="M-20 250 C 120 200, 160 120, 260 140 S 430 90, 560 40" stroke="#3d8bff" strokeOpacity=".6" strokeWidth="2" fill="none" />
          </svg>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <Drone width={210} />
            <div className="fk-shadow" style={{ width: 130, height: 12, borderRadius: "50%", background: "#3d8bff33", filter: "blur(4px)" }} />
          </div>
        </div>
        {latest && recent[0] ? (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 18, justifyContent: "center" }}>
            <div className={`row ${TONE[latest.status] ?? "tone-info"}`} style={{ gap: 12, flexWrap: "nowrap" }}>
              <span className="status-dot" aria-hidden="true" />
              <span className="eyebrow" style={{ color: "var(--tone)" }}>{STATUS_LABEL[latest.status]?.text} · {recent[0].name}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.15 }}>{HEADLINE[latest.status] ?? "Senaste briefingen"}</h2>
            <p style={{ margin: 0, color: "#b8bec7", maxWidth: "46ch" }}>
              {affected ? `${affected} område(n) berör flygningen.` : `Inga överlappande zoner inom ${latest.radius_m} m.`} Giltig {fmtDateTime(latest.from)}–{fmtTime(latest.to)}.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div className="chip"><span className="k">Vind 10 m</span><span className="v">{windNow !== null ? windNow.toFixed(1).replace(".", ",") : "–"}<small> m/s</small></span></div>
              <div className="chip"><span className="k">Kp-index</span><span className="v">{latest.kp ? latest.kp.kp : "–"}</span></div>
              <div className="chip"><span className="k">Max höjd</span><span className="v">{latest.maxHeight.m}<small> m</small></span></div>
            </div>
            <div className="row">
              <Link href={`/briefings/${recent[0].id}`} className="btn small">Öppna briefingen</Link>
            </div>
          </div>
        ) : (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
            <span className="eyebrow" style={{ color: "#3d8bff" }}>Redo för start</span>
            <h2 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.15 }}>Skapa din första briefing</h2>
            <p style={{ margin: 0, color: "#b8bec7", maxWidth: "46ch" }}>Luftrum, NOTAM, UAS-zoner, väder och skyddade områden för platsen – på några sekunder.</p>
            <div className="row"><Link href="/briefings/new" className="btn">Ny briefing</Link></div>
          </div>
        )}
      </section>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="card stat fk-rise" style={{ ["--i" as string]: 2 }}>
          <span className="label">Briefingar · 30 dagar</span>
          <div className="spread" style={{ alignItems: "flex-end" }}>
            <span className="value">{nBrief}</span>
            <span aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 40 }}>
              {weekly.map((n, i) => (
                <span key={i} className="fk-bar" style={{ animationDelay: `${0.3 + i * 0.06}s`, width: 6, height: `${Math.max(8, (n / maxWeek) * 100)}%`, borderRadius: 3, background: `color-mix(in srgb, var(--accent) ${40 + i * 15}%, transparent)` }} />
              ))}
            </span>
          </div>
        </div>
        <div className="card stat fk-rise" style={{ ["--i" as string]: 3 }}><span className="label">Flygtid · 30 dagar</span><span className="value">{fmtMinutes(fl.m)}</span></div>
        <div className="card stat fk-rise" style={{ ["--i" as string]: 4 }}><span className="label">Flygningar · 30 dagar</span><span className="value">{fl.n}</span></div>
        <div className="card fk-rise" style={{ ["--i" as string]: 5, display: "flex", alignItems: "center", gap: 16 }}>
          <ProgressRing
            value={daysLeft === null ? 0 : daysLeft / 1825}
            tone={licTone}
            label={daysLeft === null ? "Drönarkort saknas" : `Drönarkort: ${daysLeft} dagar kvar`}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="small muted">Drönarkort {classes.join(" · ")}</span>
            {user.license_expiry ? (
              <span style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 600 }}>
                {daysLeft! < 0 ? "Utgånget" : `${daysLeft} dagar kvar`}
              </span>
            ) : (
              <Link href="/settings">Lägg till kort</Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", marginTop: 16, alignItems: "start" }}>
        <div className="card fk-rise" style={{ ["--i" as string]: 6 }}>
          <div className="spread"><h2>Senaste briefingar</h2><Link href="/briefings" className="small">Visa alla</Link></div>
          {recent.length === 0 ? (
            <div className="empty">Inga briefingar än. <Link href="/briefings/new">Skapa din första</Link>.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recent.map((b) => (
                <Link key={b.id} href={`/briefings/${b.id}`} className={`card brief-row ${TONE[b.status] ?? ""}`} style={{ padding: 14, margin: 0 }}>
                  <span className="radar-chip" aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</strong>
                    <span className="small muted">{fmtDateTime(b.flight_time)} · {b.radius_m >= 1000 ? `${(b.radius_m / 1000).toFixed(1).replace(".", ",")} km` : `${b.radius_m} m`}</span>
                  </span>
                  <span className={`badge ${STATUS_LABEL[b.status]?.cls}`}>{STATUS_LABEL[b.status]?.text}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card fk-rise" style={{ ["--i" as string]: 7 }}>
          <div className="spread"><h2>Underhåll</h2><Link href="/fleet" className="small">Flottan</Link></div>
          {due.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Inget förfallet eller nära förfall.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {due.map((d) => {
                const tone = d.status.overdue ? "tone-danger" : "tone-warn";
                const left = d.status.overdue
                  ? "förfallen"
                  : d.status.hoursLeft !== null && (d.status.daysLeft === null || d.status.hoursLeft < d.status.daysLeft)
                    ? `${d.status.hoursLeft.toFixed(1).replace(".", ",")} h kvar`
                    : `${Math.ceil(d.status.daysLeft ?? 0)} dagar kvar`;
                return (
                  <div key={d.schedule.id} className={tone} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="spread small">
                      <span><Link href={`/fleet/${d.drone.id}`}>{d.drone.name}</Link> · {d.schedule.name}</span>
                      <span className="mono" style={{ color: "var(--tone)" }}>{left}</span>
                    </div>
                    <div className="meter"><i style={{ width: d.status.overdue ? "100%" : "85%" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
