import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { csvCell as q } from "@/lib/validate";

export async function GET() {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db
    .prepare(
      `SELECT f.*, d.name AS drone_name,
        (SELECT group_concat(c.role || ': ' || c.name, ', ') FROM flight_crew c WHERE c.flight_id = f.id) AS crew
       FROM flights f LEFT JOIN drones d ON d.id = f.drone_id WHERE f.pilot_id = ? ORDER BY f.started_at`
    )
    .all(user.id) as Record<string, unknown>[];
  const head = ["datum", "minuter", "plats", "drönare", "typ", "anteckning", "besättning", "max_höjd_m", "distans_m", "lat", "lon"];
  const lines = rows.map((r) =>
    [fmtDateTime(r.started_at as string), r.duration_min, r.location, r.drone_name, r.type, r.notes, r.crew, r.max_alt_m, r.distance_m, r.lat, r.lon].map(q).join(";")
  );
  const csv = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="loggbok-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
