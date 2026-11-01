/** Animerad drönare (sidovy) med snurrande rotorer. `lifting` lyfter och tonar ut den. */
export function Drone({ width = 220, lifting = false, idle = false, label }: { width?: number; lifting?: boolean; idle?: boolean; label?: string }) {
  const h = Math.round(width / 2);
  const rotor = "fk-rotor";
  const rotorStyle = idle ? { animationDuration: "1.6s" } : undefined;
  return (
    <svg
      className={lifting ? "fk-lift" : "fk-hover"}
      width={width}
      height={h}
      viewBox="0 0 220 110"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M40 40 L95 58 M180 40 L125 58 M40 40 L40 30 M180 40 L180 30" stroke="var(--drone-arm)" strokeWidth="5" strokeLinecap="round" />
      <rect x="88" y="48" width="44" height="26" rx="9" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="110" cy="80" r="7" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="110" cy="80" r="2.5" fill="var(--accent)" />
      <circle cx="103" cy="56" r="2" fill="var(--warn)" />
      <circle cx="117" cy="56" r="2" fill="var(--ok)" />
      <ellipse className={rotor} style={rotorStyle} cx="40" cy="28" rx="30" ry="6" stroke="var(--accent)" strokeOpacity=".7" strokeWidth="2" strokeDasharray="14 10" />
      <ellipse className={`${rotor} rev`} style={rotorStyle} cx="180" cy="28" rx="30" ry="6" stroke="var(--accent)" strokeOpacity=".7" strokeWidth="2" strokeDasharray="14 10" />
    </svg>
  );
}

/** Ring som ritas upp till `value` (0–1). */
export function ProgressRing({ value, size = 72, tone = "var(--accent)", label, children }: { value: number; size?: number; tone?: string; label: string; children?: React.ReactNode }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-grid", placeItems: "center", flex: "none" }}>
      <svg width={size} height={size} viewBox="0 0 110 110" role="img" aria-label={label} style={{ position: "absolute", inset: 0 }}>
        <circle cx="55" cy="55" r="48" stroke="var(--panel-2)" strokeWidth="9" fill="none" />
        <circle
          className="fk-ring"
          cx="55"
          cy="55"
          r="48"
          stroke={tone}
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="302"
          strokeDashoffset={302 - 302 * v}
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dashoffset .5s cubic-bezier(.2,.7,.3,1)" }}
        />
      </svg>
      {children}
    </span>
  );
}
