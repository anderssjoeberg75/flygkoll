import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import type { Geometry, Position } from "geojson";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/validate";
import { db } from "@/lib/db";
import type { BriefingResult } from "@/lib/briefing";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function ring(r: Position[]) {
  return `<LinearRing><coordinates>${r.map((p) => `${p[0]},${p[1]},0`).join(" ")}</coordinates></LinearRing>`;
}
function poly(rings: Position[][]) {
  return `<Polygon><outerBoundaryIs>${ring(rings[0])}</outerBoundaryIs>${rings.slice(1).map((r) => `<innerBoundaryIs>${ring(r)}</innerBoundaryIs>`).join("")}</Polygon>`;
}
function geom(g: Geometry): string {
  if (g.type === "Polygon") return poly(g.coordinates);
  if (g.type === "MultiPolygon") return `<MultiGeometry>${g.coordinates.map(poly).join("")}</MultiGeometry>`;
  if (g.type === "Point") return `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
  return "";
}

const COLORS: Record<string, string> = { permission: "ff2626dc", caution: "ff0b9ef5", info: "ffd6a00d", op: "ff6e760f" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = db.prepare("SELECT name, result FROM briefings WHERE id = ? AND org_id = ? AND (user_id = ? OR shared = 1)").get(id, user.org_id, user.id) as
    | { name: string; result: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = safeJson<BriefingResult | null>(row.result, null);
  if (!r) return NextResponse.json({ error: "Briefingens data är skadad." }, { status: 500 });
  const op = turf.circle(r.center, r.radius_m / 1000, { steps: 72, units: "kilometers" });
  const styles = Object.entries(COLORS)
    .map(([k, c]) => `<Style id="${k}"><LineStyle><color>${c}</color><width>2</width></LineStyle><PolyStyle><color>33${c.slice(2)}</color></PolyStyle></Style>`)
    .join("");
  const marks = r.map.features
    .filter((f) => f.geometry)
    .map((f) => `<Placemark><name>${esc(f.properties?.name)}</name><description>${esc(f.properties?.layer)}</description><styleUrl>#${f.properties?.severity ?? "info"}</styleUrl>${geom(f.geometry!)}</Placemark>`)
    .join("");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(row.name)}</name>${styles}
<Placemark><name>Operationsområde (${r.radius_m} m)</name><styleUrl>#op</styleUrl>${geom(op.geometry)}</Placemark>
<Folder><name>Luftrum och områden</name>${marks}</Folder></Document></kml>`;
  return new NextResponse(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="briefing-${id}.kml"`,
    },
  });
}
