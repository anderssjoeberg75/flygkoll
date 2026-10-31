type Series = { name: string; color: string; values: (number | null)[]; unit: string };

/** Enkel SVG-linjegraf, en y-axel per serie (normaliserad), x = minuter. */
export function LineChart({ x, series, height = 200 }: { x: number[]; series: Series[]; height?: number }) {
  const W = 800, H = height, P = { l: 44, r: 44, t: 12, b: 26 };
  const xmin = x[0] ?? 0, xmax = x[x.length - 1] ?? 1;
  const sx = (v: number) => P.l + ((v - xmin) / Math.max(1e-9, xmax - xmin)) * (W - P.l - P.r);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={series.map((s) => s.name).join(" och ")}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={P.l} x2={W - P.r} y1={P.t + f * (H - P.t - P.b)} y2={P.t + f * (H - P.t - P.b)} stroke="var(--border)" strokeWidth={1} />
      ))}
      {series.map((s, si) => {
        const vals = s.values.filter((v): v is number => v !== null);
        if (!vals.length) return null;
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const min = si === 0 && s.unit === "%" ? 0 : Math.floor(lo), max = s.unit === "%" ? 100 : Math.ceil(hi === lo ? hi + 1 : hi);
        const sy = (v: number) => P.t + (1 - (v - min) / Math.max(1e-9, max - min)) * (H - P.t - P.b);
        let d = "";
        s.values.forEach((v, i) => {
          if (v === null) return;
          d += `${d ? "L" : "M"}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`;
        });
        const axisX = si === 0 ? P.l - 6 : W - P.r + 6;
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            <text x={axisX} y={P.t + 4} fontSize={11} fill={s.color} textAnchor={si === 0 ? "end" : "start"}>{max}{s.unit}</text>
            <text x={axisX} y={H - P.b} fontSize={11} fill={s.color} textAnchor={si === 0 ? "end" : "start"}>{min}{s.unit}</text>
          </g>
        );
      })}
      <text x={P.l} y={H - 6} fontSize={11} fill="var(--muted)">0 min</text>
      <text x={W - P.r} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor="end">{(xmax - xmin).toFixed(1)} min</text>
      <g transform={`translate(${P.l + 10}, ${P.t + 14})`}>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${i * 130}, 0)`}>
            <rect width={10} height={10} y={-9} rx={2} fill={s.color} />
            <text x={14} fontSize={12} fill="var(--text)">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
