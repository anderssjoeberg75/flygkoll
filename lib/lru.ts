/** Liten LRU-cache med TTL per post. Map behåller insättningsordning, så första nyckeln är äldst använd. */
export class LruCache<V> {
  private map = new Map<string, { at: number; v: V }>();
  constructor(private max: number) {}

  get(key: string, ttlMs: number, now = Date.now()): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (now - e.at >= ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // flytta sist = senast använd
    this.map.delete(key);
    this.map.set(key, e);
    return e.v;
  }

  set(key: string, v: V, now = Date.now()) {
    this.map.delete(key);
    this.map.set(key, { at: now, v });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }

  get size() {
    return this.map.size;
  }
}
