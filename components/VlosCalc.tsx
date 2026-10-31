"use client";

import { useState } from "react";

export function VlosCalc({ drones }: { drones: { id: string; name: string; char_dim_m: number }[] }) {
  const [cd, setCd] = useState(drones[0]?.char_dim_m ?? 0.35);
  const [kind, setKind] = useState<"multirotor" | "fixedwing">("multirotor");
  const [vis, setVis] = useState(10);
  // EASA AMC1 Art. 11 (SORA 2.0, bilaga): ALOS_max för multirotor ≈ 327·CD + 20 m; fastvinge ≈ 490·CD + 30 m.
  const alos = Math.round(kind === "multirotor" ? 327 * cd + 20 : 490 * cd + 30);
  // DLOS (upptäckt av annan luftfart) ≈ 0,3 × markvisibilitet
  const dlos = Math.round(vis * 1000 * 0.3);
  const vlos = Math.min(alos, dlos);
  return (
    <div className="card stack">
      <h2>VLOS/BVLOS-kalkylator</h2>
      <p className="small muted" style={{ margin: 0 }}>Uppskattar hur långt bort du kan hålla visuell kontakt (ALOS) och upptäcka annan luftfart (DLOS), enligt EASA:s vägledning för specifik kategori.</p>
      {drones.length > 0 && (
        <div>
          <label>Hämta från drönare</label>
          <select onChange={(e) => setCd(drones.find((d) => d.id === e.target.value)?.char_dim_m ?? cd)}>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.char_dim_m} m)</option>)}
          </select>
        </div>
      )}
      <div className="grid g3">
        <div><label>Karakteristisk dimension (m)</label><input type="number" step="0.01" min="0.05" value={cd} onChange={(e) => setCd(+e.target.value || 0)} /></div>
        <div>
          <label>Typ</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "multirotor" | "fixedwing")}>
            <option value="multirotor">Multirotor</option>
            <option value="fixedwing">Fastvinge</option>
          </select>
        </div>
        <div><label>Markvisibilitet (km)</label><input type="number" step="0.5" min="0.5" value={vis} onChange={(e) => setVis(+e.target.value || 0)} /></div>
      </div>
      <div className="grid g3">
        <div className="card stat"><span className="label">ALOS (se drönaren)</span><span className="value">{alos} m</span></div>
        <div className="card stat"><span className="label">DLOS (se annan trafik)</span><span className="value">{dlos} m</span></div>
        <div className="card stat ok"><span className="label">Max VLOS-avstånd</span><span className="value">{vlos} m</span></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Längre bort än så räknas som BVLOS och kräver specifik kategori (t.ex. STS-02, PDRA eller SORA) eller luftrumsobservatörer.</p>
    </div>
  );
}
