"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { importCsv, importTrack, type ImportState, type TrackPoint } from "@/app/(app)/logbook/actions";
import { thinTrack } from "@/lib/validate";

/** Tolerant tolkning av flyglogg-CSV (Airdata, PhantomHelp/DJI Flight Log Viewer, FlightReader, Litchi m.fl.) */
function parseFlightCsv(text: string): { points: TrackPoint[]; startedAt: string | null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  // hoppa över eventuella "sep="-rader eller metadata före rubrikraden
  const hi = lines.findIndex((l) => /lat/i.test(l) && /lon|lng/i.test(l));
  if (hi < 0) throw new Error("Hittar ingen rubrikrad med latitud/longitud.");
  const sep = (lines[hi].match(/;/g)?.length ?? 0) > (lines[hi].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = lines[hi].split(sep).map((h) => h.trim().replace(/"/g, "").toLowerCase());
  const find = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const cLat = find(/(^|\.)lat(itude)?\b|latitude/, /home|rc|app|takeoff/);
  const cLon = find(/(^|\.)(lon|lng)(gitude)?\b|longitude/, /home|rc|app|takeoff/);
  const cAlt = find(/height|altitude|alt\b/, /max|limit|home|sea|msl|ascent/);
  const cBat = find(/battery.*(percent|charge|level|%)|chargelevel|battery_percent/);
  const cTime = find(/datetime|updatetime|time\(millisecond\)|^time|timestamp|date.*time/);
  const altFeet = cAlt >= 0 && /ft|feet/.test(head[cAlt]);
  const timeIsMs = cTime >= 0 && /millisecond/.test(head[cTime]);
  if (cLat < 0 || cLon < 0) throw new Error("Hittar inte latitud/longitud-kolumner.");
  const points: TrackPoint[] = [];
  let firstDate: number | null = null;
  let i = 0;
  for (const line of lines.slice(hi + 1)) {
    const c = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const lat = parseFloat(c[cLat]);
    const lon = parseFloat(c[cLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let t = i * 1000;
    if (cTime >= 0 && c[cTime]) {
      if (timeIsMs) t = Number(c[cTime]);
      else {
        const d = Date.parse(c[cTime].replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(c[cTime]) ? "" : /utc/i.test(head[cTime]) ? "Z" : ""));
        if (Number.isFinite(d)) {
          if (firstDate === null) firstDate = d;
          t = d;
        }
      }
    }
    const altRaw = cAlt >= 0 ? parseFloat(c[cAlt]) : NaN;
    const batRaw = cBat >= 0 ? parseFloat(c[cBat]) : NaN;
    points.push({ t, lat, lon, alt: Number.isFinite(altRaw) ? (altFeet ? altRaw * 0.3048 : altRaw) : null, bat: Number.isFinite(batRaw) ? batRaw : null });
    i++;
  }
  if (timeIsMs && cTime >= 0) {
    const dtCol = head.findIndex((h) => /datetime/.test(h));
    const firstLine = lines[hi + 1]?.split(sep);
    if (dtCol >= 0 && firstLine) {
      const d = Date.parse(firstLine[dtCol].replace(" ", "T") + "Z");
      if (Number.isFinite(d)) firstDate = d;
    }
  }
  return { points, startedAt: firstDate ? new Date(firstDate).toISOString() : null };
}

export function ImportPanel({ drones }: { drones: { id: string; name: string }[] }) {
  const router = useRouter();
  const [csvState, csvAction, csvPending] = useActionState<ImportState, FormData>(importCsv, {});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [droneId, setDroneId] = useState("");

  async function onTrackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const parsed = parseFlightCsv(await f.text());
      // gallra redan i webbläsaren så att stora loggar inte behöver skickas i sin helhet
      const res = await importTrack({ points: thinTrack(parsed.points), droneId: droneId || null, fileName: f.name, startedAt: parsed.startedAt });
      if ("error" in res && res.error) setMsg(res.error);
      else if ("id" in res) router.push(`/logbook/${res.id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
      <div className="card stack">
        <h2>Importera flyglogg (GPS-spår)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          CSV från t.ex. Airdata UAV, DJI Flight Log Viewer (PhantomHelp), FlightReader eller Litchi. Ger flygspår på karta, höjd och batterikurva.
          DJI:s krypterade .txt-loggar (v13+) konverterar du först till CSV i något av de verktygen.
        </p>
        <div>
          <label>Drönare</label>
          <select value={droneId} onChange={(e) => setDroneId(e.target.value)}>
            <option value="">– Välj –</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={onTrackFile} disabled={busy} />
        {busy && <p className="small muted">Läser loggen…</p>}
        {msg && <p className="error">{msg}</p>}
      </div>
      <form action={csvAction} className="card stack">
        <h2>Importera loggbok (CSV)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Kolumner: <span className="mono">datum; minuter; plats; drönare; typ; anteckning</span>. Datum som <span className="mono">2026-05-01 14:30</span>.
          Samma format som exporten.
        </p>
        <input type="file" name="file" accept=".csv,text/csv" required />
        <button className="btn secondary" disabled={csvPending}>{csvPending ? "Importerar…" : "Importera"}</button>
        {csvState.ok && <p className="small" style={{ color: "var(--ok)" }}>{csvState.ok}</p>}
        {csvState.error && <p className="error">{csvState.error}</p>}
      </form>
    </div>
  );
}
