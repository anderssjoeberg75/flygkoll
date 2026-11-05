import { requireUser } from "@/lib/auth";
import { getAccessibleBriefing } from "@/lib/access";
import { listDrones } from "@/lib/fleet";
import { orgMembers } from "@/lib/members";
import { toLocalInput } from "@/lib/format";
import { FlightForm } from "@/components/FlightForm";

export default async function NewFlight({ searchParams }: { searchParams: Promise<{ briefing?: string }> }) {
  const user = await requireUser();
  const { briefing } = await searchParams;
  const b = getAccessibleBriefing<{ id: string; name: string; lat: number; lon: number; flight_time: string; drone_id: string | null }>(
    user, briefing, "id, name, lat, lon, flight_time, drone_id"
  );
  return (
    <>
      <div className="page-head"><div><h1>Ny flygning</h1>{b && <p className="muted" style={{ margin: 0 }}>Kopplad till briefing {b.name}</p>}</div></div>
      <FlightForm
        drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }))}
        members={orgMembers(user.org_id).filter((m) => m.id !== user.id)}
        defaults={{
          started_at: toLocalInput(b ? new Date(b.flight_time) : new Date()),
          duration_min: 20,
          location: b?.name ?? "",
          lat: b?.lat ?? null,
          lon: b?.lon ?? null,
          drone_id: b?.drone_id ?? user.default_drone_id,
          type: "standard",
          notes: "",
          briefing_id: b?.id ?? null,
          crew: [],
        }}
      />
    </>
  );
}
