import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { blockedFor, hit, type Limit } from "@/lib/ratelimit";
import { BusyError, searchPlace } from "@/lib/sources";

const MAX_QUERY = 200;

export async function GET(req: Request) {
  // konton med tillfälligt lösenord ska byta det först (#37)
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, MAX_QUERY);
  if (!q) return NextResponse.json([]);

  // Nominatim tillåter ~1 anrop/s för hela servern – en användare får inte fylla kön (#35)
  const limits: Limit[] = [{ key: `geocode:${user.id}`, max: 30, windowMs: 60e3 }];
  const wait = blockedFor(limits);
  if (wait > 0) {
    return NextResponse.json({ error: "För många sökningar – vänta en stund." }, { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } });
  }
  hit(limits);

  try {
    return NextResponse.json(await searchPlace(q));
  } catch (e) {
    if (e instanceof BusyError) return NextResponse.json({ error: e.message }, { status: 503, headers: { "Retry-After": "5" } });
    return NextResponse.json([], { status: 502 });
  }
}
