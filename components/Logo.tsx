/** Flygkolls märke: sikte med roterande, streckad rotorring. */
export function Logo({ size = 28 }: { dark?: boolean; size?: number }) {
  const c = "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="5" stroke={c} strokeWidth="2.5" />
      <path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="logo-ring" cx="16" cy="16" r="13" stroke={c} strokeWidth="1.5" strokeDasharray="3 4" />
    </svg>
  );
}
