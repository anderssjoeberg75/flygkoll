"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Logo } from "./Logo";

const STARS: [number, number, number, number][] = [
  [80, 90, 1.6, 0], [210, 160, 1.2, 0.6], [350, 70, 1.8, 1.2], [520, 130, 1.3, 0.3], [660, 60, 1.6, 1.8],
  [610, 240, 1.1, 2.2], [120, 300, 1.3, 1.5], [440, 250, 1.0, 0.9], [300, 210, 1.2, 2.6], [700, 330, 1.4, 0.4],
];
const ROUTE = "M-40 520 C 160 380, 260 520, 420 360 S 640 160, 760 120";

/** Svart scen med stjärnhimmel, radarringar och en drönare som flyger längs en rutt. */
function NightScene() {
  return (
    <div className="auth-scene" aria-hidden="true">
      <svg viewBox="0 0 760 900" preserveAspectRatio="xMidYMid slice">
        {STARS.map(([x, y, r, d], i) => (
          <circle key={i} className="fk-twinkle" cx={x} cy={y} r={r} fill="#ffffff" style={{ animationDelay: `${d}s` }} />
        ))}
        <path d="M0 700 L90 640 L170 680 L260 600 L340 660 L430 590 L520 650 L610 580 L700 640 L760 610 L760 900 L0 900 Z" fill="#111317" />
        <path d="M0 760 L120 720 L240 770 L360 710 L480 760 L600 720 L760 760 L760 900 L0 900 Z" fill="#0a0b0d" />
        <path className="fk-path" d={ROUTE} fill="none" stroke="#3d8bff" strokeOpacity=".55" strokeWidth="2" />
        <g transform="translate(420 360)">
          <circle className="auth-ring" r="120" fill="none" stroke="#3d8bff" strokeOpacity=".5" />
          <circle className="auth-ring" r="120" fill="none" stroke="#3d8bff" strokeOpacity=".5" style={{ animationDelay: "2s" }} />
        </g>
        <g className="auth-drone" style={{ offsetPath: `path("${ROUTE}")` }}>
          <g transform="translate(-26 -14)">
            <path d="M6 10 L22 18 M46 10 L30 18" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
            <rect x="19" y="14" width="14" height="9" rx="3" fill="#16181c" stroke="#3d8bff" strokeWidth="1.5" />
            <circle cx="26" cy="26" r="2.5" fill="#ffb020" />
            <ellipse className="fk-rotor" cx="6" cy="8" rx="9" ry="2.5" stroke="#8db8ff" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
            <ellipse className="fk-rotor rev" cx="46" cy="8" rx="9" ry="2.5" stroke="#8db8ff" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
          </g>
        </g>
      </svg>
      <div className="tagline fk-rise">
        <span className="eyebrow" style={{ color: "#3d8bff" }}>Luftrum · NOTAM · väder · natur</span>
        <p>
          Briefing på sekunder.
          <br />
          Flyg med koll.
        </p>
      </div>
    </div>
  );
}

export function AuthForm({
  mode,
  action,
  footer,
}: {
  mode: "login" | "register";
  action: (s: AuthState, fd: FormData) => Promise<AuthState>;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="auth">
      <NightScene />
      <div className="auth-side">
        <form action={formAction} className="fk-rise" style={{ ["--i" as string]: 2 }}>
          <div className="row" style={{ gap: 12 }}>
            <Logo size={34} />
            <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Flygkoll</strong>
          </div>
          <h1 style={{ margin: 0 }}>{mode === "login" ? "Logga in" : "Skapa konto"}</h1>
          {mode === "register" && (
            <>
              <div className="grid g2">
                <div><label htmlFor="first_name">Förnamn</label><input id="first_name" name="first_name" required /></div>
                <div><label htmlFor="last_name">Efternamn</label><input id="last_name" name="last_name" /></div>
              </div>
              <div><label htmlFor="org">Organisation</label><input id="org" name="org" placeholder="T.ex. ditt namn eller företag" /></div>
            </>
          )}
          <div><label htmlFor="email">E-post</label><input id="email" name="email" type="email" autoComplete="email" placeholder="namn@exempel.se" required /></div>
          <div>
            <label htmlFor="password">Lösenord</label>
            <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} />
          </div>
          {state.error && <p className="error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
          <button className="btn" disabled={pending} style={{ minHeight: 50 }}>{pending ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"}</button>
          {footer}
        </form>
      </div>
    </div>
  );
}
