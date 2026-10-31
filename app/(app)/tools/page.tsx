import { requireUser } from "@/lib/auth";
import { listDrones } from "@/lib/fleet";
import { VlosCalc } from "@/components/VlosCalc";

export default async function Tools() {
  const user = await requireUser();
  return (
    <>
      <div className="page-head"><div><h1>Verktyg</h1></div></div>
      <VlosCalc drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name, char_dim_m: d.char_dim_m }))} />
    </>
  );
}
