"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveRun } from "@/app/(app)/checklists/actions";
import { queueRun } from "./PendingRunsSync";

export function ChecklistRunner({
  id,
  items,
  drones,
  defaultDrone,
  briefingId = null,
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
  return (
    <div className="card stack">
      <div className="spread">
        <div className="row">
          <label style={{ margin: 0 }}>Drönare</label>
          <select value={drone} onChange={(e) => setDrone(e.target.value)} style={{ width: "auto" }}>
            <option value="">– Ingen –</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <span className={`badge ${done ? "b-ok" : "b-muted"}`}>{checked.size} / {items.length}</span>
      </div>
      <div>
        {items.map((it, i) => (
          <label key={i} className={`check-item ${checked.has(i) ? "done" : ""}`} style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
            <span>{it}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <button
          className="btn"
          disabled={pending || checked.size === 0}
          onClick={() =>
            start(async () => {
              const run = { checklistId: id, droneId: drone || null, checked: [...checked].sort((a, b) => a - b), briefingId };
              try {
                await saveRun(run.checklistId, run.droneId, run.checked, run.briefingId);
                setSaved(done ? "Checklistan är klar och sparad." : "Delvis genomförd checklista sparad.");
              } catch {
                // offline i fält: spara lokalt och skicka när nätet är tillbaka
                queueRun(run);
                setSaved("Ingen anslutning – genomgången sparas lokalt och skickas automatiskt när du är online igen.");
              }
              setChecked(new Set());
            })
          }
        >
          {done ? "Klar – spara" : "Spara genomgång"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setChecked(new Set(items.map((_, i) => i)))}>Bocka alla</button>
        {saved && <span className="small" style={{ color: "var(--ok)" }}>{saved}</span>}
      </div>
      {saved && briefingId && (
        <div className="row">
          <Link className="btn secondary small" href={`/logbook/new?briefing=${briefingId}`}>Logga flygningen</Link>
          <Link className="btn secondary small" href={`/briefings/${briefingId}`}>Tillbaka till briefingen</Link>
        </div>
      )}
    </div>
  );
}
