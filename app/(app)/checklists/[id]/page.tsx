import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, displayName, canWrite } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDrones } from "@/lib/fleet";
import { fmtDateTime } from "@/lib/format";
import { ChecklistRunner } from "@/components/ChecklistRunner";
import { duplicateChecklist, deleteChecklist } from "../actions";

export default async function RunChecklist({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ briefing?: string }> }) {
  const { id } = await params;
  const { briefing: briefingParam } = await searchParams;
  const user = await requireUser();
  const briefing = briefingParam
    ? (db.prepare("SELECT id, name FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR shared = 1)").get(briefingParam, user.org_id, user.id) as { id: string; name: string } | undefined)
    : undefined;
  const c = db.prepare("SELECT * FROM checklists WHERE id = ? AND org_id = ?").get(id, user.org_id) as { id: string; name: string; items: string; drone_id: string | null } | undefined;
  if (!c) notFound();
  const runs = db
    .prepare("SELECT r.created_at, r.completed, r.checked, u.first_name, u.last_name, u.email, d.name AS drone FROM checklist_runs r JOIN users u ON u.id = r.user_id LEFT JOIN drones d ON d.id = r.drone_id WHERE r.checklist_id = ? ORDER BY r.created_at DESC LIMIT 15")
    .all(id) as { created_at: string; completed: number; checked: string; first_name: string; last_name: string; email: string; drone: string | null }[];
  const items = JSON.parse(c.items) as string[];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {items.length} punkter
            {briefing && <> · för briefing <Link href={`/briefings/${briefing.id}`}>{briefing.name}</Link></>}
          </p>
        </div>
        {user.role === "admin" && (
          <div className="row">
            <Link className="btn secondary small" href={`/checklists/${id}/edit`}>Redigera</Link>
            <form action={duplicateChecklist.bind(null, id)}><button className="btn secondary small">Duplicera</button></form>
            <form action={deleteChecklist.bind(null, id)}><button className="btn danger small">Ta bort</button></form>
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(240px,1fr)", alignItems: "start" }}>
        {canWrite(user) ? (
          <ChecklistRunner
            id={id}
            items={items}
            drones={listDrones(user.org_id).map((d) => ({ id: d.id, name: d.name }))}
            defaultDrone={c.drone_id ?? user.default_drone_id}
            briefingId={briefing?.id ?? null}
          />
        ) : (
          <div className="card"><ul>{items.map((it, i) => <li key={i}>{it}</li>)}</ul></div>
        )}
        <div className="card">
          <h2>Senaste genomgångar</h2>
          {runs.length === 0 ? <p className="small muted">Inga ännu.</p> : runs.map((r, i) => (
            <div key={i} className="spread small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{fmtDateTime(r.created_at.replace(" ", "T") + "Z")}<br /><span className="muted">{displayName(r)}{r.drone ? ` · ${r.drone}` : ""}</span></span>
              <span className={`badge ${r.completed ? "b-ok" : "b-warn"}`}>{r.completed ? "Klar" : `${(JSON.parse(r.checked) as number[]).length}/${items.length}`}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
