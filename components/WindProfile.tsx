import { compass, fmtTime } from "@/lib/format";

type Row = { time: string; w10: number; w80: number; w120: number; d10: number; d120: number; gust: number };

function color(v: number, y: number, r: number) {
  return v >= r ? "var(--danger)" : v >= y ? "var(--warn)" : "var(--ok)";
}

export function WindProfile({ rows, yellow, red }: { rows: Row[]; yellow: number; red: number }) {
  if (!rows.length) return <p className="muted small">Vindprofil saknas för vald tid. Prognosen blir träffsäkrare närmare flygtillfället.</p>;
  const max = Math.max(red * 1.2, ...rows.map((r) => Math.max(r.w120, r.gust)));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Tid</th><th>10 m</th><th>80 m</th><th>120 m</th><th>Byar 10 m</th><th style={{ width: "35%" }}>Vind 120 m</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.time}>
              <td>{fmtTime(r.time)}</td>
              <td style={{ color: color(r.w10, yellow, red) }}>{r.w10.toFixed(1)} <span className="muted small">{compass(r.d10)}</span></td>
              <td style={{ color: color(r.w80, yellow, red) }}>{r.w80.toFixed(1)}</td>
              <td style={{ color: color(r.w120, yellow, red) }}>{r.w120.toFixed(1)} <span className="muted small">{compass(r.d120)}</span></td>
              <td style={{ color: color(r.gust, yellow, red), fontWeight: 600 }}>{r.gust.toFixed(1)}</td>
              <td>
                <div style={{ background: "var(--panel-2)", borderRadius: 4 }}>
                  <div className="wind-bar" style={{ width: `${(r.w120 / max) * 100}%`, background: color(r.w120, yellow, red) }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">m/s. Grönt &lt; {yellow}, gult ≥ {yellow}, rött ≥ {red} (ändras under Organisation).</p>
    </div>
  );
}
