import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDrones } from "@/lib/fleet";
import { toLocalInput } from "@/lib/format";
import { NewBriefingForm } from "@/components/NewBriefingForm";

export default async function NewBriefing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const drones = listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }));
  const zones = db.prepare("SELECT id, name, lat, lon, radius_m FROM zones WHERE org_id = ? ORDER BY name").all(user.org_id) as { id: string; name: string; lat: number; lon: number; radius_m: number }[];
  const now = new Date(Math.ceil(Date.now() / 9e5) * 9e5);
  const initial = sp.lat && sp.lon ? { lat: +sp.lat, lon: +sp.lon, radius: +(sp.r || 500) } : null;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ny briefing</h1>
          <p className="muted" style={{ margin: 0 }}>Välj plats, radie och tid – resten hämtas automatiskt.</p>
        </div>
      </div>
      <NewBriefingForm
        drones={drones}
        zones={zones}
        defaultDrone={user.default_drone_id}
        defaultWhen={toLocalInput(now)}
        maxWhen={toLocalInput(new Date(Date.now() + 10 * 864e5))}
        initial={initial}
      />
    </>
  );
}
