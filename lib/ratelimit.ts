/**
 * Enkel begränsning av antal försök i minnet (räcker för en självhostad instans med en process).
 * Varje nyckel får max `limit` försök inom `windowMs`.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterS: number } {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { allowed: b.count <= limit, retryAfterS: Math.ceil((b.resetAt - now) / 1000) };
}

export function reset(key: string) {
  buckets.delete(key);
}

export function isLimited(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > now && b.count >= limit;
}
