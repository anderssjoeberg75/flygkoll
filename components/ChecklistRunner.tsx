"use client";

import { useState, useTransition } from "react";
import { saveRun } from "@/app/(app)/checklists/actions";

export function ChecklistRunner({
  id,
  items,
  drones,
  defaultDrone,
}: {
  id: string;
  items: string[];
  drones: { id: string; name: string }[];
  defaultDrone: string | null;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [drone, setDrone] = useState(defaultDrone ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) =>
    setChecked((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
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
              await saveRun(id, drone || null, [...checked].sort((a, b) => a - b));
              setSaved(done ? "Checklistan är klar och sparad." : "Delvis genomförd checklista sparad.");
              setChecked(new Set());
            })
          }
        >
          {done ? "Klar – spara" : "Spara genomgång"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setChecked(new Set(items.map((_, i) => i)))}>Bocka alla</button>
        {saved && <span className="small" style={{ color: "var(--ok)" }}>{saved}</span>}
      </div>
    </div>
  );
}
