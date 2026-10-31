import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const KIND: Record<string, string> = { preflight: "Före flygning", postflight: "Efter flygning", daily: "Daglig kontroll", custom: "Övrigt" };

export default async function Checklists() {
  const user = await requireUser();
  const lists = db
    .prepare("SELECT c.id, c.name, c.kind, c.items, d.name AS drone_name FROM checklists c LEFT JOIN drones d ON d.id = c.drone_id WHERE c.org_id = ? ORDER BY c.kind, c.name")
    .all(user.org_id) as { id: string; name: string; kind: string; items: string; drone_name: string | null }[];
  const groups = Object.keys(KIND).map((k) => ({ k, items: lists.filter((l) => l.kind === k) })).filter((g) => g.items.length);
  return (
    <>
      <div className="page-head">
        <div><h1>Checklistor</h1><p className="muted" style={{ margin: 0 }}>Bocka av punkterna direkt i mobilen. Organisationen kan anpassa listorna och göra drönarspecifika varianter.</p></div>
        {user.role === "admin" && <Link className="btn" href="/checklists/new">＋ Ny checklista</Link>}
      </div>
      {groups.map((g) => (
        <div key={g.k} className="card">
          <h2>{KIND[g.k]}</h2>
          <div className="grid g3">
            {g.items.map((c) => (
              <Link key={c.id} href={`/checklists/${c.id}`} className="card" style={{ color: "inherit", padding: 14 }}>
                <strong>{c.name}</strong>
                <div className="small muted">{(JSON.parse(c.items) as string[]).length} punkter{c.drone_name ? ` · ${c.drone_name}` : ""}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
