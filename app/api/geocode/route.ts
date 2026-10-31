import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { searchPlace } from "@/lib/sources";

export async function GET(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchPlace(q));
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
