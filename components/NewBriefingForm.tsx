"use client";

import { useActionState } from "react";
import { MapPicker } from "./MapPicker";
import { createBriefing, type CreateState } from "@/app/(app)/briefings/actions";

export function NewBriefingForm({
  drones,
  zones,
  defaultDrone,
  defaultWhen,
  maxWhen,
  initial,
}: {
  drones: { id: string; name: string }[];
  zones: { id: string; name: string; lat: number; lon: number; radius_m: number }[];
  defaultDrone: string | null;
  defaultWhen: string;
  maxWhen: string;
  initial: { lat: number; lon: number; radius: number } | null;
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createBriefing, {});
  return (
    <form action={action} className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(260px,1fr)", alignItems: "start" }}>
      <div className="card">
        <h2>Plats</h2>
        <MapPicker initial={initial} zones={zones} />
      </div>
      <div className="card stack">
        <h2>Flygparametrar</h2>
        <div><label>Namn (valfritt)</label><input name="name" placeholder="T.ex. Inspektion brofäste" /></div>
        <div>
          <label>Start (svensk tid)</label>
          <input type="datetime-local" name="when" defaultValue={defaultWhen} max={maxWhen} required />
          <p className="small muted" style={{ margin: "4px 0 0" }}>Väderprognos finns cirka 10 dygn framåt. Vind är mest träffsäker inom 48 h.</p>
        </div>
        <div>
          <label>Längd på flygfönster</label>
          <select name="duration" defaultValue="3">
            {[0.5, 1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
        </div>
        <div>
          <label>Drönare</label>
          <select name="drone" defaultValue={defaultDrone ?? ""}>
            <option value="">– Ingen vald –</option>
            {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {state.error && <p className="error">{state.error}</p>}
        <button className="btn" disabled={pending}>{pending ? "Hämtar data från alla källor…" : "Skapa briefing"}</button>
        <p className="small muted" style={{ margin: 0 }}>Hämtar parallellt: LFV (luftrum, NOTAM, SUP, UAS-zoner), SMHI, Naturvårdsverket, Kp-index och GPS-störning.</p>
      </div>
    </form>
  );
}
