/** Tolkning av klientadress från proxy-headers. Ren funktion – testbar utan Next.js (#31). */

/**
 * Antal betrodda reverse proxies framför appen, från FLYGKOLL_TRUST_PROXY.
 * Tomt/0 = ingen proxy är betrodd och X-Forwarded-For/X-Real-IP ignoreras helt.
 * "1"/"true" = en proxy; ett större heltal = så många proxies i kedjan.
 */
export function trustedProxyHops(v: string | undefined): number {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "true" || s === "yes") return 1;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10) : 0;
}

/**
 * Klientens adress enligt headers, eller null om den inte går att lita på.
 *
 * Med N betrodda proxies är det den N:te adressen från höger i X-Forwarded-For som proxyn själv
 * har lagt till – allt till vänster om den kommer från klienten och kan vara förfalskat. Det
 * fungerar både när proxyn skriver över headern och när den lägger till sist
 * (`proxy_add_x_forwarded_for`).
 */
export function pickClientIp(xff: string | null | undefined, xRealIp: string | null | undefined, hops: number): string | null {
  if (hops <= 0) return null;
  const list = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = list.length > 0 ? list[Math.max(0, list.length - hops)] : xRealIp?.trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.[\]%a-zA-Z_-]+$/.test(ip)) return null;
  return ip.toLowerCase();
}
