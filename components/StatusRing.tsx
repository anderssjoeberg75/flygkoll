/** Briefingstatus som en ring som ritas upp, med symbol i mitten. */
const TONE: Record<string, string> = { OK: "var(--ok)", CAUTION: "var(--warn)", PERMISSION: "var(--danger)", INCOMPLETE: "var(--danger)" };

export function StatusRing({ status, label, size = 88 }: { status: string; label: string; size?: number }) {
  const c = TONE[status] ?? "var(--info)";
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" role="img" aria-label={`Status: ${label}`} style={{ flex: "none" }}>
      <circle cx="55" cy="55" r="48" stroke="var(--panel-2)" strokeWidth="8" fill="none" />
      <circle className="fk-ring" cx="55" cy="55" r="48" stroke={c} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="302" strokeDashoffset="0" transform="rotate(-90 55 55)" />
      {status === "OK" ? (
        <path d="M38 56l11 11 23-24" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      ) : status === "CAUTION" ? (
        <g fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M55 33 L76 71 H34 Z" />
          <path d="M55 48v9M55 63v1" />
        </g>
      ) : status === "INCOMPLETE" ? (
        <g fill="none" stroke={c} strokeWidth="5" strokeLinecap="round">
          <path d="M44 44a11 11 0 1 1 15 10c-3 1.5-4 3.5-4 6" />
          <path d="M55 70v1" />
        </g>
      ) : (
        <g fill="none" stroke={c} strokeWidth="6" strokeLinecap="round">
          <circle cx="55" cy="55" r="19" />
          <path d="M42 68l26-26" />
        </g>
      )}
    </svg>
  );
}
