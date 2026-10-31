import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDrones } from "@/lib/fleet";
import { orgMembers } from "@/lib/members";
import { toLocalInput } from "@/lib/format";
import { FlightForm } from "@/components/FlightForm";

export default async function EditFlight({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const f = db.prepare("SELECT * FROM flights WHERE id = ? AND org_id = ?").get(id, user.org_id) as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!f || (f.pilot_id !== user.id && user.role !== "admin")) notFound();
  const crew = db.prepare("SELECT role, user_id, name FROM flight_crew WHERE flight_id = ?").all(id) as { role: string; user_id: string | null; name: string }[];
  return (
    <>
      <div className="page-head"><h1>Redigera flygning</h1></div>
      <FlightForm
        drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }))}
        members={orgMembers(user.org_id)}
        defaults={{
          id: f.id, started_at: toLocalInput(new Date(f.started_at)), duration_min: f.duration_min, location: f.location,
          lat: f.lat, lon: f.lon, drone_id: f.drone_id, type: f.type, max_alt_m: f.max_alt_m, notes: f.notes, crew,
        }}
      />
    </>
  );
}
