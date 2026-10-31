"use client";

import { useActionState } from "react";

type S = { ok?: string; error?: string };

/** Formulär som visar ok/fel från en server action. */
export function StateForm({
  action,
  children,
  submit = "Spara",
  className = "card stack",
}: {
  action: (s: S, fd: FormData) => Promise<S>;
  children: React.ReactNode;
  submit?: string;
  className?: string;
}) {
  const [state, act, pending] = useActionState(action, {});
  return (
    <form action={act} className={className}>
      {children}
      <div className="row">
        <button className="btn" disabled={pending}>{pending ? "Sparar…" : submit}</button>
        {state.ok && <span className="small" style={{ color: "var(--ok)" }}>{state.ok}</span>}
        {state.error && <span className="error">{state.error}</span>}
      </div>
    </form>
  );
}
