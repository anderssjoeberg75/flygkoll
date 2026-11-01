import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Profilbilder och logotyper lagras som data-URL:er i databasen men serveras här i stället för i varje sidsvar. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { kind, id } = await params;
  let dataUrl: string | null | undefined;
  if (kind === "user") {
    dataUrl = (db.prepare("SELECT photo FROM users WHERE id = ? AND org_id = ?").get(id, user.org_id) as { photo: string | null } | undefined)?.photo;
  } else if (kind === "org" && id === user.org_id) {
    dataUrl = (db.prepare("SELECT logo_url FROM orgs WHERE id = ?").get(id) as { logo_url: string | null } | undefined)?.logo_url;
  }
  const m = dataUrl?.match(/^data:([\w/+.-]+);base64,(.*)$/s);
  if (!m) return new NextResponse(null, { status: 404 });
  const etag = `"${crypto.createHash("sha1").update(dataUrl!).digest("base64url")}"`;
  const common = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    // äldre uppladdningar kan vara SVG – kör aldrig skript om bilden öppnas direkt
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  };
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: common });
  return new NextResponse(Buffer.from(m[2], "base64"), { headers: { ...common, "Content-Type": m[1] } });
}
