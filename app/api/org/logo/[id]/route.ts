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
    .prepare("SELECT logo_url FROM orgs WHERE id = ?")
    .get(id) as { logo_url: string | null } | undefined;

  if (!row?.logo_url) return new NextResponse("Not found", { status: 404 });

  const match = row.logo_url.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    if (row.logo_url.startsWith("http") || row.logo_url.startsWith("/")) {
      return NextResponse.redirect(new URL(row.logo_url, req.url));
    }
    return new NextResponse("Invalid logo", { status: 400 });
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
