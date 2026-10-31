"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Logo } from "./Logo";

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
      <form action={formAction} className="card stack">
        <div className="row" style={{ marginBottom: 6 }}>
          <Logo dark />
          <strong style={{ fontSize: "1.2rem" }}>Flygkoll</strong>
        </div>
        <h1>{mode === "login" ? "Logga in" : "Skapa konto"}</h1>
        {mode === "register" && (
          <>
            <div className="grid g2">
              <div><label>Förnamn</label><input name="first_name" required /></div>
              <div><label>Efternamn</label><input name="last_name" /></div>
            </div>
            <div><label>Organisation</label><input name="org" placeholder="T.ex. ditt namn eller företag" /></div>
          </>
        )}
        <div><label>E-post</label><input name="email" type="email" autoComplete="email" required /></div>
        <div>
          <label>Lösenord</label>
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} />
        </div>
        {state.error && <p className="error">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"}</button>
        {footer}
      </form>
    </div>
  );
}
