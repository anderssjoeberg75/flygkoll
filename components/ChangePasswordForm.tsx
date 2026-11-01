"use client";

import { useActionState } from "react";
import { forceChangePassword, logout, type AuthState } from "@/app/(auth)/actions";
import { Logo } from "./Logo";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(forceChangePassword, {});
  return (
    <div className="auth">
      <form action={action} className="card stack">
        <div className="row" style={{ marginBottom: 6 }}>
          <Logo dark />
          <strong style={{ fontSize: "1.2rem" }}>Flygkoll</strong>
        </div>
        <h1>Välj ett nytt lösenord</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Du loggade in som {email} med ett tillfälligt lösenord. Välj ett eget innan du fortsätter.
        </p>
        <div><label>Nytt lösenord (minst 8 tecken)</label><input name="new" type="password" autoComplete="new-password" minLength={8} required /></div>
        <div><label>Upprepa</label><input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></div>
        {state.error && <p className="error">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? "Sparar…" : "Spara och fortsätt"}</button>
        <button type="button" className="btn secondary small" onClick={() => logout()}>Logga ut</button>
      </form>
    </div>
  );
}
