import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;

  const row = db
    .prepare("SELECT photo FROM users WHERE id = ? AND org_id = ?")
    .get(id, user.org_id) as { photo: string | null } | undefined;

  if (!row?.photo) return new NextResponse("Not found", { status: 404 });

  const match = row.photo.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    if (row.photo.startsWith("http")) return NextResponse.redirect(row.photo);
    return new NextResponse("Invalid photo", { status: 400 });
  }

  // Endast rasterbilder serveras – SVG kan innehålla skript (lagrad XSS)
  const contentType = match[1].toLowerCase();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(contentType)) return new NextResponse("Unsupported media type", { status: 415 });
  const buffer = Buffer.from(match[2], "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
