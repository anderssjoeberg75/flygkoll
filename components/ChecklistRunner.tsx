"use client";

import { useState, useTransition } from "react";
import { saveRun } from "@/app/(app)/checklists/actions";
import { Drone, ProgressRing } from "./Drone";

export function ChecklistRunner({
  id,
  items,
  drones,
  defaultDrone,
  briefingId,
}: {
  id: string;
  items: string[];
  drones: { id: string; name: string }[];
  defaultDrone: string | null;
  briefingId?: string | null;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [drone, setDrone] = useState(defaultDrone ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const done = checked.size === items.length && items.length > 0;
  const left = items.length - checked.size;
  return (
    <div className="card stack">
      <div className="row" style={{ gap: 20, alignItems: "center" }}>
        <ProgressRing
          value={items.length ? checked.size / items.length : 0}
          size={96}
          tone={done ? "var(--ok)" : "var(--accent)"}
          label={`${checked.size} av ${items.length} punkter klara`}
        >
          <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
            {/* nyckeln startar om animationen när läget byts */}
            <Drone key={done ? "lift" : "idle"} width={56} lifting={done} idle={!done} />
          </span>
        </ProgressRing>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 160 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 600 }}>
            {checked.size} / {items.length}
          </span>
          <span className="small" style={{ color: done ? "var(--ok)" : "var(--muted)" }} aria-live="polite">
            {done ? "Klar för start – lyft!" : `${left} punkt${left === 1 ? "" : "er"} kvar`}
          </span>
        </div>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="cl-drone">Drönare</label>
          <select id="cl-drone" value={drone} onChange={(e) => setDrone(e.target.value)}>
            <option value="">– Ingen –</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        {items.map((it, i) => (
          <label key={i} className={`check-item fk-rise ${checked.has(i) ? "done" : ""}`} style={{ fontWeight: 400, ["--i" as string]: i }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
            <span>{it}</span>
          </label>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button
          className="btn"
          disabled={pending || checked.size === 0}
          onClick={() =>
            start(async () => {
              await saveRun(id, drone || null, [...checked].sort((a, b) => a - b), briefingId);
              setSaved(done ? "Checklistan är klar och sparad." : "Delvis genomförd checklista sparad.");
              setChecked(new Set());
            })
          }
        >
          {done ? "Klar – spara" : "Spara genomgång"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setChecked(new Set(items.map((_, i) => i)))}>Bocka alla</button>
        {saved && (
          <div className="row small" style={{ color: "var(--ok)", alignItems: "center" }} role="status">
            <span>{saved}</span>
            {briefingId && (
              <a href={`/logbook/new?briefing=${briefingId}${drone ? `&drone=${drone}` : ""}`} className="btn small" style={{ marginLeft: 8 }}>
                Logga flygningen
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
